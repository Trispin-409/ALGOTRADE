import dotenv from "dotenv";
dotenv.config();

// IGNORE SSL ERRORS FOR METAAPI INFRASTRUCTURE (Required for agiliumtrade.agiliumtrade.ai domains)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import express from "express";
import cors from "cors";
import axios from "axios";
import FormData from "form-data";
import https from "https";
import crypto from "crypto";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import MetaApiModule from "metaapi.cloud-sdk/esm-node";
const MetaApi = typeof MetaApiModule === "function" ? MetaApiModule : (MetaApiModule as any).default || MetaApiModule;
import { adminSupabase } from "./src/lib/supabaseAdmin.ts";
import { getSymbolsCached } from "./src/lib/symbolCache.ts";

// TRADING CONTROLLER: Persistent Database & Lifecycle Interface (User-Isolated)
const TradingController = {
  async getEAStatus(accountId: string, userId: string) {
    if (!adminSupabase) return null;
    const { data, error } = await adminSupabase
      .from("ea_deployments")
      .select("*")
      .eq("account_id", accountId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return null;
    return data;
  },

  async createLease(userId: string, accountId: string, eaName: string, region: string) {
    if (!adminSupabase) return;
    // Composite check: Does THIS user already lease THIS account?
    const { data } = await adminSupabase.from("ea_leases")
      .select("id")
      .eq("account_id", accountId)
      .eq("user_id", userId)
      .maybeSingle();
      
    if (data) {
      await adminSupabase.from("ea_leases").update({ ea_name: eaName, region, status: 'DEPLOYED' }).eq("id", data.id);
    } else {
      const { error } = await adminSupabase.from("ea_leases").insert({ 
        user_id: userId, 
        account_id: accountId, 
        ea_name: eaName, 
        region, 
        status: 'DEPLOYED' 
      });
      if (error) throw new Error(`Lease creation failed: ${error.message}`);
    }
  },

  async updateHeartbeat(accountId: string, userId?: string) {
    if (!adminSupabase) return;
    let query = adminSupabase.from("ea_leases").update({ last_heartbeat: new Date().toISOString() }).eq("account_id", accountId);
    if (userId) query = query.eq("user_id", userId);
    await query;
  },

  async getActiveLeases(userId?: string) {
    if (!adminSupabase) return [];
    let query = adminSupabase.from("ea_leases").select("*");
    if (userId) query = query.eq("user_id", userId);
    const { data } = await query;
    return data || [];
  },

  async removeLease(accountId: string, userId?: string) {
    if (!adminSupabase) return;
    let query = adminSupabase.from("ea_leases").delete().eq("account_id", accountId);
    if (userId) query = query.eq("user_id", userId);
    await query;
  },

  async updateEAStatus(accountId: string, userId: string, deployed: boolean, status: string) {
    if (!adminSupabase) return;
    
    // Explicit ownership check before update to prevent cross-user account takeover
    const { data: existing } = await adminSupabase.from("ea_deployments").select("user_id").eq("account_id", accountId).maybeSingle();
    if (existing && existing.user_id !== userId) {
      console.warn(`[SECURITY] Cross-user updateEAStatus prevented for ${accountId}`);
      return;
    }

    const { error } = await adminSupabase
      .from("ea_deployments")
      .upsert({ user_id: userId, account_id: accountId, deployed, status, deployed_at: deployed ? new Date().toISOString() : null }, { onConflict: 'account_id' });
    if (error) console.error("Error updating EA state:", error);
  },

  async setAlgoRunning(accountId: string, userId: string, running: boolean) {
    if (!adminSupabase) return;
    
    // Explicit ownership check
    const { data: existing } = await adminSupabase.from("algo_sessions").select("user_id").eq("account_id", accountId).maybeSingle();
    if (existing && existing.user_id !== userId) {
      console.warn(`[SECURITY] Cross-user setAlgoRunning prevented for ${accountId}`);
      return;
    }

    await adminSupabase
      .from("algo_sessions")
      .upsert({ user_id: userId, account_id: accountId, running }, { onConflict: 'account_id' });
  }
};

const globalScope = globalThis as any;

// CRITICAL: Persistent SDK connection caches
// STRICT CONNECTION REGISTRY
const REGISTRY = {
  rpc: new Map<string, any>(),
  stream: new Map<string, any>(),
  locked: new Map<string, boolean>()
};

globalScope.METAAPI = globalScope.METAAPI || null;
globalScope.CONNECTIONS = REGISTRY.stream;
globalScope.LISTENERS = globalScope.LISTENERS || new Map();
globalScope.ACCOUNT_INFO_CACHE = globalScope.ACCOUNT_INFO_CACHE || new Map();
globalScope.ACCOUNT_CACHE = globalScope.ACCOUNT_CACHE || new Map();
globalScope.HISTORY_CACHE = globalScope.HISTORY_CACHE || new Map();
globalScope.RPC_CONNECTIONS = REGISTRY.rpc;
globalScope.ACCOUNT_READY = globalScope.ACCOUNT_READY || new Map();
globalScope.ACTIVE_POSITIONS = globalScope.ACTIVE_POSITIONS || new Map<string, Map<string, any>>();

const TRADING_JOURNAL_STORE: Map<string, any[]> = new Map();
const MAX_LOGS = 500;

let cachedProvisioningIp: string | null = null;

async function resolveProvisioningHost() {
  try {
    const { lookup } = await import('dns/promises');
    // MetaApi official provisioning domain is often agiliumtrade.agiliumtrade.ai
    const result = await lookup('mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai');
    cachedProvisioningIp = result.address;
    console.log(`[DNS] Provisioning host resolved to ${cachedProvisioningIp}`);
  } catch (err) {
    try {
      const { lookup } = await import('dns/promises');
      const result = await lookup('mt-provisioning-api-v1.agiliumtrade.ai');
      cachedProvisioningIp = result.address;
      console.log(`[DNS] Provisioning host (backup) resolved to ${cachedProvisioningIp}`);
    } catch (e) {
      console.warn(`[DNS] Failed to resolve provisioning host. Fallback to cache: ${cachedProvisioningIp}`);
    }
  }
}

// EA Journal Logging Utility
export function logMessage(accountId: string | null, level: string, message: string, metadata: any = {}, source: 'NODE_STRATEGY' | 'NODE_STRATEGY' | 'SYSTEM' = 'SYSTEM') {
  const log = {
    type: 'TRADING_JOURNAL',
    accountId,
    level,
    message,
    metadata,
    source,
    timestamp: new Date().toISOString()
  };
  
  if (accountId) {
    if (!TRADING_JOURNAL_STORE.has(accountId)) TRADING_JOURNAL_STORE.set(accountId, []);
    const arr = TRADING_JOURNAL_STORE.get(accountId)!;
    arr.push(log);
    if (arr.length > MAX_LOGS) {
      arr.shift();
    }
  }

  console.log(`[TRADING_JOURNAL][${level}] ${message}`, Object.keys(metadata).length ? metadata : '');
  broadcast(log);
}
globalScope.STREAM_INITIALIZED = globalScope.STREAM_INITIALIZED || new Map();
globalScope.STREAM_PENDING = globalScope.STREAM_PENDING || new Map();
globalScope.RPC_PENDING = globalScope.RPC_PENDING || new Map();
globalScope.SUBSCRIPTIONS = globalScope.SUBSCRIPTIONS || new Map<string, Set<WebSocket>>();
globalScope.ACTIVE_STREAMS = globalScope.ACTIVE_STREAMS || new Set<string>();
globalScope.RECOVERY_LOCK = globalScope.RECOVERY_LOCK || new Set<string>();

// TRADING SAFETY ENGINE
globalScope.READY_STATE = globalScope.READY_STATE || new Map<string, boolean>();
globalScope.STREAM_ACTIVE = globalScope.STREAM_ACTIVE || new Map<string, boolean>();
globalScope.LAST_TICK_TIME = globalScope.LAST_TICK_TIME || new Map<string, number>();
globalScope.EA_REGISTRY = globalScope.EA_REGISTRY || {};
globalScope.ALGO_RUNNING = globalScope.ALGO_RUNNING || new Map<string, boolean>();
globalScope.EXECUTION_MODES = globalScope.EXECUTION_MODES || new Map<string, 'EA' | 'STRATEGY'>();
globalScope.STREAM_FAILURES = globalScope.STREAM_FAILURES || new Map<string, number>();
globalScope.CONNECTION_FAILURES = globalScope.CONNECTION_FAILURES || new Map<string, number>();

// User-specific listing caches
globalScope.ACCOUNT_LIST_CACHE_BY_USER = globalScope.ACCOUNT_LIST_CACHE_BY_USER || new Map<string, any[]>();
globalScope.SYNC_IN_PROGRESS_BY_USER = globalScope.SYNC_IN_PROGRESS_BY_USER || new Set<string>();
globalScope.LAST_SYNC_TIME_BY_USER = globalScope.LAST_SYNC_TIME_BY_USER || new Map<string, number>();

globalScope.LATEST_CANDLES = globalScope.LATEST_CANDLES || new Map<string, any>();
globalScope.CANDLE_STORE = globalScope.CANDLE_STORE || {};
globalScope.EXECUTION_MODES = globalScope.EXECUTION_MODES || new Map<string, 'EA' | 'STRATEGY'>();
globalScope.LAST_TRADE_TIME = globalScope.LAST_TRADE_TIME || new Map<string, number>();
globalScope.STRATEGY_SETTINGS = globalScope.STRATEGY_SETTINGS || new Map<string, { symbol: string, lotSize: number, maxTrades: number }>();

// STREAM STATE ENGINE
globalScope.ACCOUNT_STATE = globalScope.ACCOUNT_STATE || new Map<string, string>();
globalScope.ACCOUNT_CACHE = globalScope.ACCOUNT_CACHE || new Map<string, any>();

globalScope.STREAM_READY = globalScope.STREAM_READY || new Map<string, boolean>();

async function closeConnection(accountId: string, state: "REDEPLOYING" | "RECONNECTING" | "DELETING" = "RECONNECTING") {
  if (state !== "DELETING" && globalScope.ACTIVE_POSITIONS?.has(accountId) && globalScope.ACTIVE_POSITIONS.get(accountId).size > 0) {
     console.log(`[SDK] Lifecycle safeguard triggered: prevent ${state} for ${accountId} while trades are active.`);
     return;
  }
  
  globalScope.ACCOUNT_STATE.set(accountId, state);
  
  // Hard Kill Streaming logic
  const connection = REGISTRY.stream.get(accountId);
  if (connection) {
    console.log(`[SDK] Explicitly closing stream connection for ${accountId} during ${state}...`);
    try { 
      await connection.close(); 
    } catch(e: any){
      console.warn(`[SDK] Error closing connection for ${accountId}: ${e.message}`);
    }
    REGISTRY.stream.delete(accountId);
    globalScope.STREAM_INITIALIZED.delete(accountId);
    globalScope.ACCOUNT_READY.delete(accountId);
    globalScope.READY_STATE.set(accountId, false);
    globalScope.STREAM_ACTIVE.set(accountId, false);
  }
  
  const rpcConnection = REGISTRY.rpc.get(accountId);
  if (rpcConnection) {
    console.log(`[SDK] Explicitly closing RPC connection for ${accountId} during ${state}...`);
    try { await rpcConnection.close(); } catch(e){}
    REGISTRY.rpc.delete(accountId);
  }

  // Clear mapped active streams for this account so watchdog drops them
  const streams = globalScope.ACTIVE_STREAMS;
  if (streams && streams instanceof Set) {
    for (const key of streams) {
      if (key.startsWith(`${accountId}:`)) {
        globalScope.STREAM_STATE.set(key, { ...globalScope.STREAM_STATE.get(key), status: "STREAM_LOCKED" });
      }
    }
  }
}
async function freezeStreamsForAccount(accountId: string, state: "REDEPLOYING" | "RECONNECTING" | "DELETING" = "REDEPLOYING") {
  return closeConnection(accountId, state);
}
globalScope.STREAM_STATE = globalScope.STREAM_STATE || new Map<string, any>(); // { status, type, lastHeartbeat }
globalScope.MARKET_STREAM_PENDING = globalScope.MARKET_STREAM_PENDING || new Map<string, Promise<any>>();
globalScope.LAST_STREAM_START = globalScope.LAST_STREAM_START || new Map<string, number>();
globalScope.ACCOUNT_LIST_CACHE = globalScope.ACCOUNT_LIST_CACHE || null;
globalScope.SYNC_IN_PROGRESS = globalScope.SYNC_IN_PROGRESS || false;

// TRADING SAFETY ENGINE
function assertReady(accountId: string) {
  if (!globalScope.READY_STATE.get(accountId)) throw new Error(`[GUARD] Account ${accountId} NOT READY`);
}

function assertStream(accountId: string) {
  if (!globalScope.STREAM_ACTIVE.get(accountId)) throw new Error(`[GUARD] Stream for ${accountId} NOT ACTIVE`);
}

function assertFreshTick(accountId: string) {
  const lastTick = globalScope.LAST_TICK_TIME.get(accountId) || 0;
  if (Date.now() - lastTick > 3000) throw new Error(`[GUARD] Market data for ${accountId} STALE (>3s)`);
}


function sanitizeError(err: any): string {
  let msg = String(err?.message || err);
  if (msg.includes('failed to authenticate') || msg.includes('Invalid account') || msg.includes('Account disabled') || msg.includes('Validation failed')) {
    return "Failed to authenticate with the broker. Please check your MT4/MT5 login, password, and server. Note: MT4/MT5 accounts can only be connected if credentials are correct.";
  }
  msg = msg.replace(/https?:\/\/[^\s]+/g, '');
  msg = msg.replace(/metaapi/ig, 'cloud gateway');
  msg = msg.replace(/MetaApi/ig, 'Cloud Gateway');
  msg = msg.replace(/agiliumtrade/ig, 'cloud gateway');
  return msg.trim();
}

import rateLimit from "express-rate-limit";

const app = express();
const PORT = 3000;

// Enable trust proxy so Express and express-rate-limit correctly resolve client IP behind reverse-proxies/nginx
app.set("trust proxy", true);

const tradingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100, 
  message: { error: "Too many requests, please try again later." },
  // Disable express-rate-limit validation entirely to bypass all proxy/forwarded header warning checks
  validate: false
});

app.use(cors());

// TRUSTED WEB ACTIVITY (TWA) DOMAIN VERIFICATION
app.use(
  "/.well-known",
  express.static(path.join(process.cwd(), "public/.well-known"), {
    setHeaders: (res) => {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    }
  })
);

app.get("/.well-known/assetlinks.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  const assetlinksPath = path.join(process.cwd(), "public", ".well-known", "assetlinks.json");
  res.sendFile(assetlinksPath);
});

app.use("/api/trade/", tradingLimiter);
app.use("/api/account/", tradingLimiter);


// AUTHENTICATION GUARD: Validate JWT and resolve user_id
async function getUserIdFromRequest(req: express.Request): Promise<string> {
  const authHeader = req.headers.authorization;
  if (!authHeader) throw new Error("Unauthorized: No token provided");
  const token = authHeader.replace("Bearer ", "");
  
  if (!adminSupabase) {
    console.error("[AUTH] Supabase admin client not initialized.");
    throw new Error("Internal Server Error: Auth service unavailable");
  }

  const { data, error } = await adminSupabase.auth.getUser(token);
  if (error || !data.user) {
    console.error("[AUTH] Supabase getUser error:", error?.message);
    throw new Error("Unauthorized: Invalid token");
  }
  return data.user.id;
}

// STRICT OWNERSHIP MIDDLEWARE
async function enforceOwnership(req: express.Request, res: express.Response, next: express.NextFunction) {
  const accountId = req.params.accountId || (req.body && req.body.accountId);
  if (!accountId) {
      return next();
  }
  
  try {
     const userId = await getUserIdFromRequest(req);
     console.log(`[AUTH CHECK] User ${userId} requested access to ${accountId}`);
     
     if (adminSupabase) {
         // Strict security checks
         const { data: deployment } = await adminSupabase.from("ea_deployments").select("user_id").eq("account_id", accountId).maybeSingle();
         if (deployment && deployment.user_id !== userId) {
             console.log(`[SECURITY ALERT] REJECTION: User ${userId} attempted to access foreign deployment ${accountId} (Actual Owner: ${deployment.user_id})`);
             return res.status(403).json({ error: "Access Denied: Foreign Account Request blocked." });
         }
         
         const { data: lease } = await adminSupabase.from("ea_leases").select("user_id").eq("account_id", accountId).maybeSingle();
         if (lease && lease.user_id !== userId) {
             console.log(`[SECURITY ALERT] REJECTION: User ${userId} attempted to access foreign lease ${accountId} (Actual Owner: ${lease.user_id})`);
             return res.status(403).json({ error: "Access Denied: Foreign Lease Execution blocked." });
         }
         
         console.log(`[AUTH SUCCESS] User ${userId} verified as owner of ${accountId}`);
     }
     next();
  } catch(e: any) {
     console.log(`[AUTH FAILURE] Access denied: ${e.message}`);
     res.status(401).json({ error: e.message || "Authentication Failed" });
  }
}

app.use(express.json());

// ENFORCE OWNERSHIP ON ALL ACCOUNT ROUTES
app.use("/api/account/:accountId", enforceOwnership);

const token = process.env.METAAPI_ADMIN_TOKEN || "";

// SAFE LISTENER COMPLIANCE WRAPPER
const createSafeMetaApiListener = (handlers: any) => {
  return {
    onSynchronizationStarted: handlers.onSynchronizationStarted || (() => {}),
    onPositionsSynchronized: handlers.onPositionsSynchronized || (() => {}),
    onPendingOrdersSynchronized: handlers.onPendingOrdersSynchronized || (() => {}),
    onHistoryOrdersSynchronized: handlers.onHistoryOrdersSynchronized || (() => {}),
    onPositionsReplaced: handlers.onPositionsReplaced || (() => {}),
    onPendingOrdersReplaced: handlers.onPendingOrdersReplaced || (() => {}),
    onDealsSynchronized: handlers.onDealsSynchronized || (() => {}),
    onHistoryOrderAdded: handlers.onHistoryOrderAdded || (() => {}),
    onCandlesUpdated: handlers.onCandlesUpdated || (() => {}),
    onTicksUpdated: handlers.onTicksUpdated || (() => {}),
    onSymbolPricesUpdated: handlers.onSymbolPricesUpdated || (() => {}),
    onSymbolPriceUpdated: handlers.onSymbolPriceUpdated || (() => {}),
    onQuotesUpdated: handlers.onQuotesUpdated || (() => {}),
    onSymbolSpecificationsUpdated: handlers.onSymbolSpecificationsUpdated || (() => {}),
    onSymbolSpecificationUpdated: handlers.onSymbolSpecificationUpdated || (() => {}),
    onBrokerConnectionStatusChanged: handlers.onBrokerConnectionStatusChanged || (() => {}),
    onHealthStatus: handlers.onHealthStatus || (() => {}),
    onStreamClosed: handlers.onStreamClosed || (() => {}),
    onStreamError: handlers.onStreamError || (() => {}),
    onDealAdded: handlers.onDealAdded || (() => {}),
    onDisconnected: handlers.onDisconnected || (() => {}),
    onConnected: handlers.onConnected || (() => {}),
    onPendingOrdersUpdated: handlers.onPendingOrdersUpdated || (() => {}),
    onPositionsUpdated: handlers.onPositionsUpdated || (() => {}),
    onAccountInformationUpdated: handlers.onAccountInformationUpdated || (() => {}),
    onOrdersUpdated: handlers.onOrdersUpdated || (() => {}),
    onOrderAdded: handlers.onOrderAdded || (() => {}),
    onOrderCompleted: handlers.onOrderCompleted || (() => {}),
    onDealIdUpdate: handlers.onDealIdUpdate || (() => {}),
    onSynchronizationFinished: handlers.onSynchronizationFinished || (() => {})
  };
};

// MARKET DATA MONITOR: Log health but trust SDK for self-healing
setInterval(async () => {
  const streams = globalScope.ACTIVE_STREAMS;
  if (!streams || !(streams instanceof Set)) {
    globalScope.ACTIVE_STREAMS = new Set();
    return;
  }

  for (const key of streams) {
    const [accountId] = key.split(':');
    const connection = REGISTRY.stream.get(accountId);
    if (!connection) continue;

    // Safely check state without triggering "not initialized" errors
    let isServerConnected = false;
    let isBrokerConnected = false;
    let isSynchronized = false;

    try {
      isServerConnected = connection.terminalState?.connected === true;
      isBrokerConnected = connection.terminalState?.connectedToBroker === true;
      isSynchronized = connection.synchronized === true;
    } catch (e) {
      // If terminalState is not ready, we skip this check and let SDK initialize
      continue;
    }
    
    if (!isServerConnected || !isBrokerConnected || !isSynchronized) {
      const now = Date.now();
      const lastRec = globalScope.LAST_MONITOR_RECOVERY?.get(accountId) || 0;
      
      console.log(`[MONITOR] ${accountId} status: [Server:${isServerConnected} Broker:${isBrokerConnected} Sync:${isSynchronized}].`);
      
      // If disconnected from server for > 60s, trigger a fresh connect attempt
      if (!isServerConnected && (now - lastRec > 60000)) {
         console.warn(`[MONITOR] [RECOVERY] Triggering fresh setupStreaming for ${accountId} due to persistent disconnection.`);
         globalScope.LAST_MONITOR_RECOVERY = globalScope.LAST_MONITOR_RECOVERY || new Map();
         globalScope.LAST_MONITOR_RECOVERY.set(accountId, now);
         
         // Clear old connection to force fresh setup
         REGISTRY.stream.delete(accountId);
         setupStreaming(accountId).catch(e => console.error(`[MONITOR] Recovery path failed for ${accountId}:`, e.message));
      }
      
      // If we are disconnected from broker for too long, try a manual poke
      if (isServerConnected && !isBrokerConnected) {
         try {
           const account = await metaapi.metatraderAccountApi.getAccount(accountId);
           if (account.connectionStatus !== 'CONNECTED' && account.state === 'DEPLOYED') {
             console.log(`[MONITOR] Triggering proactive broker connection for ${accountId}...`);
             account.connect().catch(() => {});
           } else if (account.state !== 'DEPLOYED') {
             console.log(`[MONITOR] Account ${accountId} is not deployed (state: ${account.state}). Syncing database...`);
             streams.delete(key); // Need streams from upper context
             await syncUndeployedState(accountId);
           }
         } catch(e) {}
      }
    }
  }
}, 30000); // Check every 30 seconds

// PURE SDK INITIALIZATION (Strict adherence to SDK defaults)
function getMetaApiInstance() {
  if (globalScope.METAAPI) return globalScope.METAAPI;
  
  if (token) {
    console.log(`[SDK] Initializing with token: ${token.slice(0, 5)}...${token.slice(-5)} (Length: ${token.length})`);
    const MetaApiClass = typeof MetaApi === "function" ? MetaApi : (MetaApi as any).default || MetaApi;
    const clientId = `AIS_NODE_${Math.random().toString(36).substring(7)}`;
    
    globalScope.METAAPI = new MetaApiClass(token, {
      clientId,
      domain: 'agiliumtrade.agiliumtrade.ai',
      requestTimeout: 300000, // Increased to 5 minutes for dedicated servers
      retryOpts: {
        maxRetries: 25, // More retries for dedicated servers
        minDelayInMs: 3000,
        maxDelayInMs: 60000
      }
    });
    console.log(`[SDK] MetaApi initialized: ${clientId}`);
    // Initial resolution attempt
    resolveProvisioningHost();
  } else {
    console.error("[SDK] CRITICAL FAIL: Missing METAAPI_ADMIN_TOKEN environment variable.");
    return null;
  }
  return globalScope.METAAPI;
}
const metaapi = getMetaApiInstance();

// Rate Limit Recovery & Concurrency Utility
const heavyOpLock = new Set<string>();
async function safeMetaApiCall(fn: () => Promise<any>, opName: string = 'GENERIC', retries = 3) {
  const accountId = opName.split(':')[1] || 'global';
  
  // Wait if this specific operation is already in progress for this account
  while (heavyOpLock.has(opName)) {
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  try {
    heavyOpLock.add(opName);
    // Add a base jitter to prevent "thundering herd" on startup
    await new Promise(resolve => setTimeout(resolve, Math.random() * 200));
    
    return await fn();
  } catch (err: any) {
    if (err.message?.includes("cpu credits") || err.metadata?.recommendedRetryTime) {
      if (retries > 0) {
        const waitTime = err.metadata?.recommendedRetryTime ? Number(err.metadata.recommendedRetryTime) * 1000 : 2000;
        console.warn(`[SDK RATE LIMIT] Cluster saturated for ${opName}. Waiting ${waitTime}ms before retry (${retries} attempts left)...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return await safeMetaApiCall(fn, opName, retries - 1);
      }
    }
    throw err;
  } finally {
    heavyOpLock.delete(opName);
  }
}

// Account Instance Caching Utility
async function getAccount(accountId: string) {
  if (globalScope.ACCOUNT_CACHE.has(accountId)) return globalScope.ACCOUNT_CACHE.get(accountId);
  if (!metaapi) throw new Error("SDK_NOT_INITIALIZED");
  const account = await metaapi.metatraderAccountApi.getAccount(accountId);
  globalScope.ACCOUNT_CACHE.set(accountId, account);
  return account;
}

// Ensure database state mirrors MetaApi undeployed reality
async function syncUndeployedState(accountId: string) {
  if (adminSupabase) {
    try {
      await adminSupabase.from("ea_deployments").update({ deployed: false, status: 'UNDEPLOYED' }).eq("account_id", accountId);
    } catch (e) {
      // Ignored
    }
    try {
      await adminSupabase.from("algo_sessions").update({ running: false }).eq("account_id", accountId);
    } catch (e) {
      // Ignored
    }
    try {
      await adminSupabase.from("mt_accounts").update({ connection_status: 'DISCONNECTED' }).eq("id", accountId);
    } catch (e) {
      // Ignored
    }
  }
  
  REGISTRY.stream.delete(accountId);
  REGISTRY.rpc.delete(accountId);
  globalScope.ACCOUNT_READY?.delete(accountId);
  globalScope.STREAM_PENDING?.delete(accountId);
  globalScope.LAST_RECONNECT_ATTEMPT?.delete(accountId);
  globalScope.DEAD_SESSIONS_TIMER?.delete(accountId);
  
  const subscriptions = globalScope.SUBSCRIPTIONS;
  if (subscriptions) subscriptions.delete(accountId);
  
  if (globalScope.ACTIVE_RECONNECTS && typeof globalScope.ACTIVE_RECONNECTS === 'number' && globalScope.ACTIVE_RECONNECTS > 0) {
    globalScope.ACTIVE_RECONNECTS--; // we can't reliably decrement unless we know we incremented, but better just ignore ACTIVE_RECONNECTS logic for cleanup or let it drain naturally
  }
}

// Connection Readiness Guard (Determinstic Readiness Tracking)
async function ensureAccountReady(accountId: string) {
  if (globalScope.ACCOUNT_READY.has(accountId)) {
    return globalScope.ACCOUNT_READY.get(accountId);
  }

  const readyPromise = (async () => {
    const account = await getAccount(accountId);

    console.log(`[ACCOUNT] Checking readiness for ${accountId}:`, {
      state: account.state,
      connectionStatus: account.connectionStatus
    });

    if (account.state !== 'DEPLOYED' || account.connectionStatus !== 'CONNECTED') {
      console.warn(`[ACCOUNT] ${accountId} is not active (state: ${account.state}, conn: ${account.connectionStatus}). Skipping auto-restore.`);
      
      if (account.state !== 'DEPLOYED') {
         await syncUndeployedState(accountId);
      } else {
         // Just basic cleanup if it's deployed but not connected
         REGISTRY.stream.delete(accountId);
         REGISTRY.rpc.delete(accountId);
         globalScope.ACCOUNT_READY?.delete(accountId);
         globalScope.STREAM_PENDING?.delete(accountId);
      }
      
      throw new Error(`ACCOUNT_NOT_READY: Account is not deployed and connected.`);
    }

    // 3. WAIT for broker connection (CRITICAL)
    const waitForBroker = async (retries = 3) => {
       for (let i = 0; i < retries; i++) {
          try {
             await account.waitConnected();
             return;
          } catch (e: any) {
             console.warn(`[ACCOUNT] waitConnected attempt ${i+1} for ${accountId} failed: ${e.message}`);
             if (i === retries - 1) throw e;
             await new Promise(r => setTimeout(r, 10000));
          }
       }
    };

    await waitForBroker(6);

    // 4. Verify live MetaApi state after wait
    if (account.connectionStatus !== 'CONNECTED') {
      console.warn(`[ACCOUNT] ${accountId} failed to connect to broker. Skipping restore.`);
      REGISTRY.stream.delete(accountId);
      REGISTRY.rpc.delete(accountId);
      globalScope.ACCOUNT_READY?.delete(accountId);
      globalScope.STREAM_PENDING?.delete(accountId);
      throw new Error(`ACCOUNT_NOT_READY: Account failed to connect to broker.`);
    }

    console.log(`[ACCOUNT] ${accountId} Connected to broker ✅`);

    return account;
  })();

  globalScope.ACCOUNT_READY.set(accountId, readyPromise);
  return readyPromise;
}

// RPC Connection SINGLETON (STRICT ADHERENCE)
const rpcLocks = new Map<string, Promise<any>>();

async function getRPCConnection(accountId: string) {
  const existing = REGISTRY.rpc.get(accountId);
  if (existing && !existing.isClosed) {
    try {
      try {
        await existing.waitSynchronized({ timeoutInSeconds: 30 });
      } catch (e: any) {
        console.warn(`[SDK_RPC] waitSynchronized warning: ${e.message}`);
      }
      return existing;
    } catch (e) {
      console.warn(`[SDK_RPC] RPC connection stale for ${accountId}, reconnecting...`);
    }
  }

  if (rpcLocks.has(accountId)) {
    return rpcLocks.get(accountId);
  }

  const creationPromise = (async () => {
    try {
      console.log(`[SDK_RPC] Creating RPC connection for ${accountId}...`);
      const account = await metaapi.metatraderAccountApi.getAccount(accountId);
      
      // Safety check: Don't block RPC creation if account is not even deployed
      if (account.state !== 'DEPLOYED') {
         console.warn(`[SDK_RPC] Account ${accountId} is ${account.state}. Aborting RPC connection.`);
         await syncUndeployedState(accountId);
         throw new Error("ACCOUNT_NOT_DEPLOYED");
      }

      const rpc = account.getRPCConnection();

      await rpc.connect();
      try {
        // Shorter sync timeout for initial RPC to avoid blocking API threads too long
        await rpc.waitSynchronized({ timeoutInSeconds: 60 });
      } catch(e: any) {
        console.warn(`[SDK_RPC] Wait synchronized warning: ${e.message}`);
      }

      REGISTRY.rpc.set(accountId, rpc);
      return rpc;
    } finally {
      rpcLocks.delete(accountId);
    }
  })();

  rpcLocks.set(accountId, creationPromise);
  return creationPromise;
}

// ACCOUNT INFORMATION VIA terminalState (STRICT ADHERENCE)
async function getAccountInfo(accountId: string) {
  const connection = await setupStreaming(accountId);
  
  // Official SDK Method: access account information from terminal state
  const info = connection.terminalState.accountInformation;
  
  // DO NOT BLOCK if undefined, return empty/placeholders
  return {
    balance: info?.balance ?? 0,
    equity: info?.equity ?? 0,
    currency: info?.currency ?? 'USD'
  };
}

// Graceful Shutdown
const cleanup = async () => {
  console.log('[SDK] Shutting down. Cleaning up connections...');
  
  const allAccountIds = new Set([
      ...REGISTRY.stream.keys(),
      ...REGISTRY.rpc.keys()
  ]);

  for (const accountId of allAccountIds) {
      await closeConnection(accountId, "DELETING");
  }
  
  if (globalScope.METAAPI) {
    try {
      console.log('[SDK] Closing MetaApi instance');
      await globalScope.METAAPI.close();
    } catch (e) {}
  }
  process.exit(0);
};

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

// Resource Tracker for long-lived instance management
const subscriptions = globalScope.SUBSCRIPTIONS;

// SDK SYNCHRONIZATION LISTENER (STRICT ADHERENCE TO EXAMPLE)
function createMetaApiListener(accountId: string) {
  let lastReconnect = 0;
  const handler = {
    onConnected: async (instanceIndex: string) => {
      const now = Date.now();
      const lastRec = globalScope.LAST_CONN_LOG?.get(accountId) || 0;
      if (now - lastRec > 60000) {
        console.log(`[SDK] CONNECTED to server ${instanceIndex} for ${accountId}`);
        logMessage(accountId, "INFO", "SDK server connection established", {}, 'SYSTEM');
        if (!globalScope.LAST_CONN_LOG) globalScope.LAST_CONN_LOG = new Map();
        globalScope.LAST_CONN_LOG.set(accountId, now);
      }
      broadcast({ type: 'status:update', accountId, status: 'CONNECTED_TO_SERVER' });
    },
    onDisconnected: async (instanceIndex: string) => {
      const now = Date.now();
      const lastRec = globalScope.LAST_DISCONN_LOG?.get(accountId) || 0;
      if (now - lastRec > 60000) {
        console.warn(`[SDK] DISCONNECTED from server ${instanceIndex} for ${accountId}`);
        logMessage(accountId, "INFO", "SDK server connection lost (Recovering...)", {}, 'SYSTEM');
        if (!globalScope.LAST_DISCONN_LOG) globalScope.LAST_DISCONN_LOG = new Map();
        globalScope.LAST_DISCONN_LOG.set(accountId, now);
      }
      broadcast({ type: 'status:update', accountId, status: 'DISCONNECTED_FROM_SERVER' });
      
      // Proactive hint to SDK to keep looking for connection
      const connection = REGISTRY.stream.get(accountId);
      if (connection && !connection.isClosed && !connection.synchronized) {
         console.log(`[SDK] [RECONNECT_WATCHDOG] Connection ${accountId} is disconnected but open. Monitoring self-healing...`);
      }
    },
    onError: async (error: any) => {
      const msg = error?.message || String(error);
      console.error(`[SDK] [STREAM_ERROR] Account ${accountId}: ${msg}`);
      logMessage(accountId, "ERROR", `Stream Error: ${msg}`, {}, 'SYSTEM');
      
      if (msg.includes('transport close') || msg.includes('lost connection')) {
         console.warn(`[SDK] [RECOVERY] Critical transport failure for ${accountId}. Releasing connection for fresh setup.`);
         REGISTRY.stream.delete(accountId); // Force setupStreaming to create a fresh one next time
      }
    },
    onStreamError: async (error: any) => {
       const msg = error?.message || String(error);
       console.error(`[SDK] [STREAM_ERROR_V2] Account ${accountId}: ${msg}`);
       if (msg.includes('transport close')) {
          REGISTRY.stream.delete(accountId);
       }
    },
    onStreamClosed: async () => {
       console.log(`[SDK] [STREAM_CLOSED] Account ${accountId}. Clearing registry.`);
       REGISTRY.stream.delete(accountId);
       globalScope.STREAM_READY.set(accountId, false);
    },
    onBrokerConnectionStatusChanged: async (instanceIndex: string, connected: boolean) => {
      console.log(`[SDK] Broker connection status for ${accountId}: ${connected ? 'CONNECTED' : 'DISCONNECTED'}`);
      logMessage(accountId, connected ? "SUCCESS" : "INFO", `Broker ${connected ? 'Connected' : 'Disconnected (Booting/Sleeping)'}`, {}, 'SYSTEM');
      broadcast({ type: 'status:update', accountId, status: connected ? 'READY' : 'OFFLINE_FROM_BROKER' });
      globalScope.READY_STATE.set(accountId, connected);
    },
    onSynchronizationStarted: async (instanceIndex: string) => {
      console.log(`[SDK] Sync started on ${instanceIndex} for ${accountId}`);
      broadcast({ type: 'status:update', accountId, status: 'SYNCING' });
    },
    onSynchronizationFinished: async (instanceIndex: string) => {
      const source = 'NODE_STRATEGY';
      console.log(`[SDK] ✅ SYNCHRONIZED for ${accountId}`);
      logMessage(accountId, "SUCCESS", "Account synchronization finished", {}, source);
      
      globalScope.STREAM_READY.set(accountId, true);
      REGISTRY.locked.set(accountId, true);

      // BROADCAST AUTHORITY: Signal frontend to enable trading and load data
      broadcast({ 
        type: 'ACCOUNT_READY', 
        accountId,
        status: 'READY'
      });
      broadcast({ type: 'status:update', accountId, status: 'READY' });
      broadcast({ type: 'SYNC_READY', accountId });
      
      const positions = globalScope.ACTIVE_POSITIONS?.get(accountId) ? Array.from(globalScope.ACTIVE_POSITIONS.get(accountId).values()) : [];
      broadcast({ type: 'POSITIONS_SNAPSHOT', accountId, data: positions });
      
      // If we have an active stream intent, execute it now
      triggerActiveIntents(accountId);
    },
    onAccountInformationUpdated: async (instanceIndex: string, accountInfo: any) => {
      console.log(`[SDK] Account update for ${accountId}`);
      const connection = REGISTRY.stream.get(accountId);

      // Use SDK state as absolute source of truth if available, otherwise use provided event data
      const terminalInfo = connection?.terminalState?.accountInformation;
      const targetInfo = terminalInfo || accountInfo;
      
      broadcast({ 
        type: 'account:update', 
        accountId, 
        balance: targetInfo.balance ?? null,
        equity: targetInfo.equity ?? null,
        currency: targetInfo.currency || 'USD'
      });
    },
    onSymbolPricesUpdated: async (instanceIndex: string, prices: any[]) => {
      if (prices && prices.length > 0) {
        prices.forEach(price => {
          broadcast({ 
            type: 'price:update', 
            accountId, 
            symbol: price.symbol, 
            bid: price.bid, 
            ask: price.ask, 
            time: price.time 
          });
        });
      }
    },
    onSymbolPriceUpdated: async (instanceIndex: string, price: any) => {
      // Temporarily throttle logs to avoid spam
      const now = Date.now();
      const lastRec = globalScope.LAST_PRICE_LOG?.get(accountId) || 0;
      if (now - lastRec > 5000) {
          console.log(`[SDK] Received price update for ${price.symbol}: bid=${price.bid} ask=${price.ask}`);
          if (!globalScope.LAST_PRICE_LOG) globalScope.LAST_PRICE_LOG = new Map();
          globalScope.LAST_PRICE_LOG.set(accountId, now);
      }
      broadcast({ 
        type: 'price:update', 
        accountId, 
        symbol: price.symbol, 
        bid: price.bid, 
        ask: price.ask, 
        time: price.time 
      });
    },
    onQuotesUpdated: async (instanceIndex: string, quotes: any[]) => {
      if (quotes && quotes.length > 0) {
        const price = quotes[quotes.length - 1]; // get latest
        const now = Date.now();
        const lastRec = globalScope.LAST_QUOTE_LOG?.get(accountId) || 0;
        if (now - lastRec > 5000) {
           console.log(`[SDK] Received quotes update for ${price.symbol}: bid=${price.bid} ask=${price.ask}`);
           if (!globalScope.LAST_QUOTE_LOG) globalScope.LAST_QUOTE_LOG = new Map();
           globalScope.LAST_QUOTE_LOG.set(accountId, now);
        }
        broadcast({ 
          type: 'price:update', 
          accountId, 
          symbol: price.symbol, 
          bid: price.bid, 
          ask: price.ask, 
          time: price.time 
        });
      }
    },
    onCandlesUpdated: async (instanceIndex: string, candles: any[], symbol: string) => {
        if (!candles || candles.length === 0) {
          console.warn(`[SDK] No candles received yet for ${symbol}`);
        }
        if (candles && candles.length > 0) {
            const lastCandle = candles[candles.length - 1];
            
            // Fix 1: Hard Lock Candle Stream (Persistence buffer)
            const key = `${accountId}:${symbol}`;
            
            if (!globalScope.CANDLE_STORE[accountId]) globalScope.CANDLE_STORE[accountId] = {};
            if (!globalScope.CANDLE_STORE[accountId][symbol]) globalScope.CANDLE_STORE[accountId][symbol] = [];
            
            const buffer = globalScope.CANDLE_STORE[accountId][symbol];
            const lastStored = buffer.length > 0 ? buffer[buffer.length - 1] : null;

            if (!lastStored || new Date(lastCandle.time).getTime() > new Date(lastStored.time).getTime()) {
                buffer.push(lastCandle);
                if (buffer.length > 300) buffer.shift();
                
                // Also keep LATEST_CANDLES map updated for compatibility
                globalScope.LATEST_CANDLES.set(key, buffer);

                const mode = 'STRATEGY';
                const source = 'NODE_STRATEGY';
                logMessage(accountId, "DATA", `[${mode}] Market data flow updated`, {
                  count: buffer.length,
                  symbol,
                  time: lastCandle.time
                }, source);
            }

            broadcast({ 
              type: 'CANDLE', 
              accountId, 
              symbol: symbol, 
              candle: lastCandle 
            });
        }
    },
    onPositionsUpdated: async (instanceIndex: string, positions: any[]) => {
      const pMap = new Map();
      positions.forEach(p => pMap.set(p.id, p));
      globalScope.ACTIVE_POSITIONS.set(accountId, pMap);
      broadcast({ type: 'POSITIONS_SNAPSHOT', accountId, data: positions });
    },
    onPositionUpdated: async (instanceIndex: string, position: any) => {
      if (!globalScope.ACTIVE_POSITIONS.has(accountId)) {
        globalScope.ACTIVE_POSITIONS.set(accountId, new Map());
      }
      const pMap = globalScope.ACTIVE_POSITIONS.get(accountId);
      const isNew = !pMap.has(position.id);
      pMap.set(position.id, position);
      
      const source = 'NODE_STRATEGY';
      if (isNew) {
         logMessage(accountId, 'EXECUTION', `Position Opened ${position.symbol} ${position.volume}`, { id: position.id }, source);
      }
      broadcast({ type: 'POSITION_UPDATE', accountId, data: position });
    },
    onPositionRemoved: async (instanceIndex: string, positionId: string) => {
      if (globalScope.ACTIVE_POSITIONS.has(accountId)) {
        const pMap = globalScope.ACTIVE_POSITIONS.get(accountId);
        pMap.delete(positionId);
      }
      
      const source = 'NODE_STRATEGY';
      logMessage(accountId, 'INFO', `Position Closed ${positionId}`, {}, source);
      broadcast({ type: 'POSITION_REMOVED', accountId, data: { id: positionId } });
    },
    onHistoryOrderAdded: async (instanceIndex: string, historyOrder: any) => {
      broadcast({ type: 'HISTORY_ORDER_ADDED', accountId, data: historyOrder });
    },
    onDealAdded: async (instanceIndex: string, deal: any) => {
      broadcast({ type: 'trade:update', accountId, deal });
    }
  };

  return new Proxy(handler, {
    get(target, prop: string) {
      if (prop in target) {
        return (target as any)[prop];
      }
      // Return a no-op function for any other called listener method
      return async () => {};
    }
  });
}

function createEAExpertLogListener(accountId: string) {
  const handler = {
    onLog: async (log: any) => {
      logMessage(accountId, log.type === 'error' ? 'ERROR' : 'INFO', `[EA] ${log.message}`, { 
        ea: log.expertAdvisorName, 
        symbol: log.symbol,
        time: log.time 
      }, 'NODE_STRATEGY');
    },
    onError: async (error: any) => {
      logMessage(accountId, 'ERROR', `EA Terminal Error: ${error.message}`, {}, 'NODE_STRATEGY');
    }
  };

  return new Proxy(handler, {
    get(target, prop: string) {
      if (prop in target) return (target as any)[prop];
      return async () => {};
    }
  });
}

let globalWss: WebSocketServer | null = null;

const broadcast = (data: any) => {
  const targetAccountId = data.accountId;

  if (targetAccountId) {
    // Exact route isolation: Only send to WS clients expressly subscribed to this account ID
    const accountClients = subscriptions.get(targetAccountId);
    if (accountClients) {
      accountClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(data));
        }
      });
    }
  }
};

// SDK CONNECTION MANAGER (STRICT ADHERENCE TO EXAMPLE)
async function setupStreaming(accountId: string) {
  if (!metaapi) throw new Error("SDK_NOT_INITIALIZED");
  
  // LOCK ENFORCEMENT: If already connected and not closed, reuse.
  const existing = REGISTRY.stream.get(accountId);
  if (existing && !existing.isClosed) {
    try {
      if (existing.synchronized && existing.terminalState?.connectedToBroker) return existing;
      try {
         await existing.waitSynchronized({ timeoutInSeconds: 30 });
      } catch(e: any) {
         console.warn(`[SDK] waitSynchronized warning: ${e.message}`);
      }
      return existing;
    } catch (e) {
      console.warn(`[SDK] Error reusing connection for ${accountId}, attempting fresh connect...`);
      // Fall through to create new connection if waitSynchronized fails or throws "not initialized"
    }
  }

  if (globalScope.STREAM_PENDING.has(accountId)) {
    return globalScope.STREAM_PENDING.get(accountId);
  }

  const promise = (async () => {
    try {
      const account = await ensureAccountReady(accountId);
      const connection = account.getStreamingConnection();
      
      // 1. Add Listener
      connection.addSynchronizationListener(createMetaApiListener(accountId));
      
      // 1.1 Add Expert Log Listener (Guarded to prevent TypeError)
      const eaListener = createEAExpertLogListener(accountId);
      if (typeof (connection as any).addExpertAdvisorLogListener === 'function') {
        (connection as any).addExpertAdvisorLogListener(eaListener);
      } else if (typeof (connection as any).addMetatraderExpertAdvisorLogListener === 'function') {
        (connection as any).addMetatraderExpertAdvisorLogListener(eaListener);
      } else {
        console.warn(`[SDK] Expert Advisor Log Listening not supported by this connection object for ${accountId}`);
      }
      
      // 2. Connect
      console.log(`[SDK] Connecting streaming client: ${accountId}...`);
      await connection.connect();
      
      // 3. Wait Synchronized
      console.log(`[SDK] Waiting for synchronization: ${accountId}...`);
      try {
        await connection.waitSynchronized({ timeoutInSeconds: 60 });
      } catch(e: any) {
        console.warn(`[SDK] waitSynchronized warning: ${e.message}`);
      }

      // EXTRA: Ensure true broker connectivity before considering ready
      await waitForTrueConnection(connection, accountId);
      
      console.log(`[SDK] Streaming established successfully for ${accountId}`);
      REGISTRY.stream.set(accountId, connection);
      
      return connection;
    } catch (err: any) {
      console.error(`[SDK] Connection FAILED for ${accountId}:`, err);
      // FORCE REGISTRY CLEANUP
      REGISTRY.stream.delete(accountId);
      globalScope.STREAM_PENDING.delete(accountId);
      throw err;
    } finally {
      globalScope.STREAM_PENDING.delete(accountId);
    }
  })();

  globalScope.STREAM_PENDING.set(accountId, promise);
  return promise;
}

// FRED API PROXY
app.get("/api/fred", async (req, res) => {
  const { series_id } = req.query;
  try {
    const response = await axios.get(`https://api.stlouisfed.org/fred/series/observations?series_id=${series_id}&api_key=3f7616a1fc27586c2a083e232aec6a8f&file_type=json&sort_order=desc&limit=2`);
    res.json(response.data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// INFRA HEALTH (Strict SDK Heartbeat)
app.get("/api/infra-health", (req, res) => {
  if (!metaapi) return res.status(503).json({ status: 'BOOTING', reason: 'SDK_INITIALIZING' });
  res.json({ status: 'CONNECTED', node: 'native-v2' });
});

// UI ACCESS (Token masking)
app.get("/api/token", (req, res) => {
  if (!token) return res.json({ token: null });
  res.json({ token: `${token.slice(0, 8)}...` });
});

// Market Data Subscription Helper (Locked Singleton Pattern)
async function waitForTrueConnection(connection: any, accountId: string) {
  console.log(`[STABILIZER] Hard synchronization barrier engaged for ${accountId}...`);
  try {
    await connection.waitSynchronized({ timeoutInSeconds: 300 });
  } catch(e: any) {
    console.warn(`[STABILIZER] waitSynchronized barrier warning: ${e.message}`);
  }

  // Retry logic: 5 minutes timeout for cold starts/broker reconnects
  let retries = 0;
  let consecutiveSuccesses = 0;
  const REQUIRED_SUCCESSES = 2; // Must be stable for 2 cycles
  const TIMEOUT = 300000;
  const INTERVAL = 5000;
  const maxRetries = Math.floor(TIMEOUT / INTERVAL);

  while (retries < maxRetries) {
    const isTerminalConnected = connection.terminalState?.connected === true;
    const isBrokerConnected = connection.terminalState?.connectedToBroker === true;
    const isSynchronized = connection.synchronized === true;
    
    // Check health monitor if available
    const healthStatus = connection.healthMonitor?.healthStatus || {};
    const isHealthy = healthStatus.connected === true;

    if (isTerminalConnected && isBrokerConnected && isSynchronized) {
      consecutiveSuccesses++;
      if (consecutiveSuccesses >= REQUIRED_SUCCESSES) {
        console.log(`[STABILIZER] SUCCESS: Broker confirmed STABLE for ${accountId} (Attempt ${retries + 1})`);
        // Final grace period for internal SDK state to settle - increased for stability
        await new Promise(r => setTimeout(r, 5000));
        return true;
      }
      console.log(`[STABILIZER] Readiness detected, confirming stability... (${consecutiveSuccesses}/${REQUIRED_SUCCESSES})`);
    } else {
      consecutiveSuccesses = 0;
    }

    if (retries % 6 === 0) { // Log every 30s
       console.log(`[STABILIZER] Waiting for readiness... [Term:${isTerminalConnected} Broker:${isBrokerConnected} Sync:${isSynchronized} Healthy:${isHealthy}] (Attempt ${retries + 1}/${maxRetries})`);
    }

    // Explicitly check for unrecoverable errors in terminalState if any
    if (connection.terminalState?.error) {
       console.warn(`[STABILIZER] Terminal reported error for ${accountId}: ${connection.terminalState.error}`);
    }

    await new Promise(r => setTimeout(r, INTERVAL));
    retries++;
  }

  throw new Error(`[STABILIZER] TIMEOUT: Account ${accountId} failed to achieve TRUE READY state after 5 minutes. Check if credentials are correct or broker is down.`);
}

async function triggerActiveIntents(accountId: string) {
  if (!globalScope.STREAM_INTENTS) return;
  
  for (const [key, intent] of globalScope.STREAM_INTENTS.entries()) {
    if (intent.accountId === accountId) {
      console.log(`[SDK] Triggering intent for synchronized account: ${key}`);
      startMarketStream(intent.accountId, intent.symbol, intent.timeframe).catch(e => {
        console.error(`[SDK] Intent trigger failed for ${key}:`, e.message);
      });
    }
  }
}

async function safeSubscribe(connection: any, symbol: string, timeframe: string, accountId: string) {
  // IGNORE incomplete symbols (users typing) to prevent broker error spam
  if (!symbol || symbol.length < 3) {
    console.log(`[STREAM] Skipping subscription for partial/invalid symbol: "${symbol}"`);
    return;
  }

  for (let i = 0; i < 15; i++) {
    try {
      // Check broker connection state before every attempt
      if (!connection.terminalState || connection.terminalState.connectedToBroker !== true || connection.synchronized !== true) {
        console.log(`[STREAM] Broker disconnected or syncing for ${accountId}. Waiting... (Attempt ${i+1})`);
        await new Promise(r => setTimeout(r, 10000));
        continue;
      }

      await connection.subscribeToMarketData(symbol, [
        { type: 'quotes' },
        { type: 'candles', timeframe }
      ]);
      console.log(`[STREAM] Subscribed successfully to ${symbol} on ${accountId}`);
      return;
    } catch (err: any) {
      const errorMsg = err.message?.toLowerCase() || "";
      const isNotConnected = errorMsg.includes('not connected to broker') || 
                             errorMsg.includes('not connected to broker yet') ||
                             errorMsg.includes('region') || // Handle the "region mismatch" hint from MetaApi
                             errorMsg.includes('transport close');
      const isTimeout = errorMsg.includes('timeout');
      const isSymbolNotExist = errorMsg.includes('does not exist') || errorMsg.includes('invalid symbol');
      const isNotDeployed = errorMsg.includes('no accounts deployed yet') || errorMsg.includes('undeployed');
      
      console.warn(`[STREAM] Subscription attempt ${i + 1} failed for ${symbol} on ${accountId}: ${err.message}.`);
      
      if (isNotDeployed) {
         console.error(`[STREAM] Abortion: Account ${accountId} is not fully deployed on backend or has undeployed. Closing stale connection.`);
         await closeConnection(accountId, "REDEPLOYING");
         throw new Error("ACCOUNT_NOT_DEPLOYED");
      }
      
      if (isSymbolNotExist) {
        console.warn(`[STREAM] Symbol ${symbol} not found. Attempting fuzzy match recovery...`);
        try {
           const fullSymbols = await getSymbolsCached(metaapi, accountId);

           const match = fullSymbols.find((s: string) => s.startsWith(symbol) || s.endsWith(symbol));
           
           if (match && match !== symbol) {
              console.log(`[STREAM] Fuzzy match found: ${match}. Retrying with valid broker symbol...`);
              symbol = match;
              continue; 
           }
        } catch (e: any) {
           console.error("[STREAM] Fuzzy match attempt failed totally:", e.message);
        }

        console.error(`[STREAM] Abortion: Symbol ${symbol} does not exist for account ${accountId}.`);
        throw new Error(`Symbol ${symbol} does not exist on this broker.`);
      }
      
      const isRateLimit = err.message?.toLowerCase().includes('rate limit') || err.message?.toLowerCase().includes('saturated');
      
      if (isNotConnected || isTimeout) {
        console.log(`[STREAM] Connectivity issue for ${accountId} (${isTimeout ? 'Timeout' : 'Disconnected'}). Waiting for stabilization...`);
        // Proactive waitSynchronized to ensure SDK and server are aligned
        try {
          await connection.waitSynchronized({ timeoutInSeconds: 90 });
        } catch (e: any) {
          console.warn(`[STREAM] waitSynchronized recovery failed/timed out: ${e.message}`);
        }
        
        // Trigger explicit session reconnect if disconnected and not recently tried
        const now = Date.now();
        const lastReconnect = globalScope.LAST_RECONNECT_ATTEMPT?.get(accountId) || 0;
        if (now - lastReconnect > 60000) {
          try {
            if (!globalScope.LAST_RECONNECT_ATTEMPT) globalScope.LAST_RECONNECT_ATTEMPT = new Map();
            globalScope.LAST_RECONNECT_ATTEMPT.set(accountId, now);
            
            // Limit reconnect concurrency to 3
            if (!globalScope.ACTIVE_RECONNECTS) globalScope.ACTIVE_RECONNECTS = 0;
            
            if (globalScope.ACTIVE_RECONNECTS < 3) {
              globalScope.ACTIVE_RECONNECTS++;
              try {
                const account = await metaapi.metatraderAccountApi.getAccount(accountId);
                if (account.connectionStatus !== 'CONNECTED') {
                   console.log(`[STREAM] Triggering account reconnect for ${accountId}...`);
                   await account.connect();
                   await account.waitConnected();
                }
              } finally {
                globalScope.ACTIVE_RECONNECTS--;
              }
            } else {
              console.log(`[STREAM] Skipping reconnect for ${accountId} due to concurrency limits.`);
            }
          } catch(e) {}
        }
      }

      const backoff = isRateLimit ? 20000 : Math.min(2000 * Math.pow(1.6, i), 30000);
      await new Promise(r => setTimeout(r, backoff));
    }
  }
  throw new Error('Subscription failed after multiple retries due to persistent broker connectivity issues or server cold-start timeouts');
}

// HELPER: RSI Calculation for Real Strategy Analysis
// --- PATTERN DETECTION ENGINE (MQL5 PORT) ---
function checkDoji(candle: any): boolean {
  const body = Math.abs(candle.open - candle.close);
  const range = candle.high - candle.low;
  if (range <= 0) return false;
  return (body / range < 0.12);
}

function checkHammer(candle: any): boolean {
  const body = Math.abs(candle.open - candle.close);
  const range = candle.high - candle.low;
  if (range <= 0) return false;
  const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
  const upperShadow = candle.high - Math.max(candle.open, candle.close);
  return (body / range < 0.35 && lowerShadow >= 1.8 * body && upperShadow <= 0.6 * body);
}

function checkInvertedHammer(candle: any): boolean {
  const body = Math.abs(candle.open - candle.close);
  const range = candle.high - candle.low;
  if (range <= 0) return false;
  const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
  const upperShadow = candle.high - Math.max(candle.open, candle.close);
  return (body / range < 0.35 && upperShadow >= 1.8 * body && lowerShadow <= 0.6 * body);
}

function checkBullishEngulfing(prev: any, curr: any): boolean {
  if (!prev || !curr) return false;
  // A candle that swallows the previous candle's body or range
  const prevBody = Math.abs(prev.open - prev.close);
  const currBody = Math.abs(curr.open - curr.close);
  const engulfs = curr.close > curr.open && prev.close < prev.open && curr.close >= prev.open && curr.open <= prev.close;
  return engulfs && (currBody > prevBody * 0.8);
}

function checkBearishEngulfing(prev: any, curr: any): boolean {
  if (!prev || !curr) return false;
  const engulfs = curr.close < curr.open && prev.close > prev.open && curr.close <= prev.open && curr.open >= prev.close;
  const prevBody = Math.abs(prev.open - prev.close);
  const currBody = Math.abs(curr.open - curr.close);
  return engulfs && (currBody > prevBody * 0.8);
}

function getPatternPolarity(name: string): number {
  const bull = ['hammer', 'bullish engulfing', 'inverted hammer', 'morning star'];
  const bear = ['shooting star', 'bearish engulfing', 'dark cloud cover', 'evening star'];
  if (bull.includes(name)) return 1;
  if (bear.includes(name)) return -1;
  return 0;
}

// Analysis Storage
const ANALYSIS_STORE: Record<string, any> = {};

function performPatternAnalysis(accountId: string, symbol: string, candles: any[]) {
  if (!candles || candles.length < 20) return null;
  
  const minPrice = Math.min(...candles.map(c => c.low));
  const maxPrice = Math.max(...candles.map(c => c.high));
  const range = maxPrice - minPrice;
  const binCount = 40;
  const binSize = range / binCount;
  
  const bins = new Array(binCount).fill(0);
  const detections: any[] = [];
  
  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i];
    const prev = candles[i-1];
    
    let pattern = '';
    if (checkDoji(curr)) pattern = 'doji';
    else if (checkHammer(curr)) pattern = 'hammer';
    else if (checkInvertedHammer(curr)) pattern = 'inverted hammer';
    else if (checkBullishEngulfing(prev, curr)) pattern = 'bullish engulfing';
    else if (checkBearishEngulfing(prev, curr)) pattern = 'bearish engulfing';
    
    if (pattern) {
      const polarity = getPatternPolarity(pattern);
      const pricePoint = polarity > 0 ? curr.low : (polarity < 0 ? curr.high : (curr.high + curr.low) / 2);
      const binIdx = Math.min(binCount - 1, Math.max(0, Math.floor((pricePoint - minPrice) / binSize)));
      
      const recencyWeight = Math.pow(0.5, (candles.length - 1 - i) / 50);
      bins[binIdx] += recencyWeight;
      
      detections.push({
        time: curr.time,
        pattern,
        price: pricePoint,
        polarity
      });
    }
  }
  
  // Detect Zones
  const zones: any[] = [];
  const maxBinValue = Math.max(...bins);
  const threshold = Math.max(0.01, maxBinValue * 0.25); // Lower threshold for more zones
  
  for (let b = 0; b < bins.length; b++) {
    if (bins[b] >= threshold) {
      zones.push({
        low: minPrice + b * binSize,
        high: minPrice + (b + 1) * binSize,
        strength: maxBinValue > 0 ? bins[b] / maxBinValue : 1,
        isSupport: (minPrice + (b + 0.5) * binSize) < candles[candles.length - 1].close,
        isConsolidation: false
      });
    }
  }

  // Backup: Detect Pivot Zones if few patterns found
  if (zones.length < 5) {
    const candlesSortedByHigh = [...candles].sort((a, b) => b.high - a.high).slice(0, 8);
    const candlesSortedByLow = [...candles].sort((a, b) => a.low - b.low).slice(0, 8);
    
    candlesSortedByHigh.forEach(h => {
        zones.push({ low: h.high * 0.9997, high: h.high * 1.0003, strength: 0.4, isSupport: false, isConsolidation: false });
    });
    candlesSortedByLow.forEach(l => {
        zones.push({ low: l.low * 0.9997, high: l.low * 1.0003, strength: 0.4, isSupport: true, isConsolidation: false });
    });
  }

  // Detect Consolidation: Tightest range in last 20 candles
  const lastCandle = candles[candles.length - 1];
  const last20 = candles.slice(-20);
  const cMin = Math.min(...last20.map(c => c.low));
  const cMax = Math.max(...last20.map(c => c.high));
  if ((cMax - cMin) / lastCandle.close < 0.002) { // 0.2% range relative to price
    zones.push({
      low: cMin,
      high: cMax,
      strength: 1,
      isSupport: false,
      isConsolidation: true
    });
  }

  // Ensure zones are sorted by strength and limited
  const finalZones = zones.sort((a, b) => (b.strength || 0) - (a.strength || 0)).slice(0, 20);
  
  const result = { bins, zones: finalZones, detections: detections.slice(-10) }; // only last 10 detections for UI
  ANALYSIS_STORE[`${accountId}:${symbol}`] = result;
  return result;
}

function calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return 50;
    
    let gains = 0;
    let losses = 0;
    
    for (let i = 1; i <= period; i++) {
        const diff = prices[prices.length - i] - prices[prices.length - i - 1];
        if (diff >= 0) gains += diff;
        else losses -= diff;
    }
    
    if (losses === 0) return 100;
    const rs = gains / losses;
    return 100 - (100 / (1 + rs));
}

async function cleanupAccountStreams(accountId: string, keepSymbol: string, keepTimeframe: string) {
    console.log(`[SWEEPER] Cleaning up unused streams for ${accountId} (Keeping: ${keepSymbol}:${keepTimeframe})...`);
    
    const streams = globalScope.ACTIVE_STREAMS;
    if (!streams) return;

    const connection = REGISTRY.stream.get(accountId);
    if (!connection) return;

    for (const key of Array.from(streams) as string[]) {
        if (key.startsWith(`${accountId}:`)) {
            const [acc, sym, tf] = key.split(':');
            if (sym !== keepSymbol || tf !== keepTimeframe) {
                console.log(`[SWEEPER] Unsubscribing from legacy stream: ${key}`);
                try {
                    await connection.unsubscribeFromMarketData(sym, [{ type: 'quotes' }, { type: 'candles', timeframe: tf }]);
                    streams.delete(key);
                    globalScope.STREAM_STATE.delete(key);
                    if (globalScope.CANDLE_STORE[accountId]) {
                        delete globalScope.CANDLE_STORE[accountId][sym];
                    }
                } catch (e: any) {
                    console.warn(`[SWEEPER] Failed to unsubscribe from ${key}: ${e.message}`);
                }
            }
        }
    }
}

async function startMarketStream(accountId: string, symbol: string, timeframe: string) {
  const accountState = globalScope.ACCOUNT_STATE?.get(accountId);
  if (accountState === "REDEPLOYING" || accountState === "RECONNECTING" || accountState === "STREAM_LOCKED") {
    console.log(`[STREAM] Rejected start command for ${accountId} -> Account is in ${accountState} freeze state`);
    return;
  }

  const key = `${accountId}:${symbol}:${timeframe}`;
  
  // Register INTENT
  if (!globalScope.STREAM_INTENTS) globalScope.STREAM_INTENTS = new Map();
  globalScope.STREAM_INTENTS.set(key, { accountId, symbol, timeframe });

  // 1. Cooldown Debounce (15s)
  const now = Date.now();
  const lastFailAt = globalScope.STREAM_FAILURES.get(key) || 0;
  if (now - lastFailAt < 15000) {
    return;
  }

  const lastStart = globalScope.LAST_STREAM_START.get(key) || 0;
  if (now - lastStart < 5000) {
    console.log(`[STREAM] Standard spacing skip for ${key}`);
    return;
  }
  globalScope.LAST_STREAM_START.set(key, now);

  // 2. Lifecycle Lock & Validation
  const state = globalScope.STREAM_STATE.get(key);
  if (state && (state.status === "ACTIVE" || state.status === "SYNCING" || state.status === "CONNECTING")) {
    console.log(`[STREAM] Rejected duplicate start command for ${key} -> Status is currently ${state.status}`);
    return;
  }
  
  globalScope.STREAM_STATE.set(key, { status: "CONNECTING", type: timeframe, lastHeartbeat: Date.now() });

  if (globalScope.MARKET_STREAM_PENDING.has(key)) {
    console.log(`[STREAM] Awaiting pending lock: ${key}`);
    return globalScope.MARKET_STREAM_PENDING.get(key);
  }

  const promise = (async () => {
    try {
      console.log(`[STREAM] Engaging market data for ${key}...`);
      
      const isStreamReady = globalScope.STREAM_READY.get(accountId) === true;
      if (!isStreamReady) {
        console.log(`[STREAM BLOCKED] ${key} not ready yet (STREAM_READY is false). Intent queued.`);
        return;
      }
      
      const connection = await setupStreaming(accountId);
      
      // Ensure broker connectivity check
      await waitForTrueConnection(connection, accountId);

      await cleanupAccountStreams(accountId, symbol, timeframe);
      await safeSubscribe(connection, symbol, timeframe, accountId);

      globalScope.ACTIVE_STREAMS.add(key);
      globalScope.STREAM_ACTIVE.set(accountId, true);
      globalScope.STREAM_STATE.set(key, { lastHeartbeat: Date.now(), status: 'ACTIVE' });
      console.log(`[STREAM] ${key} ACTIVE ✅`);
      globalScope.STREAM_FAILURES.delete(key);
    } catch (err: any) {
      console.error(`[STREAM ERROR] Failed to start market data for ${key}:`, err.message);
      globalScope.STREAM_FAILURES.set(key, Date.now());
      throw err;
    } finally {
      globalScope.MARKET_STREAM_PENDING.delete(key);
    }
  })();

  globalScope.MARKET_STREAM_PENDING.set(key, promise);
  return promise;
}

async function activateUserAutomations(userId: string, limit: number) {
  try {
    if (!adminSupabase) return;
    
    // Instead of auto-deploying per 'Never auto-redeploy' requirement,
    // we just signal that the subscription status changed. 
    // The user must manually deploy their accounts.
    broadcast({ type: 'subscription:renewed', userId });
    
  } catch(e: any) {
    console.error("[AUTOMATION] Failed to run automations:", e.message);
  }
}

// ============== SAAS & SUBSCRIPTION ENDPOINTS ==============
app.post("/api/subscription/activate-device", async (req, res) => {
  try {
    const userId = await getUserIdFromRequest(req);
    const { key, fingerprint } = req.body;
    
    if (!key) return res.status(400).json({ error: "Access key is required" });
    if (!adminSupabase) return res.status(500).json({ error: "Database not available" });

    const authHeader = req.headers.authorization?.replace("Bearer ", "");
    const { data: userData } = await adminSupabase.auth.getUser(authHeader!);
    const userEmail = userData.user?.email;

    if (!userEmail) return res.status(400).json({ error: "Could not identify user email" });

    // Validate the key from access_licenses
    const { data: keyData, error: keyError } = await adminSupabase
      .from("access_licenses")
      .select("*")
      .eq("access_key", key)
      .single();

    if (keyError || !keyData) {
      return res.status(400).json({ error: "Invalid access key" });
    }

    const isExpired = keyData.expires_at && new Date(keyData.expires_at).getTime() < Date.now();
    if (isExpired) {
       return res.status(400).json({ error: "Access key has expired" });
    }

    // Protection: Key is permanently linked to the assigned email
    const assignedEmail = (keyData.email || "").toLowerCase().trim();
    const isUnassigned = !assignedEmail || assignedEmail === "unassigned@local";
    if (!isUnassigned && assignedEmail !== userEmail.toLowerCase().trim()) {
      return res.status(400).json({ error: `Activation denied: Key is assigned to ${assignedEmail}, but you are logged in as ${userEmail.toLowerCase().trim()}.` });
    }

    // If key is already used
    if (keyData.used) {
         return res.json({ success: true, message: "Workspace activated successfully" });
    }

    // Mark key as used and bind to email if unassigned
    await adminSupabase.from("access_licenses").update({
      used: true,
      email: userEmail // Bind to the email that activated it
    }).eq("id", keyData.id);

    // Update public.users
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);

    const { data: userRecord } = await adminSupabase.from("users").select("*").eq("id", userId).maybeSingle();

    // Determine plan implicitly from the access_key structure (e.g. ALGO-PRO-XXXXX) if field is missing
    let inferredPlan = "Starter";
    if (keyData.access_key && typeof keyData.access_key === "string") {
        const parts = keyData.access_key.split('-');
        if (parts.length >= 3 && ["STARTER", "PRO", "ELITE"].includes(parts[1])) {
            inferredPlan = parts[1].charAt(0).toUpperCase() + parts[1].slice(1).toLowerCase();
        }
    }

    // Retain legacy behaviors for automation logic compat
    const planType = keyData.plan || inferredPlan || userRecord?.plan || 'Starter';
    const metaapiAccountLimit = planType === 'Elite' ? 3 : planType === 'Pro' ? 2 : 1;

    if (userRecord) {
        await adminSupabase.from("users").update({
             has_access: true,
             payment_status: 'active',
             plan: planType,
             expires_at: expiryDate.toISOString()
        }).eq("id", userId);
    } else {
        await adminSupabase.from("users").insert({
             id: userId,
             email: userEmail,
             has_access: true,
             access_key: key,
             plan: planType,
             payment_status: 'active',
             expires_at: expiryDate.toISOString()
        });
    }

    await activateUserAutomations(userId, metaapiAccountLimit);
    broadcast({ type: 'subscription:activated', userId, plan: planType, limit: metaapiAccountLimit });

    return res.status(200).json({ success: true, message: "Device activated and subscription updated" });
  } catch (e: any) {
    console.error("[ACTIVATE] Error:", e.message);
    res.status(500).json({ error: "Server error during activation" });
  }
});

app.post("/api/admin/generate-key", async (req, res) => {
   try {
     const authHeader = req.headers.authorization;
     if (!authHeader) return res.status(401).json({ error: "No token" });
     const token = authHeader.replace("Bearer ", "");
     const adminId = await getUserIdFromRequest(req);
     const { planType } = req.body;
     
     if (!adminSupabase) return res.status(500).json({error: "No DB"});

     if (!await isUserAdmin(token, adminId)) {
         return res.status(403).json({ error: "Forbidden: Admin access required" });
     }

     const safePlan = (planType || "Starter").toUpperCase();
     const newKey = `ALGO-${safePlan}-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
     const expiresAt = new Date();
     expiresAt.setDate(expiresAt.getDate() + 30);

     const { error } = await adminSupabase.from("access_licenses").insert({
       access_key: newKey,
       email: 'unassigned@local',
       used: false,
       expires_at: expiresAt.toISOString()
     });

     if (error) {
       console.error("Supabase insert error:", error);
       throw new Error(`Failed to insert key: ${error.message || JSON.stringify(error)}`);
     }
     
     await adminSupabase.from("audit_logs").insert({
       admin_id: adminId,
       action: "generate_key",
       details: { plan: planType, key: newKey }
     });

     res.status(200).json({ success: true, key: newKey });
   } catch (e: any) {
     console.error("[ADMIN] Generate Key error:", e);
     res.status(500).json({ error: e.message });
   }
});

app.get("/api/admin/keys", async (req, res) => {
   try {
       const userId = await getUserIdFromRequest(req);
       if (!adminSupabase) return res.status(500).json({error: "No DB"});

       // Role check with master email override
       const authHeader = req.headers.authorization;
       let isMasterAdmin = false;
       if (authHeader) {
           const token = authHeader.replace("Bearer ", "");
           const { data: userData } = await adminSupabase.auth.getUser(token);
           if (userData.user?.email?.toLowerCase() === "trispinblackops@gmail.com") {
               isMasterAdmin = true;
           }
       }

       if (!isMasterAdmin) {
           const { data: roleData } = await adminSupabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
           if (!roleData || (roleData.role !== 'developer' && roleData.role !== 'admin')) {
               return res.status(403).json({ error: "Forbidden" });
           }
       }
       const { data: keysData } = await adminSupabase.from("access_licenses").select("*").order("created_at", { ascending: false });
       
       const augmentedKeys = (keysData || []).map(k => {
           let extractedPlan = "Starter";
           if (k.access_key && typeof k.access_key === "string") {
               const parts = k.access_key.split('-');
               if (parts.length >= 3 && ["STARTER", "PRO", "ELITE"].includes(parts[1])) {
                   extractedPlan = parts[1].charAt(0).toUpperCase() + parts[1].slice(1).toLowerCase();
               }
           }
           return { ...k, plan: extractedPlan };
       });
       
       res.json(augmentedKeys);
   } catch(e: any) {
       res.status(500).json({ error: e.message || String(e) });
   }
});

app.post("/api/admin/renew-subscription", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: "No token" });
        const token = authHeader.replace("Bearer ", "");
        const adminId = await getUserIdFromRequest(req);
        
        const { keyId, userId: targetUserId } = req.body;
        if (!adminSupabase) return res.status(500).json({error: "No DB"});

        if (!await isUserAdmin(token, adminId)) {
            return res.status(403).json({ error: "Forbidden: Admin access required" });
        }

        const newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        if (keyId) {
             const { data: keyRecord } = await adminSupabase.from("access_licenses").update({
                  expires_at: newExpiry.toISOString()
             }).eq("id", keyId).select().single();
             
             if (keyRecord && keyRecord.email) {
                 await adminSupabase.from("users").update({
                      expires_at: newExpiry.toISOString(),
                      has_access: true,
                      payment_status: 'active'
                 }).eq("email", keyRecord.email);
             }
        } else if (targetUserId) {
            await adminSupabase.from("users").update({
                 expires_at: newExpiry.toISOString(),
                 has_access: true,
                 payment_status: 'active'
            }).eq("id", targetUserId);
        }

        await adminSupabase.from("audit_logs").insert({
          admin_id: adminId,
          action: "renewed_subscription",
          details: { key_id: keyId, user_id: targetUserId, new_expiry: newExpiry.toISOString() }
        });
        
        res.json({ success: true, newExpiry });
    } catch(e: any) {
        console.error("[ADMIN] Renew Subscription error:", e);
        res.status(500).json({ error: e.message });
    }
});

async function isUserAdmin(token: string, userId: string): Promise<boolean> {
    if (!adminSupabase) return false;
    
    // Master Admin Override
    const { data: userData } = await adminSupabase.auth.getUser(token);
    const userEmail = userData?.user?.email?.toLowerCase();
    if (userEmail === "trispinblackops@gmail.com" || userEmail === "admin@algotrade.com") {
        return true;
    }

    // Database Role Check
    const { data: roleData } = await adminSupabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    return roleData && (roleData.role === 'admin' || roleData.role === 'developer');
}

app.get("/api/admin/users", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: "No token" });
        const token = authHeader.replace("Bearer ", "");
        const userId = await getUserIdFromRequest(req);
        
        if (!await isUserAdmin(token, userId)) {
            return res.status(403).json({ error: "Forbidden: Admin access required" });
        }

        const { data: usersResponse, error: usersError } = await adminSupabase.auth.admin.listUsers();
        if (usersError) throw usersError;
        
        const authUsers = usersResponse?.users || [];

        const { data: licenses, error: licensesError } = await adminSupabase.from("access_licenses").select("*");
        if (licensesError) throw licensesError;
        
        const enhancedUsers = authUsers.map((u: any) => {
            const license = (licenses || []).find((l: any) => l.email === u.email);
            return {
                id: u.id,
                email: u.email,
                created_at: u.created_at,
                last_sign_in_at: u.last_sign_in_at,
                has_access: !!(license && license.used),
                access_key: license?.access_key || null,
                expires_at: license?.expires_at || null,
                plan: license?.plan || 'Starter'
            };
        });

        res.json(enhancedUsers);
    } catch (e: any) {
        console.error("[ADMIN] Users fetch error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/admin/approve-user", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: "No token" });
        const token = authHeader.replace("Bearer ", "");
        const adminId = await getUserIdFromRequest(req);
        
        const { targetUserId, planType } = req.body;
        if (!adminSupabase) return res.status(500).json({error: "No DB"});

        if (!await isUserAdmin(token, adminId)) {
            return res.status(403).json({ error: "Forbidden: Admin access required" });
        }

        const { data: userResponse, error: userError } = await adminSupabase.auth.admin.getUserById(targetUserId);
        if (userError || !userResponse?.user) throw new Error("User not found in Supabase Auth");
        const targetUser = userResponse.user;

        const safePlan = (planType || "Starter").toUpperCase();
        const newKey = `ALG-${safePlan}-${crypto.randomBytes(2).toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
        
        // Remove old unused keys for this email if any exist
        if (targetUser.email) {
            await adminSupabase.from("access_licenses").delete().eq("email", targetUser.email).eq("used", false);
        }

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30); // Default 30 days

        const insertObj = {
            email: targetUser.email || 'unassigned@local',
            access_key: newKey,
            used: false, // Requires user to activate it in the UI
            expires_at: expiresAt.toISOString()
        };

        const { error: keyErr } = await adminSupabase.from("access_licenses").insert(insertObj);

        if (keyErr) {
            console.error("[ADMIN] KEY INSERT ERROR:", keyErr);
            throw new Error(`Failed to insert key for user ${targetUserId}. Error: ${keyErr.message}. Object sent: ${JSON.stringify(insertObj)}`);
        }

        // Do NOT update users table has_access: true yet. User must do it in the billing page.

        await adminSupabase.from("audit_logs").insert({
          admin_id: adminId,
          action: "generate_manual_key",
          details: { user_id: targetUserId, email: targetUser.email, key: newKey, plan: planType }
        });

        res.json({ success: true, message: `Access Key Generated: ${newKey}. Send this to the user to activate.`, key: newKey });
    } catch (e: any) {
        console.error("[ADMIN] Approve User error:", e);
        res.status(500).json({ error: e.message || String(e) });
    }
});

app.post("/api/admin/suspend-key", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: "No token" });
        const token = authHeader.replace("Bearer ", "");
        const adminId = await getUserIdFromRequest(req);
        const { keyId } = req.body;
        
        if (!adminSupabase) return res.status(500).json({error: "No DB"});

        if (!await isUserAdmin(token, adminId)) {
            return res.status(403).json({ error: "Forbidden: Admin access required" });
        }

        const { data: keyRecord } = await adminSupabase.from("access_licenses").delete().eq("id", keyId).select().maybeSingle();
        
        if (keyRecord && keyRecord.email) {
            await adminSupabase.from("users").update({ has_access: false, payment_status: 'revoked' }).eq("email", keyRecord.email);
        }

        await adminSupabase.from("audit_logs").insert({
          admin_id: adminId,
          action: "suspend_key",
          details: { key_id: keyId }
        });

        res.status(200).json({ success: true, message: "Key revoked successfully" });
    } catch (e: any) {
        console.error("[ADMIN] Suspend Key error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.get("/api/subscription/status", async (req, res) => {
   try {
     const userId = await getUserIdFromRequest(req);
     if (!adminSupabase) return res.status(500).json({error: "No DB"});
     const { data } = await adminSupabase.from("users")
       .select("*")
       .eq("id", userId)
       .maybeSingle();
     if (data && data.has_access) {
         return res.json({ status: 'active', plan: data.plan, expiry_date: data.expires_at });
     }
     res.json({ status: 'inactive' });
   } catch(e: any) {
     res.status(500).json({ error: e.message });
   }
});

app.get("/api/admin/audit-logs", async (req, res) => {
   try {
       const authHeader = req.headers.authorization;
       if (!authHeader) return res.status(401).json({ error: "No token" });
       const token = authHeader.replace("Bearer ", "");
       const userId = await getUserIdFromRequest(req);
       
       if (!adminSupabase) return res.status(500).json({error: "No DB"});
       
       if (!await isUserAdmin(token, userId)) {
           return res.status(403).json({ error: "Forbidden: Admin access required" });
       }

       const { data } = await adminSupabase.from("audit_logs").select("*").order("created_at", { ascending: false });
       res.json(data || []);
   } catch(e: any) {
       res.status(500).json({ error: e.message });
   }
});
// ==========================================================

// ACCOUNT FETCH (Direct SDK Call - No hybrid overrides)
app.get("/api/user/bootstrap", async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  try {
    const userId = await getUserIdFromRequest(req);
    const leases = await TradingController.getActiveLeases(userId);
    
    // Also fetch execution modes for these accounts
    const modes: Record<string, string> = {};
    for (const lease of leases) {
        modes[lease.account_id] = 'STRATEGY';
    }
    
    let has_active_subscription = false;
    let subscription_plan = null;

    // DEVELOPER OVERRIDE: trispinblackops@gmail.com always has access
    const authHeader = req.headers.authorization;
    if (authHeader && adminSupabase) {
        const token = authHeader.replace("Bearer ", "");
        const { data: userData } = await adminSupabase.auth.getUser(token);
        const userEmail = userData.user?.email || "";
        if (userEmail.toLowerCase() === "trispinblackops@gmail.com") {
            has_active_subscription = true;
            subscription_plan = "Developer";
        }
    }

    if (!has_active_subscription && adminSupabase) {
        // Fetch user from users table first
        const { data: userRecord } = await adminSupabase.from("users")
            .select("plan, has_access, expires_at")
            .eq("id", userId)
            .maybeSingle();

        if (userRecord && userRecord.has_access) {
            const isExpired = userRecord.expires_at && new Date(userRecord.expires_at).getTime() < Date.now();
            if (!isExpired) {
                has_active_subscription = true;
                subscription_plan = userRecord.plan || "Starter";
            }
        }

        // If not found in users, check access_licenses by email
        if (!has_active_subscription) {
            const authHeaderToken = req.headers.authorization?.replace("Bearer ", "");
            const { data: userData } = await adminSupabase.auth.getUser(authHeaderToken!);
            const userEmailMatch = userData.user?.email;

            if (userEmailMatch) {
                const { data: license } = await adminSupabase.from("access_licenses")
                    .select("used, expires_at, access_key")
                    .eq("email", userEmailMatch)
                    .eq("used", true)
                    .maybeSingle();
                    
                if (license && license.used) {
                    const isExpired = license.expires_at && new Date(license.expires_at).getTime() < Date.now();
                    if (!isExpired) {
                        has_active_subscription = true;
                        subscription_plan = license.plan || "Starter";
                        (res as any).license_key = license.access_key;
                    }
                }
            }
        }
    }
    
    res.json({
      user_id: userId,
      ea_leases: leases,
      execution_modes: modes,
      meta_api_url: process.env.VITE_METAAPI_BASE_URL || `http://${req.headers.host}`,
      ui_state: "READY",
      has_active_subscription,
      subscription_plan,
      license_key: (res as any).license_key
    });
  } catch (err: any) {
    res.status(401).json({ error: sanitizeError(err) });
  }
});

app.get("/api/accounts", async (req, res) => {
  if (!metaapi) return res.status(503).json({ error: "SDK_NOT_READY" });
  
  try {
    const userId = await getUserIdFromRequest(req);
    const leases = await TradingController.getActiveLeases(userId);
    
    // OWNERSHIP CLEANUP: Remove foreign leases caused by previous auto-assign bugs
    const validLeases = [];
    if (adminSupabase && leases.length > 0) {
      for (const lease of leases) {
         const { data: deployment } = await adminSupabase.from("ea_deployments").select("user_id").eq("account_id", lease.account_id).maybeSingle();
         if (deployment && deployment.user_id !== userId) {
            console.log(`[SECURITY] Purging foreign lease ${lease.account_id} for user ${userId} (owned by ${deployment.user_id})`);
            await TradingController.removeLease(lease.account_id, userId);
         } else {
            validLeases.push(lease);
         }
      }
    } else {
      validLeases.push(...leases);
    }
    
    const activeAccountIds = new Set(validLeases.map(l => l.account_id));

    // PERFORMANCE: Return fresh cache (30s) immediately to prevent SDK bottleneck
    const now = Date.now();
    const userCache = globalScope.ACCOUNT_LIST_CACHE_BY_USER.get(userId);
    const lastSync = globalScope.LAST_SYNC_TIME_BY_USER?.get(userId) || 0;
    
    const force = req.query.force === 'true';
    if (!force && userCache && (now - lastSync < 30000)) {
      return res.json(userCache.filter((a: any) => activeAccountIds.has(a.id)));
    }

    if (globalScope.SYNC_IN_PROGRESS_BY_USER.has(userId)) {
      if (userCache) return res.json(userCache.filter((a: any) => activeAccountIds.has(a.id)));
      return res.json({ status: 'SYNCING', message: 'Sync in progress' });
    }

    globalScope.SYNC_IN_PROGRESS_BY_USER.add(userId);
    if (!globalScope.LAST_SYNC_TIME_BY_USER) globalScope.LAST_SYNC_TIME_BY_USER = new Map<string, number>();
    globalScope.LAST_SYNC_TIME_BY_USER.set(userId, now);
    
    // Safety timeout
    setTimeout(() => globalScope.SYNC_IN_PROGRESS_BY_USER.delete(userId), 15000);

    try {
      const response = await safeMetaApiCall(() => 
        metaapi.metatraderAccountApi.getAccountsWithInfiniteScrollPagination()
      , 'GET_ACCOUNTS');
      
      const rawAccounts = Array.isArray(response)
        ? response
        : response?.items
          ? response.items
          : response?.data
            ? response.data
            : [];
      
      if (!Array.isArray(rawAccounts)) {
        throw new Error("INVALID_ACCOUNTS_SHAPE: SDK response malformed");
      }

      const allParsedAccounts = rawAccounts.map((acc: any) => {
        const accountId = acc.id || acc._data?.id || acc._id;
        const info = acc.accountInformation || acc._data?.accountInformation || {};
        
        let connectionStatus = acc.connectionStatus || acc._data?.connectionStatus || 'DISCONNECTED';
        let balance = info.balance !== undefined ? Number(info.balance) : 0;
        let equity = info.equity !== undefined ? Number(info.equity) : (info.balance !== undefined ? Number(info.balance) : 0);
        let margin = info.margin !== undefined ? Number(info.margin) : 0;
        let freeMargin = info.freeMargin !== undefined ? Number(info.freeMargin) : 0;
        let marginLevel = info.marginLevel !== undefined ? Number(info.marginLevel) : (info.margin !== undefined && info.margin > 0 && info.equity !== undefined ? (Number(info.equity) / Number(info.margin)) * 100 : 0);
        let currency = info.currency || 'USD';

        // If our local stream says it's connected, override MetaApi's stale config response
        const connection = REGISTRY.stream.get(accountId);
        if (connection && connection.terminalState) {
           if (connection.terminalState.connected === true && connection.terminalState.connectedToBroker === true) {
              connectionStatus = 'CONNECTED';
           }
           
           // Merging live account information if available
           const liveInfo = connection.terminalState.accountInformation;
           if (liveInfo) {
              if (liveInfo.balance !== undefined) balance = Number(liveInfo.balance);
              if (liveInfo.equity !== undefined) equity = Number(liveInfo.equity);
              if (liveInfo.margin !== undefined) margin = Number(liveInfo.margin);
              if (liveInfo.freeMargin !== undefined) freeMargin = Number(liveInfo.freeMargin);
              if (liveInfo.marginLevel !== undefined) marginLevel = Number(liveInfo.marginLevel);
              if (liveInfo.currency) currency = liveInfo.currency;
           }
        }
        
        return {
          id: accountId,
          name: acc.name || acc._data?.name,
          platform: (acc.version || acc._data?.version) === 5 || (acc.version || acc._data?.version) === '5' || String(acc.platform || acc._data?.platform).includes('mt5') ? 'mt5' : 'mt4',
          login: acc.login || acc._data?.login,
          server: acc.server || acc._data?.server,
          connectionStatus: connectionStatus,
          state: acc.state || acc._data?.state,
          balance,
          equity,
          margin,
          freeMargin,
          marginLevel,
          currency
        };
      });

      globalScope.ACCOUNT_LIST_CACHE_BY_USER.set(userId, allParsedAccounts);
      res.json(allParsedAccounts.filter((a: any) => activeAccountIds.has(a.id)));
    } catch (err: any) {
      console.error("[SDK ERROR] Native Rejection (Isolating):", err);
      const cached = globalScope.ACCOUNT_LIST_CACHE_BY_USER.get(userId);
      if (cached && cached.length > 0) {
        return res.json(cached.filter((a: any) => activeAccountIds.has(a.id)));
      }
      
      let errMsg = err.message || "";
      // If it's a transient SDK error, we can try to return what we have in DB leases as placeholders
      const leases = await TradingController.getActiveLeases(userId);
      const placeholders = leases.map(l => ({
          id: l.account_id,
          name: l.ea_name || "Recovering...",
          login: "****",
          server: l.region || "london",
          connectionStatus: "RECOVERING",
          state: "DEPLOYED",
          balance: 0,
          equity: 0,
          currency: "USD"
      }));
      
      if (placeholders.length > 0) return res.json(placeholders);

      res.status(500).json({ error: "CLOUD_REJECTION", message: sanitizeError(errMsg) });
    } finally {
      globalScope.SYNC_IN_PROGRESS_BY_USER.delete(userId);
    }
  } catch (err: any) {
    res.status(401).json({ error: sanitizeError(err) });
  }
});

// HTTP Route removed for stream subscribe per streaming-only architectural rules


app.post("/api/accounts", async (req, res) => {
  try {
    const userId = await getUserIdFromRequest(req);
    
    // VALIDATE SAAS LIMITS
    if (adminSupabase) {
        const { data: userData } = await adminSupabase.from("users")
           .select("plan")
           .eq("id", userId)
           .maybeSingle();
           
        const plan = userData?.plan || "Starter";
        const leases = await TradingController.getActiveLeases(userId);
        
        let limit = 1;
        if (plan === 'Pro') limit = 2;
        else if (plan === 'Elite') limit = 3;
        else if (plan === 'Developer') limit = 100;

        if (leases.length >= limit) {
           return res.status(403).json({ error: `Subscription limit reached for ${plan} plan. Please upgrade to add more accounts. Limit: ${limit}, Current: ${leases.length}` });
        }
    }
    
    const { login, server, platform, magic } = req.body || {};
    
    // Check if account already exists to prevent duplication
    const rawResponse = await metaapi.metatraderAccountApi.getAccountsWithInfiniteScrollPagination();
    const accounts = Array.isArray(rawResponse) ? rawResponse : rawResponse?.items ? rawResponse.items : rawResponse?.data ? rawResponse.data : [];
    
    let account = accounts.find((a: any) => {
      let isMatch = String(a.login) === String(login) && String(a.server).toLowerCase() === String(server).toLowerCase();
      // Ensure platform match if provided (e.g. metaapi platform 'mt5' vs mt4)
      if (isMatch && platform) {
         const accPlat = (a.version || a._data?.version) === 5 || (a.version || a._data?.version) === '5' || String(a.platform || a._data?.platform).includes('mt5') ? 'mt5' : 'mt4';
         if (accPlat !== platform) {
            isMatch = false;
         }
      }
      return isMatch;
    });
    
    let isNew = false;
    let accountId = null;

    if (account) {
      accountId = account.id || account._data?.id || account._id;
      console.log(`[ACCOUNT] Found existing account ${accountId} for login ${login}. Validating ownership...`);
      
      // Ownership check: If this account is already exclusively owned by someone else in ea_leases, reject it.
      if (adminSupabase) {
         const { data: existingLease } = await adminSupabase.from("ea_leases")
           .select("user_id")
           .eq("account_id", accountId)
           .maybeSingle();
           
         if (existingLease && existingLease.user_id !== userId) {
            return res.status(403).json({ error: "Access Denied: This broker account is already registered by another user. If you own this account, please ensure the credentials are not shared. Contact support if this is a mistake." });
         }
      }
      console.log(`[ACCOUNT] Ownership verified or unclaimed. Reusing for user.`);
    } else {
      console.log(`[ACCOUNT] Creating new account for login ${login}.`);
      account = await metaapi.metatraderAccountApi.createAccount(req.body || {});
      accountId = account.id || account._data?.id || account._id;
      isNew = true;
    }
    
    // Deploy if it's a fresh account or currently not deployed
    if (isNew || account.state !== 'DEPLOYED') {
      try {
        console.log(`[ACCOUNT] Account state is ${account.state}. Triggering deployment...`);
        await account.deploy();
      } catch (deployErr: any) {
        console.log(`[ACCOUNT] Deploy hint skipped: ${deployErr.message}`);
      }
    } else {
      console.log(`[ACCOUNT] Bound to ${accountId}. Account already DEPLOYED.`);
    }
    
    await TradingController.createLease(userId, accountId, 'DEFAULT', 'london');

    const info = account.accountInformation || account._data?.accountInformation || {};
    
    const responseObj = {
      id: accountId,
      name: account.name || account._data?.name,
      login: account.login || account._data?.login,
      server: account.server || account._data?.server,
      state: account.state || account._data?.state,
      connectionStatus: account.connectionStatus || account._data?.connectionStatus,
      magic: account.magic || account._data?.magic,
      platform: (account.version || account._data?.version) === 5 || (account.version || account._data?.version) === '5' || String(account.platform || account._data?.platform).includes('mt5') ? 'mt5' : 'mt4',
      uptime: account.uptime || account._data?.uptime,
      balance: info.balance || 0,
      equity: info.equity || 0,
      margin: info.margin || 0,
      freeMargin: info.freeMargin || 0,
      marginLevel: info.marginLevel || (info.margin ? (info.equity / info.margin) * 100 : 0)
    };
    
    const userCache = globalScope.ACCOUNT_LIST_CACHE_BY_USER.get(userId) || [];
    const existingIdx = userCache.findIndex((a: any) => a.id === accountId);
    if (existingIdx !== -1) {
      userCache[existingIdx] = responseObj;
    } else {
      userCache.push(responseObj);
    }
    globalScope.ACCOUNT_LIST_CACHE_BY_USER.set(userId, userCache);
    
    res.json(responseObj);
  } catch (err: any) {
    let msg = err.message || "An unknown error occurred";
    
    // Scrub internal API terminology for client
    if (msg.includes("Validation failed") && msg.includes("/users/current/accounts")) {
       msg = "Broker settings validation failed. Please review your login, password, and server details.";
    }
    msg = sanitizeError(msg);
    
    // Fallback if URL still sneaks through
    msg = msg.replace(/https?:\/\/[^\s]+/g, '');
    
    res.status(500).json({ error: msg.trim() });
  }
});

app.delete("/api/account/:accountId", async (req, res) => {
  const { accountId } = req.params;
  try {
    const userId = await getUserIdFromRequest(req);
    await closeConnection(accountId, "DELETING");
    await metaapi.metatraderAccountApi.removeAccount(accountId);
    res.sendStatus(204);
  } catch (err: any) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

app.delete("/api/account/:accountId/lease", async (req, res) => {
  const { accountId } = req.params;
  try {
    const userId = await getUserIdFromRequest(req);
    await TradingController.removeLease(accountId, userId);
    res.sendStatus(204);
  } catch (err: any) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

async function waitForMetaApiReady(connection: any, accountId: string) {
  let retries = 0;

  while (retries < 90) {
    const state = await connection.getState?.();

    const isReady =
      state === "CONNECTED" ||
      state === "READY" ||
      state?.connected === true;

    if (isReady) {
      console.log(`[METAAPI] Account READY: ${accountId}`);
      return true;
    }

    console.warn(`[METAAPI] Waiting readiness... ${retries} (account: ${accountId}, state: ${state})`);
    await new Promise(r => setTimeout(r, 2000));
    retries++;
  }

  throw new Error("Cloud Node not ready after timeout");
}

app.post("/api/account/:accountId/deploy", async (req, res) => {
  const { accountId } = req.params;
  const { userId, eaName, region } = req.body || {}; 
  try {
    const userIdAuth = await getUserIdFromRequest(req);
    const effectiveUserId = userId || userIdAuth;
    const existingEA = await TradingController.getEAStatus(accountId, effectiveUserId);
    
    // Check if locked
    if (existingEA?.status === 'MANUALLY_LOCKED') {
       return res.status(403).json({ error: "Account is manually locked by admin and cannot be deployed automatically." });
    }
    
    logMessage(accountId, 'INFO', 'Cloud Terminal Deployment sequence initiated in Cloud Hub.', { region: region || 'london' }, 'NODE_STRATEGY');

    if (existingEA?.deployed) {
       return res.status(400).json({ error: "EA already deployed" });
    }
    
    // Register lease FIRST for transactional integrity
    await TradingController.createLease(userId, accountId, eaName || 'default', region || 'london');
    
    const account = await getAccount(accountId);
    await account.deploy();
    await account.waitConnected().catch(() => {});
    
    if (account.connectionStatus !== 'CONNECTED') {
       await account.connect();
    }

    // WAIT FOR READINESS
    const connection = await getRPCConnection(accountId);
    await waitForMetaApiReady(connection, accountId);
    
    await TradingController.updateEAStatus(accountId, userId, true, 'ACTIVE');
    res.sendStatus(204);
  } catch (err: any) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

app.post("/api/account/:accountId/undeploy", async (req, res) => {
  const { accountId } = req.params;
  try {
    const userId = await getUserIdFromRequest(req);
    logMessage(accountId, 'INFO', 'Cloud Terminal termination signal broadcast.', {}, 'NODE_STRATEGY');
    await TradingController.setAlgoRunning(accountId, userId, false);
    await TradingController.updateEAStatus(accountId, userId, false, 'OFFLINE');
    
    const account = await getAccount(accountId);
    await account.undeploy();
    
    res.sendStatus(204);
  } catch (err: any) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

app.post(["/api/account/:accountId/start-algo", "/api/trading/activate"], async (req, res) => {
  const accountId = req.params.accountId || req.body.accountId;
  try {
    assertReady(accountId);
    assertStream(accountId);
    // Relaxed tick check for EA mode start sequence
    const lastTick = globalScope.LAST_TICK_TIME.get(accountId) || 0;
    if (Date.now() - lastTick > 300000) { // 5 minutes grace for initial start
        console.warn(`[ALGO] Market data stale for ${accountId}, but proceeding with EA activation.`);
    }
    
    const userId = await getUserIdFromRequest(req);
    const eaStatus = await TradingController.getEAStatus(accountId, userId);
    
    // Note: We check if deployed, but if it was just deployed we might need a heartbeat
    if (!eaStatus?.deployed) {
        logMessage(accountId, 'WARN', 'EA engine activation attempted but no deployment record found. Checking terminal state...', {}, 'NODE_STRATEGY');
    }
    
    await TradingController.setAlgoRunning(accountId, userId, true);
    logMessage(accountId, 'INFO', '[EA] Cloud Hub: Remote Expert Advisor logic activation sequence engaged.', {}, 'NODE_STRATEGY');
    
    // Enable Algo Trading on the actual connection for EA mode
    try {
      const connection = REGISTRY.stream.get(accountId);
      if (connection) {
        if (typeof (connection as any).setAlgoTradingEnabled === 'function') {
           await (connection as any).setAlgoTradingEnabled(true);
        } else {
           console.log("[ALGO] setAlgoTradingEnabled not available on connection, assuming cloud terminal handles it via deployment.");
        }
      }
    } catch (e) {
      console.warn(`[ALGO] Could not enable terminal-side algo trading:`, e);
    }

    broadcast({ type: 'trading:started', accountId, userId });

    console.log(`[ALGO] EA Engine Started for ${accountId} 🚀`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: sanitizeError(err) });
  }
});

app.post(["/api/account/:accountId/stop-algo", "/api/trading/stop"], async (req, res) => {
  const accountId = req.params.accountId || req.body.accountId;
  try {
    const userId = await getUserIdFromRequest(req);
    logMessage(accountId, 'INFO', 'Cloud EA Engine stop sequence engaged.', {}, 'NODE_STRATEGY');
    await TradingController.setAlgoRunning(accountId, userId, false);

    // Disable Algo Trading on the connection
    try {
      const connection = REGISTRY.stream.get(accountId);
      if (connection) {
        await (connection as any).setAlgoTradingEnabled?.(false);
      }
    } catch (e) {
      console.warn(`[ALGO] Could not disable terminal-side algo trading:`, e);
    }

    broadcast({ type: 'trading:stopped', accountId, userId });

    console.log(`[ALGO] Stopped for ${accountId}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});




app.post("/api/account/:accountId/redeploy", async (req, res) => {
  const { accountId } = req.params;
  try {
    const userId = await getUserIdFromRequest(req);
    console.log(`[ORCHESTRATION] Requesting Cloud Redeployment for ${accountId} via SDK...`);
    
    // Enforcement
    const check = validateExecution(accountId, 'EA_DEPLOYMENT');
    if (!check.allowed) {
      return res.status(403).json({ error: check.message });
    }

    // HARD REDEPLOY FREEZE
    await freezeStreamsForAccount(accountId, "REDEPLOYING");
    
    const account = await getAccount(accountId);
    await resilientProvisioning(async () => {
      return await account.redeploy();
    }, "REDEPLOY_ACCOUNT");

    // TRANSITION TO RECONNECTING PHASE
    await freezeStreamsForAccount(accountId, "RECONNECTING");

    // ASYNC STREAM RECOVERY (Step 6-10)
    (async () => {
      if (globalScope.RECOVERY_LOCK.has(accountId)) {
        console.log(`[REST EA] Background recovery: Recovery already in progress for ${accountId}, skipping.`);
        return;
      }
      globalScope.RECOVERY_LOCK.add(accountId);

      try {
        console.log(`[REST EA] Background recovery: Executing connection refresh for ${accountId}...`);
        const connection = await setupStreaming(accountId);

        await waitForTrueConnection(connection, accountId);
        
        if (connection.terminalState && connection.terminalState.connected === true) {
          console.log(`[REST EA] Background recovery: Terminal READY for ${accountId}!`);
          globalScope.ACCOUNT_STATE.set(accountId, "CONNECTED");
          globalScope.STREAM_INITIALIZED.set(accountId, true);
          globalScope.READY_STATE.set(accountId, true);
          
          if (!connection._listenerAttached) {
            const listener = createMetaApiListener(accountId);
            connection.addSynchronizationListener(listener);
            connection._listenerAttached = true;
          }

          // Restart streams that were locked
          const streams = globalScope.ACTIVE_STREAMS;
          if (streams && streams instanceof Set) {
            for (const key of streams) {
              if (key.startsWith(`${accountId}:`)) {
                 const [, symbol, timeframe] = key.split(':');
                 console.log(`[REST EA] Background recovery: Reviving stream ${key}`);
                 globalScope.STREAM_STATE.set(key, { status: "RESTARTING", lastHeartbeat: Date.now() });
                 await startMarketStream(accountId, symbol, timeframe).catch(e => console.error(e));
              }
            }
          }
        } else {
           console.warn(`[REST EA] Background recovery: Terminal still disconnected after wait for ${accountId}`);
        }
      } catch (e: any) {
        console.error(`[REST EA] Background recovery failed for ${accountId}:`, e.message);
      } finally {
        globalScope.RECOVERY_LOCK.delete(accountId);
      }
    })();

    res.sendStatus(204);
  } catch (err: any) {
    console.error(`[REST EA] Redeployment FAILED for ${accountId}:`, err.message);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

app.get("/api/account/:accountId/specification/:symbol", async (req, res) => {
  const { accountId, symbol } = req.params;
  try {
    const connection = await getRPCConnection(accountId);
    const spec = await connection.getSymbolSpecification(symbol);
    res.json(spec);
  } catch (err: any) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

async function normalizeSymbol(connection: any, accountId: string, symbol: string) {
  try {
    const symbols = await getSymbolsCached(metaapi, accountId);
    
    // Exact match
    if (symbols.includes(symbol)) return symbol;
    
    // Case-insensitive match
    const lowerSymbol = symbol.toLowerCase();
    const caseInMatch = symbols.find(s => s.toLowerCase() === lowerSymbol);
    if (caseInMatch) return caseInMatch;
    
    // Suffix match (e.g. XAUUSD -> XAUUSDm, XAUUSD.m, XAUUSD#, mXAUUSD)
    const suffixMatch = symbols.find(s => {
      const sLower = s.toLowerCase();
      // Direct matches
      if (sLower === lowerSymbol) return true;
      // Predefined suffixes/prefixes
      if (sLower.startsWith(lowerSymbol + ".") || sLower.startsWith(lowerSymbol + "#") || sLower.startsWith(lowerSymbol + "+")) return true;
      // General containment with length guard (to prevent matching "USD" in "EURUSD")
      if (sLower.includes(lowerSymbol) && s.length <= symbol.length + 4) return true;
      return false;
    });
    
    if (suffixMatch) {
      console.log(`[SDK] Symbol Normalization: ${symbol} -> ${suffixMatch}`);
      return suffixMatch;
    }
    
    return symbol;
  } catch (e) {
    return symbol;
  }
}

// --- EXECUTION ROUTER (Mandatory 3-Layer Separation) ---
const getExecutionMode = (accountId: string): 'EA' | 'STRATEGY' => {
  return 'STRATEGY';
};

const validateExecution = (accountId: string, intent: 'NODE_TRADE' | 'EA_DEPLOYMENT' | 'CONTROL_ACTION'): { allowed: boolean; message?: string } => {
  // EA blocking is disabled per user request. Node trade and EA deployment are allowed.
  return { allowed: true };
};

// --- RESILIENT PROVISIONING (Orchestration Layer) ---
const resilientProvisioning = async (fn: () => Promise<any>, opName: string, retries = 3): Promise<any> => {
  try {
    return await fn();
  } catch (err: any) {
    const isNetworkError = err.code === 'ENOTFOUND' || err.message?.includes('fetch failed') || err.message?.includes('socket hang up') || err.message?.includes('DNS');
    
    if (isNetworkError && retries > 0) {
      if (err.code === 'ENOTFOUND') {
        // Try to trigger a re-resolution if we have a network error
        resolveProvisioningHost();
      }
      const backoff = (4 - retries) * 2000;
      console.warn(`[ORCHESTRATION_RETRY] Network failure for ${opName}. Retrying in ${backoff}ms... (${retries} left)`);
      logMessage(null, 'NETWORK_ERROR', `Retrying ${opName} due to connectivity issues: ${err.message}`, { op: opName });
      await new Promise(r => setTimeout(r, backoff));
      return resilientProvisioning(fn, opName, retries - 1);
    }
    console.error(`[ORCHESTRATION_FATAL] ${opName} failed after retries:`, err.message);
    throw err;
  }
};

app.post('/api/trade/buy', async (req, res) => {
  console.log("BUY ROUTE HIT", req.body);

  try {
    const userId = await getUserIdFromRequest(req);
    const { accountId, symbol, lotSize, stopLoss, takeProfit } = req.body || {};
    
    // Enforcement
    const check = validateExecution(accountId, 'NODE_TRADE');
    if (!check.allowed) {
      logMessage(accountId, 'ERROR', check.message || 'Execution blocked');
      return res.status(403).json({ error: check.message });
    }

    const source = 'NODE_STRATEGY';
    logMessage(accountId, "SIGNAL", `Buy Signal processed for ${symbol}`, {}, source);
    logMessage(accountId, "EXECUTION", `Executing buy order for ${symbol}`, { lotSize, stopLoss, takeProfit }, source);

    if (!lotSize || Number(lotSize) <= 0) {
      logMessage(accountId, 'ERROR', "Lot size required and must be positive");
      return res.status(400).json({ error: "Lot size required and must be positive" });
    }

    const connection = await getRPCConnection(accountId);
    
    // Normalize Symbol
    const normalizedSymbol = await normalizeSymbol(connection, accountId, symbol);
    
    // Ensure synchronization before trade
    await connection.waitSynchronized();

    // STRICT LIMIT ENFORCEMENT for manual trades
    const settings = globalScope.STRATEGY_SETTINGS.get(accountId) || { maxTrades: 1 };
    const maxTrades = Math.max(1, settings.maxTrades || 1);
    const positionsMap = globalScope.ACTIVE_POSITIONS.get(accountId) || new Map();
    const currentTrades = Array.from(positionsMap.values()).filter((p: any) => p.comment === 'ALGOTRADE').length;

    if (currentTrades >= maxTrades) {
        throw new Error(`Max trade capacity reached (${currentTrades}/${maxTrades}). Close an existing position first.`);
    }

    const result = await connection.createMarketBuyOrder(
      normalizedSymbol,
      Number(lotSize),
      Number(stopLoss || 0),
      Number(takeProfit || 0),
      { comment: req.body.comment || "ALGOTRADE" }
    );

    logMessage(accountId, 'SUCCESS', `Buy executed successfully for ${symbol}`, result);
    console.log("[TRADE] BUY SUCCESS", result);
    res.json({ success: true, result });
  } catch (err: any) {
    logMessage(req.body?.accountId || null, 'ERROR', `Buy execution failed: ${err.message}`);
    console.error("[TRADE] BUY FAILED", err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

app.post('/api/trade/sell', async (req, res) => {
  console.log("SELL ROUTE HIT", req.body);

  try {
    const userId = await getUserIdFromRequest(req);
    const { accountId, symbol, lotSize, stopLoss, takeProfit } = req.body || {};
    
    // Enforcement
    const check = validateExecution(accountId, 'NODE_TRADE');
    if (!check.allowed) {
      logMessage(accountId, 'ERROR', check.message || 'Execution blocked');
      return res.status(403).json({ error: check.message });
    }

    const source = 'NODE_STRATEGY';
    logMessage(accountId, "SIGNAL", `Sell Signal processed for ${symbol}`, {}, source);
    logMessage(accountId, "EXECUTION", `Executing sell order for ${symbol}`, { lotSize, stopLoss, takeProfit }, source);

    if (!lotSize || Number(lotSize) <= 0) {
      logMessage(accountId, 'ERROR', "Lot size required and must be positive");
      return res.status(400).json({ error: "Lot size required and must be positive" });
    }

    const connection = await getRPCConnection(accountId);

    // Normalize Symbol
    const normalizedSymbol = await normalizeSymbol(connection, accountId, symbol);

    // Ensure synchronization before trade
    await connection.waitSynchronized();

    // STRICT LIMIT ENFORCEMENT for manual trades
    const settings = globalScope.STRATEGY_SETTINGS.get(accountId) || { maxTrades: 1 };
    const maxTrades = Math.max(1, settings.maxTrades || 1);
    const positionsMap = globalScope.ACTIVE_POSITIONS.get(accountId) || new Map();
    const currentTrades = Array.from(positionsMap.values()).filter((p: any) => p.comment === 'ALGOTRADE').length;

    if (currentTrades >= maxTrades) {
        throw new Error(`Max trade capacity reached (${currentTrades}/${maxTrades}). Close an existing position first.`);
    }

    const result = await connection.createMarketSellOrder(
      normalizedSymbol,
      Number(lotSize),
      Number(stopLoss || 0),
      Number(takeProfit || 0),
      { comment: req.body.comment || "ALGOTRADE" }
    );

    logMessage(accountId, 'SUCCESS', `Sell executed successfully for ${symbol}`, result);
    console.log("[TRADE] SELL SUCCESS", result);
    res.json({ success: true, result });
  } catch (err: any) {
    logMessage(req.body?.accountId || null, 'ERROR', `Sell execution failed: ${err.message}`);
    console.error("[TRADE] SELL FAILED", err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

app.get("/api/account/:accountId/positions", async (req, res) => {
  const { accountId } = req.params;
  try {
    const userId = await getUserIdFromRequest(req);
    // Use the synchronized stream connection instead of RPC to avoid polling limits
    const connection = REGISTRY.stream.get(accountId);
    if (!connection || !connection.terminalState) {
      if (globalScope.ACTIVE_POSITIONS.has(accountId)) {
        return res.json(Array.from(globalScope.ACTIVE_POSITIONS.get(accountId).values()));
      }
      return res.json([]);
    }
    const positions = connection.terminalState.positions || [];
    res.json(positions);
  } catch (err: any) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

app.get("/api/account/:accountId/status", async (req, res) => {
  const { accountId } = req.params;
  try {
    const userId = await getUserIdFromRequest(req);
    const connection = REGISTRY.stream.get(accountId);
    
    const cache = globalScope.ACCOUNT_CACHE.get(accountId) || { positions: [], orders: [], lastUpdate: 0 };
    
    // Fix: connection.getState() might not be a function in some SDK versions
    let metaApiReady = false;
    if (connection) {
       metaApiReady = connection.terminalState?.connected === true && connection.terminalState?.connectedToBroker === true;
    }

    const account = metaapi ? await getAccount(accountId).catch(() => null) : null;
    const state = account ? account.state : 'UNDEPLOYED';
    const connectionStatus = account ? account.connectionStatus : 'DISCONNECTED';
    
    res.json({
        ready: !!globalScope.READY_STATE.get(accountId),
        streamActive: !!globalScope.STREAM_ACTIVE.get(accountId),
        metaApiReady,
        state,
        connectionStatus,
        lastTick: globalScope.LAST_TICK_TIME.get(accountId) || 0,
        positions: Array.isArray(cache.positions) ? cache.positions : [],
        orders: Array.isArray(cache.orders) ? cache.orders : [],
        lastCacheUpdate: cache.lastUpdate || 0,
        eaDeployed: !!globalScope.EA_REGISTRY[accountId]?.deployed,
        algoRunning: !!globalScope.ALGO_RUNNING.get(accountId)
    });
  } catch (err: any) {
    console.error(`[API] Status poll error for ${accountId}:`, err.message);
    res.status(err.message?.includes("Unauthorized") ? 401 : 500).json({ error: sanitizeError(err) });
  }
});

app.post("/api/account/:accountId/strategy-settings", async (req, res) => {
  const { accountId } = req.params;
  const { symbol, lotSize, maxTrades, timeframe } = req.body || {};
  try {
    const userId = await getUserIdFromRequest(req);
    
    // ENFORCEMENT: Block changes if algo is active
    const isRunning = globalScope.ALGO_RUNNING.get(accountId);
    if (isRunning) {
       const current = globalScope.STRATEGY_SETTINGS.get(accountId) || {};
       if (symbol && current.symbol && symbol !== current.symbol) {
          return res.status(400).json({ error: "Cannot change symbol while strategy is active. STOP the engine first." });
       }
       if (timeframe && current.timeframe && timeframe !== current.timeframe) {
          return res.status(400).json({ error: "Cannot change timeframe while strategy is active. STOP the engine first." });
       }
    }

    globalScope.STRATEGY_SETTINGS.set(accountId, { symbol, lotSize, maxTrades, timeframe });
    console.log(`[STRATEGY] Settings updated for ${accountId}: symbol=${symbol}, lotSize=${lotSize}, maxTrades=${maxTrades}, tf=${timeframe}`);
    
    // Proactive cleanup of old symbols when settings change
    if (symbol) {
        cleanupAccountStreams(accountId, symbol, timeframe || '1m').catch(() => {});
    }
    
    // Proactive sync check: Ensure symbol list is updated in cache
    getSymbolsCached(metaapi, accountId).catch(() => {});
    
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

app.post("/api/account/:accountId/algo/toggle", async (req, res) => {
  const { accountId } = req.params;
  const { enabled } = req.body || {};
  try {
    const userId = await getUserIdFromRequest(req);
    const mode = 'STRATEGY';
    const source = 'NODE_STRATEGY';
    
    if (enabled) {
      // VALIDATION: Ensure symbol is valid before starting
      const settings = globalScope.STRATEGY_SETTINGS.get(accountId);
      if (!settings || !settings.symbol || settings.symbol.length < 3) {
         return res.status(400).json({ error: "No valid symbol configured. Set symbol before starting." });
      }

      const symbols = await getSymbolsCached(metaapi, accountId);
      let isValidSymbol = false;
      if (symbols.length > 0) {
         if (symbols.includes(settings.symbol)) {
            isValidSymbol = true;
         } else {
            // Fuzzy match (e.g. suffixes)
            const match = symbols.find((s: string) => s === settings.symbol || s.startsWith(settings.symbol + ".") || s.startsWith(settings.symbol + "#") || (s.endsWith(settings.symbol) && s.length <= settings.symbol.length + 3));
            if (match) {
               console.log(`[ALGO] Normalizing start symbol ${settings.symbol} -> ${match}`);
               settings.symbol = match;
               globalScope.STRATEGY_SETTINGS.set(accountId, settings);
               isValidSymbol = true;
            }
         }
      }

      if (symbols.length > 0 && !isValidSymbol) {
         return res.status(400).json({ error: `Symbol ${settings.symbol} is not found in your broker's symbol list. Available symbols: ${symbols.slice(0, 10).join(', ')}...` });
      }
    }

    globalScope.ALGO_RUNNING.set(accountId, !!enabled);
    
    if (enabled) {
      logMessage(accountId, 'INFO', '[STRATEGY] Node Engine: Local analysis cycle started.', {}, 'NODE_STRATEGY');

      // Ensure terminal-side algo trading is enabled
      try {
        const connection = REGISTRY.stream.get(accountId);
        if (connection && typeof (connection as any).setAlgoTradingEnabled === 'function') {
          await (connection as any).setAlgoTradingEnabled(true);
          console.log(`[ALGO] setAlgoTradingEnabled(true) for ${accountId}`);
        }
      } catch (e) {
        console.warn(`[ALGO] Could not enable terminal-side algo trading:`, e);
      }
    } else {
      logMessage(accountId, 'INFO', `[${mode}] Execution sequence terminated as requested.`, {}, source);
    }
    
    console.log(`[ALGO] State for ${accountId} set to ${enabled} (${mode})`);
    res.json({ success: true, enabled: !!enabled });
  } catch (err: any) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

app.get("/api/account/:accountId/history", async (req, res) => {
  const { accountId } = req.params;
  const limit = req.query.limit || 10;
  try {
    const userId = await getUserIdFromRequest(req);
    
    // Check if account is even deployed/connected before trying RPC
    const account = await getAccount(accountId);
    if (account.state !== 'DEPLOYED' || account.connectionStatus !== 'CONNECTED') {
       if (account.state !== 'DEPLOYED') {
          await syncUndeployedState(accountId);
       }
       return res.status(202).json({ 
         status: 'starting', 
         message: 'Account is still connecting to broker. Please wait up to 3 minutes.',
         historyOrders: [] 
       });
    }

    // Check RAM history cache to prevent hitting rate limits
    const cacheKey = `${accountId}_${limit}`;
    const now = Date.now();
    const cacheEntry = (globalScope.HISTORY_CACHE as Map<string, { lastFetchTime: number; history: any[] }>)?.get(cacheKey);
    
    // Allow returns from memory cache if less than 60 seconds old
    if (cacheEntry && (now - cacheEntry.lastFetchTime < 60 * 1000)) {
       return res.json(cacheEntry.history);
    }

    try {
      const connection = await getRPCConnection(accountId);
      // Extend time range to ensure we pick up recent trades even with small clock skews
      const startTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); 
      const endTime = new Date(Date.now() + 10 * 60 * 1000); // 10 mins into future for safety
      const history = await connection.getHistoryOrdersByTimeRange(startTime, endTime, 0, Number(limit));
      
      // Save to cache
      if (!globalScope.HISTORY_CACHE) {
         globalScope.HISTORY_CACHE = new Map();
      }
      globalScope.HISTORY_CACHE.set(cacheKey, {
         lastFetchTime: now,
         history: history
      });

      return res.json(history);
    } catch (err: any) {
      console.warn(`[API] History fetch error for ${accountId}, utilizing fallback mechanism. Error:`, err.message);
      
      // Fallback 1: Return stale cache if available
      if (cacheEntry) {
         console.info(`[API] History Fallback (Stale Cache) served for ${accountId}. Cache age: ${Math.round((now - cacheEntry.lastFetchTime) / 1000)}s`);
         return res.json(cacheEntry.history);
      }
      
      // Fallback 2: Retrieve matched records from synchronized stream historyStorage
      const streamConnection = REGISTRY.stream.get(accountId);
      if (streamConnection && streamConnection.historyStorage) {
         const streamHistory = streamConnection.historyStorage.historyOrders || [];
         const sorted = [...streamHistory].sort((a: any, b: any) => {
            const timeA = a.time ? new Date(a.time).getTime() : 0;
            const timeB = b.time ? new Date(b.time).getTime() : 0;
            return timeB - timeA;
         });
         const sliced = sorted.slice(0, Number(limit));
         if (sliced.length > 0) {
            console.info(`[API] History Fallback (Stream Storage) served for ${accountId} with ${sliced.length} synchronized history orders.`);
            return res.json(sliced);
         }
      }
      
      // Fallback 3: Return a successful empty array instead of 500 error to keep the dashboard stable
      console.warn(`[API] History Fallback (Empty Dataset) served for ${accountId}.`);
      return res.json([]);
    }
  } catch (err: any) {
    console.error(`[API] Fatal error in history endpoint for ${accountId}:`, err.message);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

app.get("/api/account/:accountId/metastats", async (req, res) => {
  const { accountId } = req.params;
  try {
    const userId = await getUserIdFromRequest(req);
    
    // Check account connection status first to avoid hanging browser requests
    const accountCheck = await getAccount(accountId);
    if (accountCheck.state !== 'DEPLOYED' || accountCheck.connectionStatus !== 'CONNECTED') {
        if (accountCheck.state !== 'DEPLOYED') {
           await syncUndeployedState(accountId);
        }
        return res.status(202).json({ 
          status: 'synchronizing', 
          message: 'Account is booting or connecting. MetaStats will be available shortly.',
          trades: [],
          metrics: {}
        });
    }

    if (!token) return res.status(500).json({ error: "Internal Server Error: No MetaApi token configured" });
    
    const headers = { 
      'auth-token': token,
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
    };
    
    const httpsAgent = new https.Agent({ rejectUnauthorized: false });

    // Optional: Auto-enable metastats if possible and account is deployed
    try {
        // Refresh account from server to get fresh connectionStatus and fields
        const account = await metaapi.metatraderAccountApi.getAccount(accountId);
        const region = account.region || 'london';
        const domainSuffix = 'agiliumtrade.agiliumtrade.ai';
        
        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - 180 * 24 * 60 * 60 * 1000); // 180 days instead of 90
        
        if (account && account.state === 'DEPLOYED' && !account.metastatsApiEnabled) {
            console.log(`[METASTATS] Proactively enabling MetaStats for account ${accountId}...`);
            try {
                await account.update({ metastatsApiEnabled: true });
                console.log(`[METASTATS] Successfully enabled MetaStats for ${accountId}`);
                await new Promise(r => setTimeout(r, 1000));
            } catch (updateErr: any) {
                // If it fails, we ignore it and continue since stats might already be available or enabled elsewhere
                console.warn(`[METASTATS] Auto-enable skipped for ${accountId} (Already enabled or restricted)`);
            }
        }

        // Check connection status from refreshed account
        if (account && account.connectionStatus !== 'CONNECTED') {
            console.warn(`[METASTATS] Account ${accountId} is ${account.connectionStatus}. Attempting fetch anyway...`);
        }

        const metricsUrl = `https://metastats-api-v1.${region}.${domainSuffix}/users/current/accounts/${accountId}/metrics`;
        const tradesUrl = `https://metastats-api-v1.${region}.${domainSuffix}/users/current/accounts/${accountId}/trades?startTime=${startTime.toISOString()}&endTime=${endTime.toISOString()}`;

        console.log(`[METASTATS] Fetching metrics from ${region} REST API for ${accountId}...`);
        const metricsRes = await axios.get(metricsUrl, { headers, httpsAgent });
        const metrics = metricsRes.data;
        
        console.log(`[METASTATS] Fetching trades from ${region} REST API for ${accountId}...`);
        const tradesRes = await axios.get(tradesUrl, { headers, httpsAgent });
        const trades = tradesRes.data;
        
        res.json({ metrics, trades });
    } catch (e: any) {
        // We handle this inside the main catch
        throw e;
    }
  } catch (err: any) {
    const status = err.response?.status || err.status;
    if (status === 401 || status === 403 || (err.message && err.message.includes('403'))) {
      const apiError = err.response?.data?.message || err.message;
      console.warn(`[METASTATS] Auth failed for ${accountId}:`, apiError);
      return res.status(403).json({ error: `MetaStats API Authorization Failed: ${apiError}. Please ensure MetaStats is enabled for this account.` })
    }
    if (status === 400 || (err.message && err.message.includes('400'))) {
      const msg = err.response?.data?.message || err.message;
      if (msg.includes("not synchronized") || msg.includes("not available")) {
        return res.status(200).json({ 
          metrics: {}, 
          trades: [], 
          status: 'synchronizing',
          message: "Journal is synchronizing. This typically takes 5-10 minutes after initial setup or your first trade." 
        });
      }
      return res.status(400).json({ error: msg });
    }
    if (status === 404 || (err.message && err.message.includes('404'))) {
      console.log(`[METASTATS] No data found for account ${accountId} (404). Initial sync pending.`);
      return res.status(200).json({ 
        metrics: {}, 
        trades: [], 
        status: 'synchronizing',
        message: "No trading history found in MetaStats yet. Please wait 5-10 minutes for your first trade to appear."
      });
    }
    console.error(`[METASTATS] Error fetching stats for ${accountId}:`, err.response?.data || err.message);
    res.status(500).json({ error: sanitizeError(err.response?.data?.message || err) });
  }
});

app.get("/api/account/:accountId/symbols", async (req, res) => {
  const { accountId } = req.params;
  try {
    const userId = await getUserIdFromRequest(req);
    const symbols = await getSymbolsCached(metaapi, accountId);
    res.json(symbols);
  } catch (err: any) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

async function recoverLeases() {
  console.log("[LEASE] Recovering active EAs from Supabase...");
  const leases = await TradingController.getActiveLeases();
  for (const lease of leases) {
    try {
      console.log(`[LEASE] Checking deployment for ${lease.account_id}...`);
      const account = await getAccount(lease.account_id);
      
      if (account.state !== 'DEPLOYED' || account.connectionStatus !== 'CONNECTED') {
        console.warn(`[WATCHDOG] Account ${lease.account_id} not active (state: ${account.state}, conn: ${account.connectionStatus}). Forcing cleanup.`);
        
        if (account.state !== 'DEPLOYED') {
          await syncUndeployedState(lease.account_id);
        } else {
          // Just basic cleanup if deployed but unconnected
          REGISTRY.stream.delete(lease.account_id);
          REGISTRY.rpc.delete(lease.account_id);
          globalScope.ACCOUNT_READY?.delete(lease.account_id);
          globalScope.STREAM_PENDING?.delete(lease.account_id);
        }
        
        continue;
      }

      // Ensure connection is pinned and established via singleton registry
      await setupStreaming(lease.account_id).catch(err => 
        console.error(`[LEASE] Connection establishing failed for ${lease.account_id}:`, err)
      );

      // Re-trigger connection status check - connection will auto-subscribe
    } catch (e: any) {
      console.error(`[LEASE] Recovery failed for ${lease.account_id}:`, e);
    }
  }
}

// EXPIRY MONITOR - Enforces subscription expiry globally
setInterval(async () => {
    if (!adminSupabase || !metaapi) return;
    try {
       // Fetch all users with expired subscriptions that still have access = false? No, where has_access = true but expired
       const { data: expiredUsers } = await adminSupabase
          .from("users")
          .select("id, email, expires_at, has_access")
          .lte("expires_at", new Date().toISOString())
          .eq("has_access", true);
          
       if (expiredUsers && expiredUsers.length > 0) {
           for (const user of expiredUsers) {
               console.log(`[SUBSCRIPTION] User ${user.email} subscription expired. Revoking access and undeploying accounts.`);
               
               await adminSupabase.from("users").update({ has_access: false, payment_status: 'expired' }).eq("id", user.id);
               
               const leases = await TradingController.getActiveLeases(user.id);
               for (const lease of leases) {
                   const accountId = lease.account_id;
                   try {
                       const account = await getAccount(accountId);
                       if (account.state === 'DEPLOYED') {
                           await account.undeploy();
                       }
                   } catch(e) {}
                   await TradingController.updateEAStatus(accountId, user.id, false, 'EXPIRED_UNDEPLOYED');
               }
           }
       }
    } catch(e) {
       console.error("[MONITOR] Expiry enforcement failed:", e);
    }
}, 60000); // Check every minute

// LEASE HEARTBEAT & MONITOR
setInterval(async () => {
  const leases = await TradingController.getActiveLeases();
  for (const lease of leases) {
    await TradingController.updateHeartbeat(lease.account_id);
    const lastHeartbeat = new Date(lease.last_heartbeat).getTime();
    if (Date.now() - lastHeartbeat > 30000) {
      console.warn(`[LEASE] Lease stale for ${lease.account_id}. Manual intervention or user reload required.`);
    }
  }
}, 10000);

// EA ENGINE LOOP (Continuous Analysis Logging)
setInterval(() => {
  if (!globalScope.ALGO_RUNNING) return;
  for (const [accountId, isRunning] of globalScope.ALGO_RUNNING.entries()) {
    if (isRunning) {
      const mode = 'STRATEGY';
      
      // EA Mode: Skip internal analysis loop.
      

      // 2. Determine target symbols: STRICT ENFORCEMENT
      const settings = globalScope.STRATEGY_SETTINGS.get(accountId);
      const activeSymbol = settings?.symbol;

      if (!activeSymbol) {
        // Skip if no configuration exists to prevent random trading
        continue;
      }

      const buffer = globalScope.CANDLE_STORE?.[accountId]?.[activeSymbol] || [];
      
      // Reduced frequency of analysis logs to save CPU and reduce UI noise
      const lastAnalysisLog = globalScope.LAST_ANALYSIS_LOG?.get(accountId) || 0;
      const shouldLogAnalysis = Date.now() - lastAnalysisLog > 30000; // Log every 30 seconds if nothing interesting

      if (shouldLogAnalysis) {
        logMessage(accountId, "ANALYSIS", `Scanning market (${activeSymbol})...`, {
          symbol: activeSymbol,
          bufferSize: buffer.length,
          mode: 'STRATEGY'
        }, 'NODE_STRATEGY');
        if (!globalScope.LAST_ANALYSIS_LOG) globalScope.LAST_ANALYSIS_LOG = new Map();
        globalScope.LAST_ANALYSIS_LOG.set(accountId, Date.now());
      }
      
      if (!buffer || buffer.length < 50) {
        if (shouldLogAnalysis) {
          logMessage(accountId, "WARN", `Waiting for candle stream (Buffer < 50 for ${activeSymbol})...`, { 
            count: buffer?.length || 0,
            symbol: activeSymbol,
            availableSymbols: globalScope.CANDLE_STORE[accountId] ? Object.keys(globalScope.CANDLE_STORE[accountId]) : []
          }, 'NODE_STRATEGY');
        }
        continue;
      }

      const lastCandle = buffer[buffer.length - 1];
      const lastCandleTime = new Date(lastCandle.time).getTime();

      // 3. Trade Management (One trade at a time per account/symbol)
      const activePositions = globalScope.ACTIVE_POSITIONS.get(accountId);
      const hasOpenPosition = activePositions && Array.from(activePositions.values()).some((p: any) => p.symbol === activeSymbol);

      if (hasOpenPosition) {
        // Only log skip once every few mins to keep journal clean
        if (Date.now() % 30000 < 1000) {
          logMessage(accountId, "SKIP", "Position active", { symbol: activeSymbol }, 'NODE_STRATEGY');
        }
        continue;
      }

      // Check cooldown (prevent rapid flips)
      const lastTradeTime = globalScope.LAST_TRADE_TIME?.get(`${accountId}:${activeSymbol}`) || 0;
      if (Date.now() - lastTradeTime < 60000) { // 60 seconds cooldown
          continue;
      }

      // 4. STRATEGY ENGINE: Heatmap & Pattern Confluence
      const analysis = performPatternAnalysis(accountId, activeSymbol, buffer);
      
      if (shouldLogAnalysis || (analysis && analysis.detections.length > 5)) {
        const detCount = analysis?.detections?.length || 0;
        const zoneCount = analysis?.zones?.length || 0;
        if (detCount > 0 || zoneCount > 0) {
          logMessage(accountId, "ANALYSIS", `Pattern Engine: Detected ${detCount} patterns and ${zoneCount} zones active on ${activeSymbol}.`, {
            detections: detCount,
            zones: zoneCount
          }, 'NODE_STRATEGY');
        }
      }

      let signal: 'BUY' | 'SELL' | null = null;
      
      if (analysis) {
        // Broadcast Analysis to listeners (only if something changed or every few seconds to save bandwidth)
        if (subscriptions.has(accountId)) {
          subscriptions.get(accountId)?.forEach(ws => {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({
                type: 'MARKET_ANALYSIS_UPDATE',
                accountId,
                symbol: activeSymbol,
                analysis
              }));
            }
          });
        }

        // Alert for notable patterns (e.g. engulfing) on the latest closed candle
        if (buffer.length >= 2) {
            const lastClosed = buffer[buffer.length - 2];
            const notableDetections = analysis.detections.filter(
                (d: any) => d.time === lastClosed.time && d.pattern.toLowerCase().includes('engulfing')
            );
            
            if (!globalScope.NOTIFIED_PATTERNS) globalScope.NOTIFIED_PATTERNS = new Set<string>();
            
            notableDetections.forEach((d: any) => {
                const sig = `${accountId}:${activeSymbol}:${d.time}:${d.pattern}`;
                if (!globalScope.NOTIFIED_PATTERNS.has(sig)) {
                    globalScope.NOTIFIED_PATTERNS.add(sig);
                    logMessage(accountId, "INFO", `Notable Pattern Identified on ${activeSymbol}: ${d.pattern.toUpperCase()}`, { pattern: d.pattern, polarity: d.polarity, close: lastClosed.close }, 'NODE_STRATEGY');
                }
            });
        }

        // Signal Logic: Heatmap-based support/resistance confluence
        const recentDetections = analysis.detections.filter((d: any) => 
          new Date(d.time).getTime() >= lastCandleTime - 1200000 // Last 20 mins relative to chart
        );

        const bullPatterns = recentDetections.filter((d: any) => d.polarity > 0);
        const bearPatterns = recentDetections.filter((d: any) => d.polarity < 0);

        const bullCount = bullPatterns.length;
        const bearCount = bearPatterns.length;

        // Smart Confluence Strategy & Learning System
        let buyScore = 50; 
        let sellScore = 50;
        let buyConfluences: string[] = [];
        let sellConfluences: string[] = [];

        // 1. Candlestick Patterns (Confluence)
        if (bullCount > 0) {
            buyScore += bullCount * 8;
            buyConfluences.push(`${bullCount}x Bullish Patterns`);
        }
        if (bearCount > 0) {
            sellScore += bearCount * 8;
            sellConfluences.push(`${bearCount}x Bearish Patterns`);
        }

        // 2. Double Top / Bottom Detection (Fractals)
        const findPeaksAndValleys = (cands: any[]) => {
            const peaks = [];
            const valleys = [];
            for (let i = 2; i < cands.length - 2; i++) {
                const c = cands[i];
                if (c.high > cands[i-1].high && c.high > cands[i-2].high && c.high > cands[i+1].high && c.high > cands[i+2].high) {
                    peaks.push(c);
                }
                if (c.low < cands[i-1].low && c.low < cands[i-2].low && c.low < cands[i+1].low && c.low < cands[i+2].low) {
                    valleys.push(c);
                }
            }
            return { peaks, valleys };
        };
        const { peaks, valleys } = findPeaksAndValleys(buffer.slice(-40));
        
        if (valleys.length >= 2) {
            const v1 = valleys[valleys.length - 1];
            const v2 = valleys[valleys.length - 2];
            if (Math.abs(v1.low - v2.low) / v1.low < 0.0015 && lastCandle.close > v1.low) {
                buyScore += 15;
                buyConfluences.push("Double Bottom Detected");
            }
        }
        if (peaks.length >= 2) {
            const p1 = peaks[peaks.length - 1];
            const p2 = peaks[peaks.length - 2];
            if (Math.abs(p1.high - p2.high) / p1.high < 0.0015 && lastCandle.close < p1.high) {
                sellScore += 15;
                sellConfluences.push("Double Top Detected");
            }
        }

        // 3. Breakout & Retest Logic (Market Memory)
        const adaptiveKey = `${accountId}:${activeSymbol}`;
        if (!globalScope.ADAPTIVE_ZONES) globalScope.ADAPTIVE_ZONES = {};
        if (!globalScope.ADAPTIVE_ZONES[adaptiveKey]) {
            globalScope.ADAPTIVE_ZONES[adaptiveKey] = { flippedToSupport: [], flippedToResistance: [] };
        }
        const tracked = globalScope.ADAPTIVE_ZONES[adaptiveKey];

        // Track zone breakouts to flip S/R
        analysis.zones.forEach((z: any) => {
            if (!z.isSupport && lastCandle.close > z.high * 1.001) { // Resistance Broken UP -> Becomes Support
                if (!tracked.flippedToSupport.some((t: any) => Math.abs(t.low - z.low) < 0.0001)) {
                    tracked.flippedToSupport.push({ ...z });
                }
            }
            if (z.isSupport && lastCandle.close < z.low * 0.999) { // Support Broken DOWN -> Becomes Resistance
                if (!tracked.flippedToResistance.some((t: any) => Math.abs(t.low - z.low) < 0.0001)) {
                    tracked.flippedToResistance.push({ ...z });
                }
            }
        });
        // Keep memory fresh
        tracked.flippedToSupport = tracked.flippedToSupport.slice(-5);
        tracked.flippedToResistance = tracked.flippedToResistance.slice(-5);

        // Rejection Filters (Don't catch falling knives)
        const bodySize = Math.abs(lastCandle.close - lastCandle.open);
        const lowerWick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
        const upperWick = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
        
        const isBullishCandle = lastCandle.close > lastCandle.open;
        const isBearishCandle = lastCandle.close < lastCandle.open;
        
        // A strong bullish rejection means it bounced up (long wick) OR is printing a green candle off the level.
        const strongBullishRejection = isBullishCandle || (lowerWick > bodySize * 2);
        const strongBearishRejection = isBearishCandle || (upperWick > bodySize * 2);

        // Check Retest
        const retestSupport = tracked.flippedToSupport.some((z: any) => 
            lastCandle.low <= z.high * 1.002 && lastCandle.close >= z.low && strongBullishRejection
        );
        if (retestSupport) {
            buyScore += 35;
            buyConfluences.push("Sniper Retest: Broken Resistance to Support (Rejected)");
        }
        const retestResistance = tracked.flippedToResistance.some((z: any) => 
            lastCandle.high >= z.low * 0.998 && lastCandle.close <= z.high && strongBearishRejection
        );
        if (retestResistance) {
            sellScore += 35;
            sellConfluences.push("Sniper Retest: Broken Support to Resistance (Rejected)");
        }

        // Standard Support/Resistance Confluence
        const nearSupport = analysis.zones.some((z: any) => z.isSupport && lastCandle.close >= z.low * 0.998 && lastCandle.close <= z.high * 1.002 && strongBullishRejection);
        if (nearSupport) {
            buyScore += 25;
            buyConfluences.push("Key Support Bounce");
        }
        const nearResistance = analysis.zones.some((z: any) => !z.isSupport && lastCandle.close >= z.low * 0.998 && lastCandle.close <= z.high * 1.002 && strongBearishRejection);
        if (nearResistance) {
            sellScore += 25;
            sellConfluences.push("Key Resistance Rejection");
        }

        // Momentum / Buying Pressure
        const buyingPressure = lastCandle.close > lastCandle.open && (lastCandle.close - lastCandle.open) / lastCandle.open > 0.001;
        const sellingPressure = lastCandle.close < lastCandle.open && (lastCandle.open - lastCandle.close) / lastCandle.open > 0.001;

        if (buyingPressure) buyConfluences.push("Heavy Buying Pressure");
        if (sellingPressure) sellConfluences.push("Heavy Selling Pressure");

        // STRICT ENTRY RULES (Anti-FOMO)
        // Must have candlestick pattern confirmation AND must be at a valid SR/Retest zone
        const isValidBuyZone = nearSupport || retestSupport || (valleys.length >= 2);
        const isValidSellZone = nearResistance || retestResistance || (peaks.length >= 2);

        const buyConfidence = Math.min(99, buyScore);
        const sellConfidence = Math.min(99, sellScore);

        if (bullCount > 0 && isValidBuyZone && buyConfidence >= 75 && buyConfidence > sellConfidence) {
            signal = 'BUY';
            logMessage(accountId, "SIGNAL", `STRATEGY BUY (Confidence: ${buyConfidence}%) - Reasons: ${buyConfluences.join(', ')}`, { confidence: buyConfidence, confluences: buyConfluences, close: lastCandle.close }, 'NODE_STRATEGY');
        } else if (bearCount > 0 && isValidSellZone && sellConfidence >= 75 && sellConfidence > buyConfidence) {
            signal = 'SELL';
            logMessage(accountId, "SIGNAL", `STRATEGY SELL (Confidence: ${sellConfidence}%) - Reasons: ${sellConfluences.join(', ')}`, { confidence: sellConfidence, confluences: sellConfluences, close: lastCandle.close }, 'NODE_STRATEGY');
        }
      }

      // 5. AUTO-EXECUTION BRIDGE (STRICT LIMITS)
      if (signal) {
          const mode = 'STRATEGY';
          if (mode === 'STRATEGY' && globalScope.ALGO_RUNNING.get(accountId)) {
              (async () => {
                  try {
                      const settings = globalScope.STRATEGY_SETTINGS.get(accountId) || { lotSize: 0.01, maxTrades: 1, symbol: activeSymbol };
                      const lotSize = Math.max(0.01, settings.lotSize || 0.01);
                      const maxTrades = Math.max(1, settings.maxTrades || 1);
                      
                      // CRITICAL: Real-time active position check before every execution
                      const positionsMap = globalScope.ACTIVE_POSITIONS.get(accountId) || new Map();
                      const currentTrades = Array.from(positionsMap.values()).filter((p: any) => p.comment === 'ALGOTRADE').length;

                      if (currentTrades >= maxTrades) {
                          if (Date.now() % 5 === 0) logMessage(accountId, "SKIP", `Max trade capacity reached (${currentTrades}/${maxTrades})`, {}, 'NODE_STRATEGY');
                          return;
                      }

                      logMessage(accountId, "TRADE", `Executing ${signal} on ${activeSymbol}`, { lotSize, currentTrades, maxTrades }, 'NODE_STRATEGY');
                      
                      const connection = await getRPCConnection(accountId);
                      if (connection) {
                          const orderParams = { comment: 'ALGOTRADE', magic: 409 };
                          if (signal === 'BUY') {
                              await connection.createMarketBuyOrder(activeSymbol, lotSize, 0, 0, orderParams);
                          } else {
                              await connection.createMarketSellOrder(activeSymbol, lotSize, 0, 0, orderParams);
                          }
                          logMessage(accountId, "SUCCESS", `Order Executed Successfully`, { signal, symbol: activeSymbol, lotSize }, 'NODE_STRATEGY');
                          globalScope.LAST_TRADE_TIME.set(`${accountId}:${activeSymbol}`, Date.now());
                      }
                  } catch (e: any) {
                      logMessage(accountId, "ERROR", `Execution Failed: ${e.message}`, { symbol: activeSymbol }, 'NODE_STRATEGY');
                  }
              })();
          }
      }
    }
  }
}, 3000);

// Vite & Start Server
async function startServer() {
  const httpServer = app.listen(PORT, "0.0.0.0", () => {
    console.log(`[CORE] SDK Terminal running on port ${PORT}`);
    
    // Recover leases in background after server is listening
    recoverLeases().catch(err => {
      console.error("[LEASE] Background recovery failed:", err);
    });
  });

  globalWss = new WebSocketServer({ server: httpServer });
  globalWss.on("connection", (ws) => {
    const clientSubs = new Set<string>();
    console.log("[WS] Client connected");

    ws.on("message", (msg) => {
      try {
        const data = JSON.parse(msg.toString());
        if (data.type === 'subscribe' && data.accountId) {
          const accountId = data.accountId;
          const token = data.token;
          
          (async () => {
             try {
                if (!token) {
                   console.error("[WS] Denied: No token provided for subscribe");
                   ws.send(JSON.stringify({ type: 'ERROR', message: 'Authentication required' }));
                   return;
                }
                
                const { data: userData, error: authError } = await adminSupabase.auth.getUser(token);
                if (authError || !userData?.user?.id) {
                   console.error("[WS] Denied: Invalid token");
                   ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid authentication' }));
                   return;
                }
                const userId = userData.user.id;

                // Validate Ownership
                const { data: account, error: accError } = await adminSupabase
                   .from('ea_deployments')
                   .select('user_id')
                   .eq('account_id', accountId)
                   .maybeSingle();
                   
                if (account && account.user_id !== userId) {
                   console.error(`[WS] SECURITY REJECT: User ${userId} attempted to subscribe to foreign deploy ${accountId}`);
                   ws.send(JSON.stringify({ type: 'ERROR', message: 'Unauthorized account access' }));
                   return;
                }

                const { data: tradingAcc } = await adminSupabase
                   .from('trading_accounts')
                   .select('user_id')
                   .eq('id', accountId)
                   .maybeSingle();

                if (tradingAcc && tradingAcc.user_id !== userId) {
                   console.error(`[WS] SECURITY REJECT: User ${userId} attempted to subscribe to foreign account ${accountId}`);
                   ws.send(JSON.stringify({ type: 'ERROR', message: 'Unauthorized account access' }));
                   return;
                }

                // Authorized!
                clientSubs.add(accountId);
                if (!subscriptions.has(accountId)) subscriptions.set(accountId, new Set());
                subscriptions.get(accountId)?.add(ws);
                
                if (globalScope.DEAD_SESSIONS_TIMER?.has(accountId)) {
                    clearTimeout(globalScope.DEAD_SESSIONS_TIMER.get(accountId));
                    globalScope.DEAD_SESSIONS_TIMER.delete(accountId);
                    console.log(`[WATCHDOG] Session resurrected for ${accountId}, cancelled cleanup.`);
                }
                
                const logs = TRADING_JOURNAL_STORE.get(accountId) || [];
                ws.send(JSON.stringify({
                  type: 'TRADING_JOURNAL_SNAPSHOT',
                  data: logs
                }));
                
                ws.send(JSON.stringify({ type: 'ACCOUNT_CONNECTING', accountId }));
                
                // Trigger background MetaApi connection
                setupStreaming(accountId).catch(err => {
                    console.error("[WS] MetaApi Boot Failure:", err.message);
                    ws.send(JSON.stringify({ type: 'ERROR', message: `MetaApi Boot Failure: ${err.message}` }));
                });

                // Re-hydration: If the stream is already locked and ready, send the READY states immediately
                if (REGISTRY.locked.get(accountId) && globalScope.STREAM_READY.get(accountId)) {
                    console.log(`[SDK_REHYDRATE] Account ${accountId} is already synchronized. Pushing states to connecting client.`);
                    ws.send(JSON.stringify({ type: 'status:update', accountId, status: 'READY' }));
                    ws.send(JSON.stringify({ type: 'ACCOUNT_READY', accountId, status: 'READY' }));
                    ws.send(JSON.stringify({ type: 'SYNC_READY', accountId }));
                    
                    const positions = globalScope.ACTIVE_POSITIONS?.get(accountId) ? Array.from(globalScope.ACTIVE_POSITIONS.get(accountId).values()) : [];
                    ws.send(JSON.stringify({ type: 'POSITIONS_SNAPSHOT', accountId, data: positions }));

                    const connection = REGISTRY.stream.get(accountId);
                    const info = connection?.terminalState?.accountInformation;
                    
                    ws.send(JSON.stringify({
                        type: 'EXECUTION_MODE_UPDATE',
                        accountId,
                        mode: 'STRATEGY'
                    }));

                    if (info) {
                        ws.send(JSON.stringify({
                            type: 'account:update',
                            accountId,
                            balance: info.balance ?? 0,
                            equity: info.equity ?? 0,
                            currency: info.currency ?? 'USD'
                        }));
                    }
                }
             } catch (e) {
                 console.error("[WS] Sub error", e);
             }
          })();
          
        } else if (data.type === 'STREAM_SUBSCRIBE' && data.accountId && data.symbol && data.timeframe) {
          console.log(`[WS_RECV] STREAM_SUBSCRIBE for ${data.symbol} on ${data.accountId}`);
          const { accountId, symbol, timeframe } = data;
          (async () => {
             try {
                // 1. Initiate Streaming Connection & Synchronize
                const connection = await setupStreaming(accountId);
                
                if (typeof connection.subscribeToMarketData !== 'function') {
                   throw new Error("STREAM CONNECTION REQUIRED");
                }

                // 2. Start Subscriptions (SDK ONLY - NO REST)
                await safeSubscribe(connection, symbol, timeframe, accountId).catch(err => {
                   console.error(`[STREAM_SUBSCRIBE_ERROR] Failed for ${symbol} on ${accountId}:`, err);
                   try {
                     ws.send(JSON.stringify({ type: 'log:trade', accountId, level: 'ERROR', message: `Subscription failed: ${err.message}`, data: { symbol } }));
                   } catch (e) {}
                });
                
                // Immediately push account info so UI unblocks even if history is slow/fails
                const info = connection.terminalState?.accountInformation;
                ws.send(JSON.stringify({
                    type: 'account:update',
                    accountId,
                    balance: info?.balance ?? 0,
                    equity: info?.equity ?? 0,
                    currency: info?.currency ?? 'USD'
                }));
                
                // 3. Hydrate candles on stream connect
                let history = [];
                const isShortSymbol = !symbol || symbol.length < 3;
                
                if (isShortSymbol) {
                    console.log(`[SDK_RPC] Skipping history for short/incomplete symbol: ${symbol}`);
                } else {
                    console.log(`[SDK_RPC] Fetching historical candles for ${symbol}...`);
                    try {
                        let finalSymbol = symbol;
                        
                        const fetchCandles = async (s: string) => {
                            const account = await metaapi.metatraderAccountApi.getAccount(accountId);
                            if (typeof account.getHistoricalCandles === 'function') {
                                return await account.getHistoricalCandles(s, timeframe, undefined, 300);
                            } else {
                                console.warn('[SDK_RPC] account.getHistoricalCandles is not a function. Falling back to RPC directly on account...');
                                // G2 / non-G1 might not support it, return empty and rely on streaming
                                return [];
                            }
                        };

                        try {
                            history = await fetchCandles(finalSymbol);
                        } catch (err: any) {
                            if (err.message.includes('not exist') || err.message.includes('invalid')) {
                                console.log(`[SDK_RPC] Symbol ${symbol} not found. Attempting suffix search...`);
                                const specifications = await getSymbolsCached(metaapi, accountId);
                                const match = specifications.find((s: string) => s.startsWith(symbol) || s.endsWith(symbol));
                                if (match && match !== symbol) {
                                    console.log(`[SDK_RPC] Found fuzzy match: ${match}. Retrying...`);
                                    finalSymbol = match;
                                    history = await fetchCandles(finalSymbol);
                                } else {
                                    throw err;
                                }
                            } else {
                                throw err;
                            }
                        }
                    } catch (histErr: any) {
                        console.warn(`[SDK_HISTORY_WARN] Failed to load history for ${symbol}:`, histErr.message);
                    }
                }
                
                ws.send(JSON.stringify({
                  type: 'HISTORY_SNAPSHOT',
                  accountId,
                  symbol,
                  timeframe,
                  candles: history
                }));

                // Inject history into EA buffer (Hard Lock)
                if (history && history.length > 0) {
                   if (!globalScope.CANDLE_STORE[accountId]) globalScope.CANDLE_STORE[accountId] = {};
                   globalScope.CANDLE_STORE[accountId][symbol] = [...history].slice(-300);
                   globalScope.LATEST_CANDLES.set(`${accountId}:${symbol}`, globalScope.CANDLE_STORE[accountId][symbol]);
                   
                   const hMode = 'STRATEGY';
                   const hSource = 'NODE_STRATEGY';
                   logMessage(accountId, "INFO", `[${hMode}] History stream synchronized for ${symbol}`, { count: globalScope.CANDLE_STORE[accountId][symbol].length }, hSource);
                }

             } catch(err: any) {
                console.error(`[STREAM_WS_ERROR] ${err.message}`);
             }
          })();
        } else if (data.type === 'STREAM_UNSUBSCRIBE' && data.accountId && data.symbol && data.timeframe) {
          const { accountId, symbol, timeframe } = data;
          if (globalScope.ALGO_RUNNING?.get(accountId)) {
              console.log(`[SDK_PROTECT] Prevented unsubscribe from ${symbol} for ${accountId} because EA is running`);
              return;
          }
          (async () => {
             try {
                if (REGISTRY.stream.has(accountId)) {
                    const connection = REGISTRY.stream.get(accountId);
                    if (typeof connection.unsubscribeFromMarketData === 'function') {
                        await connection.unsubscribeFromMarketData(symbol, [
                            { type: 'quotes' },
                            { type: 'candles', timeframe }
                        ]);
                        console.log(`[SDK] Unsubscribed from ${symbol} (${timeframe}) for ${accountId}`);
                    }
                }
             } catch (err: any) {
                 console.warn(`[SDK] Unsubscribe failed: ${err.message}`);
             }
          })();
        } else if (data.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG' }));
        } else if (data.type === 'SYNC_STATE') {
          const { accountId, symbol } = data;
          if (accountId) {
             const targetSymbol = symbol || 'XAUUSDm';
             // 1. Send Candles Snapshot
             const candles = (globalScope.CANDLE_STORE?.[accountId]?.[targetSymbol]) || 
                             (globalScope.CANDLE_STORE?.[accountId]?.['XAUUSDm']) || 
                             (globalScope.CANDLE_STORE?.[accountId]?.['XAUUSD']) || 
                             globalScope.LATEST_CANDLES.get(`${accountId}:${targetSymbol}`) ||
                             globalScope.LATEST_CANDLES.get(`${accountId}:XAUUSDm`) || 
                             globalScope.LATEST_CANDLES.get(`${accountId}:XAUUSD`) || [];
             ws.send(JSON.stringify({
                 type: 'HISTORY_SNAPSHOT',
                 accountId,
                 symbol: targetSymbol,
                 candles: Array.isArray(candles) ? candles : [candles]
             }));

             // 2. Send Positions Snapshot
             const positions = globalScope.ACTIVE_POSITIONS.get(accountId);
             ws.send(JSON.stringify({
                 type: 'POSITIONS_SNAPSHOT',
                 accountId,
                 data: positions ? Array.from(positions.values()) : []
             }));

             // 4. Send Execution Mode
             ws.send(JSON.stringify({
                 type: 'EXECUTION_MODE_UPDATE',
                 accountId,
                 mode: 'STRATEGY'
             }));
          }
        } else if (data.type === 'SWITCH_MODE' && data.accountId && data.mode) {
           const { accountId, mode } = data;
           
           const currentMode = globalScope.EXECUTION_MODES.get(accountId) || 'STRATEGY';
           
           // User wants to lock EA mode for now, so we just allow the switch
           logMessage(accountId, "MODE", `SWITCH REQUESTED: ${currentMode} → ${mode}`, {}, 'SYSTEM');
           
           globalScope.EXECUTION_MODES.set(accountId, mode);
           logMessage(accountId, "MODE", `${mode}_ACTIVE. Execution mode switched successfully.`, { oldMode: currentMode }, 'SYSTEM');
           logMessage(accountId, "EXECUTION_ROUTER", `Mode selected: ${mode}`, { accountId }, 'SYSTEM');
           
           ws.send(JSON.stringify({
               type: 'EXECUTION_MODE_UPDATE',
               accountId,
               mode
           }));
        } else if (data.type === 'unsubscribe' && data.accountId) {
          clientSubs.delete(data.accountId);
          const accSubs = subscriptions.get(data.accountId);
          if (accSubs) {
            accSubs.delete(ws);
            if (accSubs.size === 0) cleanupAccount(data.accountId);
          }
        }
      } catch (e) {}
    });

    const cleanupAccount = async (accountId: string) => {
      console.log(`[SDK] No more client WebSocket listeners for ${accountId}. Pinning for 5 minutes before cleanup.`);
      subscriptions.delete(accountId);
      
      if (!globalScope.DEAD_SESSIONS_TIMER) globalScope.DEAD_SESSIONS_TIMER = new Map();
      const timer = setTimeout(async () => {
        try {
          console.log(`[WATCHDOG] Cleaning up dead session for ${accountId}`);
          const stream = REGISTRY.stream.get(accountId);
          if (stream) {
            await stream.close();
            REGISTRY.stream.delete(accountId);
          }
          const rpc = REGISTRY.rpc.get(accountId);
          if (rpc) {
            // Keep RPC around or close it? Better to close to save resources
            REGISTRY.rpc.delete(accountId);
          }
          globalScope.ACCOUNT_READY?.delete(accountId);
          globalScope.STREAM_PENDING?.delete(accountId);
          globalScope.DEAD_SESSIONS_TIMER?.delete(accountId);
        } catch (e) {
          console.error(`[WATCHDOG] Cleanup error for ${accountId}:`, e);
        }
      }, 5 * 60 * 1000);
      
      globalScope.DEAD_SESSIONS_TIMER.set(accountId, timer);
    };

    ws.on("close", async () => {
      console.log("[WS] Client disconnected — KEEPING EA + SDK ALIVE");
      for (const accountId of clientSubs) {
        const accSubs = subscriptions.get(accountId);
        if (accSubs) {
          accSubs.delete(ws);
          if (accSubs.size === 0) await cleanupAccount(accountId);
        }
      }
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const publicPath = path.join(process.cwd(), 'public');
    const distPath = path.join(process.cwd(), 'dist');
    
    // Serve public first for manifest, icons as raw files
    app.use('/icons', express.static(path.join(publicPath, 'icons'), { 
      setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    }));
    app.use('/manifest.json', express.static(path.join(publicPath, 'manifest.json'), {
      setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    }));
    app.use(express.static(publicPath));
    app.use(express.static(distPath));

    app.get('*all', (_, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

startServer().catch(err => {
  console.error("[CORE] FATAL: Server failed to start:", err);
  process.exit(1);
});
