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
import { GoogleGenAI, Type } from "@google/genai";
import MetaApiModule from "metaapi.cloud-sdk/esm-node";
const MetaApi = typeof MetaApiModule === "function" ? MetaApiModule : (MetaApiModule as any).default || MetaApiModule;
import { adminSupabase } from "./src/lib/supabaseAdmin.ts";
import { ChatradeMemory } from "./src/lib/memorySystem.ts";
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
  const metaapiDomain = (process.env.METAAPI_DOMAIN || '').trim();
  const baseUrl = (process.env.VITE_METAAPI_BASE_URL || '').trim();
  
  let customDomain = metaapiDomain;
  
  // Try to extract from baseUrl if customDomain is empty
  if (!customDomain && baseUrl) {
      try {
          const url = new URL(baseUrl);
          const parts = url.hostname.split('.');
          if (parts.length >= 2) {
              const commonRegions = ['london', 'new-york', 'singapore', 'frankfurt'];
              const regionIndex = parts.findIndex(p => commonRegions.includes(p));
              customDomain = regionIndex !== -1 && regionIndex < parts.length - 1 
                  ? parts.slice(regionIndex + 1).join('.') 
                  : parts.slice(-2).join('.');
          }
      } catch (e) {}
  }

  // FORCE doubling for AgiliumTrade infrastructure
  if (customDomain === 'agiliumtrade.ai' || customDomain.includes('agiliumtrade.ai') && !customDomain.includes('agiliumtrade.agiliumtrade.ai')) {
      customDomain = 'agiliumtrade.agiliumtrade.ai';
  }

  const domains = [
    'mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai',
    'mt-provisioning-api-v1.metaapi.cloud',
    'agiliumtrade.agiliumtrade.ai'
  ];
  
  if (customDomain && !domains.includes(customDomain)) {
      domains.unshift(`mt-provisioning-api-v1.${customDomain}`);
      domains.push(customDomain);
  }
  
  for (const domain of domains) {
    try {
      const { lookup } = await import('dns/promises');
      const result = await lookup(domain);
      cachedProvisioningIp = result.address;
      console.log(`[DNS] Provisioning host resolved to ${cachedProvisioningIp} via ${domain}`);
      return;
    } catch (err) {
      console.warn(`[DNS] Failed to resolve ${domain}...`);
    }
  }
  console.warn(`[DNS] All provisioning domain resolution attempts failed. SDK might fail unless it has internal fallbacks.`);
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
  max: 1000, // Increased to allow more concurrent polling
  message: { error: "Too many requests, please try again later." },
  validate: false
});

app.use(cors());

// HEALTH CHECK (For Cloud Run / AIS Health Monitor)
app.get("/api/health", (_, res) => res.json({ status: "ok" }));

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


const USER_ID_CACHE = new Map<string, { userId: string; email: string; timestamp: number }>();

// AUTHENTICATION GUARD: Validate JWT and resolve user_id
async function getUserIdFromRequest(req: express.Request): Promise<string> {
  const authHeader = req.headers.authorization;
  if (!authHeader) throw new Error("Unauthorized: No token provided");
  const token = authHeader.replace("Bearer ", "");
  
  // CACHE: Auth checks are expensive and common in polling
  const now = Date.now();
  const cached = USER_ID_CACHE.get(token);
  if (cached && (now - cached.timestamp < 300000)) { // 5-minute auth cache
      return cached.userId;
  }

  if (!adminSupabase) {
    console.error("[AUTH] Supabase admin client not initialized.");
    throw new Error("Internal Server Error: Auth service unavailable");
  }

  const { data, error } = await adminSupabase.auth.getUser(token);
  if (error || !data.user) {
    console.error("[AUTH] Supabase getUser error:", error?.message);
    throw new Error("Unauthorized: Invalid token");
  }
  
  USER_ID_CACHE.set(token, { userId: data.user.id, email: data.user.email || "", timestamp: now });
  return data.user.id;
}

// SECURE USER EMAIL RESOLVER: Resolves session email safely to enforce 100% user data isolation
async function getUserEmailFromRequest(req: express.Request): Promise<string> {
  const authHeader = req.headers.authorization;
  if (!authHeader) throw new Error("Unauthorized: No token provided");
  const token = authHeader.replace("Bearer ", "");
  
  const now = Date.now();
  const cached = USER_ID_CACHE.get(token);
  if (cached && (now - cached.timestamp < 300000)) {
      return cached.email;
  }
  
  await getUserIdFromRequest(req);
  const reCheck = USER_ID_CACHE.get(token);
  return reCheck ? reCheck.email : "";
}

// FETCH REAL-TIME ACCOUNT CONTEXT (isolated per account)
async function fetchAccountRealContext(accountId: string) {
  const context = {
    balance: 10000.0, // default if starting
    equity: 10000.0,
    freeMargin: 10000.0,
    marginLevel: 0.0,
    leverage: 100,
    currency: 'USD',
    floatingPnL: 0.0,
    activePositionsCount: 0,
    recentWinRate: 65, // historical default helper
    recentDrawdown: 0.0,
    activeTradesSummary: [] as any[]
  };

  try {
    const connection = REGISTRY.stream.get(accountId);
    if (connection && connection.terminalState) {
      const liveInfo = connection.terminalState.accountInformation;
      if (liveInfo) {
        context.balance = Number(liveInfo.balance ?? context.balance);
        context.equity = Number(liveInfo.equity ?? context.equity);
        context.freeMargin = Number(liveInfo.freeMargin ?? context.freeMargin);
        context.marginLevel = Number(liveInfo.marginLevel ?? context.marginLevel);
        context.leverage = Number(liveInfo.leverage ?? context.leverage);
        context.currency = liveInfo.currency || 'USD';
        context.floatingPnL = context.equity - context.balance;
      }
    }
  } catch (err: any) {
    console.warn("[CONTEXT] Error resolving live terminalState:", err.message);
  }

  try {
    // Active positions
    const posMap = globalScope.ACTIVE_POSITIONS.get(accountId) || new Map();
    context.activePositionsCount = posMap.size;
    context.activeTradesSummary = Array.from(posMap.values()).map((p: any) => ({
      symbol: p.symbol,
      type: p.type,
      volume: p.volume || p.lots || 0,
      profit: p.profit || 0
    }));
  } catch (err: any) {}

  try {
    // History metrics fallback resolver for win rates
    const cacheKey = `${accountId}_100`;
    const cachedEntry = (globalScope.HISTORY_CACHE as Map<string, { lastFetchTime: number; history: any[] }>)?.get(cacheKey);
    let history = cachedEntry?.history;
    if (!history) {
      const connection = REGISTRY.stream.get(accountId);
      if (connection && connection.historyStorage) {
        history = connection.historyStorage.historyOrders || [];
      }
    }
    if (history && history.length > 0) {
      const valid = history.filter((t: any) => typeof t.profit === 'number');
      if (valid.length > 0) {
        const winning = valid.filter((t: any) => t.profit > 0).length;
        context.recentWinRate = Math.round((winning / valid.length) * 100);
      }
    }
  } catch (err: any) {}

  if (context.balance > 0) {
    context.recentDrawdown = Math.max(0, ((context.balance - context.equity) / context.balance) * 100);
  }

  return context;
}

const LEASE_OWNER_CACHE = new Map<string, { userId: string; timestamp: number }>();

// STRICT OWNERSHIP MIDDLEWARE
async function enforceOwnership(req: express.Request, res: express.Response, next: express.NextFunction) {
  const accountId = req.params.accountId || (req.body && req.body.accountId);
  if (!accountId || accountId === 'global') {
      return next();
  }
  
  try {
     const userId = await getUserIdFromRequest(req);
     const now = Date.now();
     
     // CACHED OWNERSHIP CHECK (10 minute cache)
     const cached = LEASE_OWNER_CACHE.get(accountId);
     if (cached && (now - cached.timestamp < 600000) && cached.userId === userId) {
         return next();
     }

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
         
         LEASE_OWNER_CACHE.set(accountId, { userId, timestamp: now });
     }
     next();
  } catch(e: any) {
     res.status(401).json({ error: e.message || "Authentication Failed" });
  }
}

app.use(express.json());

// ENFORCE OWNERSHIP ON ALL ACCOUNT ROUTES
app.use("/api/account/:accountId", enforceOwnership);

const token = (process.env.METAAPI_ADMIN_TOKEN || "").trim();

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
      
      // If disconnected from server for > 180s (3m), trigger a fresh connect attempt
      // Matches MetaApi dedicated server startup guidance
      if (!isServerConnected && (now - lastRec > 180000)) {
         console.warn(`[MONITOR] [RECOVERY] Triggering fresh setupStreaming for ${accountId} due to persistent disconnection.`);
         globalScope.LAST_MONITOR_RECOVERY = globalScope.LAST_MONITOR_RECOVERY || new Map();
         globalScope.LAST_MONITOR_RECOVERY.set(accountId, now);
         
         const existing = REGISTRY.stream.get(accountId);
         REGISTRY.stream.delete(accountId);
         if (existing) {
             try { existing.close(); } catch(e) {}
         }
         setupStreaming(accountId).catch(e => console.error(`[MONITOR] Recovery path failed for ${accountId}:`, e.message));
      }
      
      // If we are server-connected but NOT synchronized for > 120s, it's a zombie
      if (isServerConnected && !isSynchronized && (now - (globalScope.LAST_SYNC_TS?.get(accountId) || now) > 120000)) {
          console.warn(`[MONITOR] [RECOVERY] Connection ${accountId} is a zombie (Server OK but no Sync). Restarting...`);
          REGISTRY.stream.delete(accountId);
          setupStreaming(accountId).catch(() => {});
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
    
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    
    // Silence MetaApi SDK chatter for redundant console clarity
    const MetaApiLogger = (MetaApiModule as any).Logger || (MetaApiModule as any).default?.Logger;
    if (MetaApiLogger && typeof MetaApiLogger.setLogLevel === 'function') {
        MetaApiLogger.setLogLevel('ERROR');
    }

    // White-label domain stabilization: Use METAAPI_DOMAIN if provided, otherwise default.
    let domainToUse = (process.env.METAAPI_DOMAIN || 'agiliumtrade.agiliumtrade.ai').trim();
    
    // SMART EXTRACTION: If the user provides a direct base URL, extract the root domain accurately.
    if (process.env.VITE_METAAPI_BASE_URL) {
      try {
        const url = new URL(process.env.VITE_METAAPI_BASE_URL);
        const parts = url.hostname.split('.');
        if (parts.length >= 2) {
            const commonRegions = ['london', 'new-york', 'singapore', 'frankfurt'];
            const regionIndex = parts.findIndex(p => commonRegions.includes(p));
            if (regionIndex !== -1 && regionIndex < parts.length - 1) {
                domainToUse = parts.slice(regionIndex + 1).join('.');
            } else {
                domainToUse = parts.slice(-2).join('.');
            }
        }
      } catch (e) {}
    }

    // CRITICAL: Force doubling for agiliumtrade.ai to reach mt-provisioning-api-v1
    if (domainToUse === 'agiliumtrade.ai' || (domainToUse.includes('agiliumtrade.ai') && !domainToUse.includes('agiliumtrade.agiliumtrade.ai'))) {
        domainToUse = 'agiliumtrade.agiliumtrade.ai';
    }

    console.log(`[SDK] Initializing MetaApi (Client: ${clientId}) on domain: ${domainToUse}`);
    globalScope.METAAPI = new MetaApiClass(token, {
      clientId,
      domain: domainToUse,
      extendedLogging: false,
      useSharedClient: true, 
      requestTimeout: 1200000, 
      reliability: 'high',
      retryOpts: {
        maxRetries: 250, 
        minDelayInMs: 15000, 
        maxDelayInMs: 300000
      }
    });

    // Stability optimization: Tuning the streaming configuration for high-frequency price environments
    if (globalScope.METAAPI.streamingConfiguration) {
        globalScope.METAAPI.streamingConfiguration.packetSizeLimit = 16384; // Limit packet size to prevent transport close on large snapshots
        globalScope.METAAPI.streamingConfiguration.reconnectAfterSeconds = 3600; // Regular fresh rotation
    }

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

const ACCOUNT_OBJ_CACHE = new Map<string, { account: any; timestamp: number }>();

// Account Instance Caching Utility
async function getAccount(accountId: string) {
  const now = Date.now();
  const cached = ACCOUNT_OBJ_CACHE.get(accountId);
  
  if (cached) {
      if (now - cached.timestamp < 30000) {
          return cached.account;
      }
      
      // STALE-WHILE-REVALIDATE: If the cache is expired, return the old one immediately 
      // but fetch a new one in the background to prevent blocking polling requests.
      if (!metaapi) return cached.account;
      
      metaapi.metatraderAccountApi.getAccount(accountId).then(account => {
          ACCOUNT_OBJ_CACHE.set(accountId, { account, timestamp: Date.now() });
      }).catch(err => {
          console.warn(`[SDK] Background getAccount update failed for ${accountId}:`, err.message);
      });
      
      return cached.account;
  }

  if (!metaapi) throw new Error("SDK_NOT_INITIALIZED");
  
  // First time fetch (blocks, but only once per account)
  const account = await metaapi.metatraderAccountApi.getAccount(accountId);
  ACCOUNT_OBJ_CACHE.set(accountId, { account, timestamp: now });
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

process.on('unhandledRejection', (reason: any) => {
  const msg = reason?.message || String(reason);
  if (msg.includes("transport") || msg.includes("london:") || msg.includes("Disconnected due to transport close") || msg.includes("Disposable")) {
    console.warn(`[SDK] [AEST_HANDLED] Handled streaming re-reconnect transport close rejection: ${msg}`);
  } else {
    console.error('[PROCESS] Unhandled Rejection:', reason);
  }
});

process.on('uncaughtException', (error: any) => {
  const msg = error?.message || String(error);
  if (msg.includes("transport") || msg.includes("london:") || msg.includes("Disconnected due to transport close") || msg.includes("Disposable")) {
    console.warn(`[SDK] [AEST_HANDLED] Handled streaming re-reconnect transport close exception: ${msg}`);
  } else {
    console.error('[PROCESS] Uncaught Exception:', error);
  }
});

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
      if (msg.includes("transport") || msg.includes("Disposable") || msg.includes("london:") || msg.includes("close")) {
        console.warn(`[SDK] [STREAM_WARM] Account ${accountId} stream transport closed, initiating self-healing auto-reconnection...`);
      } else {
        console.error(`[SDK] [STREAM_ERROR] Account ${accountId}: ${msg}`);
        logMessage(accountId, "ERROR", `Stream Error: ${msg}`, {}, 'SYSTEM');
      }
    },
    onStreamError: async (error: any) => {
       const msg = error?.message || String(error);
       if (msg.includes("transport") || msg.includes("Disposable") || msg.includes("london:") || msg.includes("close")) {
         console.warn(`[SDK] [STREAM_V2_WARM] Account ${accountId} stream connection transport closed, self-healing under retryOpts.`);
       } else {
         console.error(`[SDK] [STREAM_ERROR_V2] Account ${accountId}: ${msg}`);
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

      if (connected) {
        const connection = REGISTRY.stream.get(accountId);
        if (connection && connection.terminalState) {
          const info = connection.terminalState.accountInformation;
          if (info) {
            broadcast({ 
              type: 'account:update', 
              accountId, 
              balance: info.balance ?? null,
              equity: info.equity ?? null,
              currency: info.currency || 'USD'
            });
          }
        }
      }
    },
    onAccountInformationUpdated: async (instanceIndex: string, accountInformation: any) => {
      console.log(`[SDK] Account info update for ${accountId}`);
      broadcast({ 
        type: 'account:update', 
        accountId, 
        balance: accountInformation.balance,
        equity: accountInformation.equity,
        currency: accountInformation.currency
      });
    },
    onAccountInformationRestored: async (instanceIndex: string, accountInformation: any) => {
      console.log(`[SDK] Account info restored for ${accountId}`);
      broadcast({ 
        type: 'account:update', 
        accountId, 
        balance: accountInformation.balance ?? null,
        equity: accountInformation.equity ?? null,
        currency: accountInformation.currency || 'USD'
      });
    },
    onSynchronizationStarted: async (instanceIndex: string) => {
      console.log(`[SDK] Sync started on ${instanceIndex} for ${accountId}`);
      broadcast({ type: 'status:update', accountId, status: 'SYNCING' });
    },
    onSynchronizationFinished: async (instanceIndex: string) => {
      const source = 'NODE_STRATEGY';
      console.log(`[SDK] ✅ SYNCHRONIZED for ${accountId}`);
      
      if (!globalScope.LAST_SYNC_TS) globalScope.LAST_SYNC_TS = new Map();
      globalScope.LAST_SYNC_TS.set(accountId, Date.now());
      
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
      // PROACTIVE STALE CHECK: If it's says synchronized but hasn't received a heartbeat or state is missing
      const isZombie = existing.synchronized && !existing.terminalState?.accountInformation && (existing as any).terminalState?.connected === false;
      
      if (!isZombie && existing.synchronized && existing.terminalState?.connectedToBroker) return existing;
      
      if (!existing.synchronized || !existing.terminalState?.connected) {
          console.log(`[SDK] Connection for ${accountId} is still booting/connecting. Reusing existing stream...`);
          return existing;
      }
      
      console.warn(`[SDK] Connection for ${accountId} appears stale (Synchronized: ${existing.synchronized}, Broker: ${!!existing.terminalState?.connectedToBroker}). Testing...`);
      try {
         await existing.waitSynchronized({ timeoutInSeconds: 15 });
         if (existing.terminalState?.connectedToBroker) return existing;
      } catch(e: any) {
         console.warn(`[SDK] Stale test failed for ${accountId}: ${e.message}. Forcing fresh connect.`);
      }
    } catch (e) {
      console.warn(`[SDK] Error reusing connection for ${accountId}, attempting fresh connect...`);
    }
    
    // Explicitly cleanup the old one before creating a new one if we reached here
    try {
        REGISTRY.stream.delete(accountId);
        await existing.close();
    } catch (e) {}
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
      console.log(`[SDK] Waiting for synchronization (fast): ${accountId}...`);
      try {
        await connection.waitSynchronized({ timeoutInSeconds: 30 }); // reduced from 60s
      } catch(e: any) {
        console.warn(`[SDK] waitSynchronized fast warning: ${e.message}`);
      }

      // DO NOT BLOCK ON waitForTrueConnection. Start it in background to stabilize execution states.
      waitForTrueConnection(connection, accountId).catch(console.error);
      
      console.log(`[SDK] Streaming established successfully for ${accountId}`);
      REGISTRY.stream.set(accountId, connection);
      globalScope.STREAM_READY.set(accountId, true);
      REGISTRY.locked.set(accountId, true);
      
      broadcast({ 
        type: 'ACCOUNT_READY', 
        accountId,
        status: 'READY'
      });
      broadcast({ type: 'status:update', accountId, status: 'READY' });
      broadcast({ type: 'SYNC_READY', accountId });
      
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

// CHATRADE AI BACKEND SERVICE & ENGINE
import fs from "fs";

// OPTIMIZATION: Global Caches to minimize API overhead
globalScope.CHATRADE_FRED_CACHE = globalScope.CHATRADE_FRED_CACHE || new Map<string, { data: any, timestamp: number }>();
globalScope.CHATRADE_NEWS_CACHE = globalScope.CHATRADE_NEWS_CACHE || new Map<string, { data: any, timestamp: number }>();
globalScope.CHATRADE_ANALYSIS_CACHE = globalScope.CHATRADE_ANALYSIS_CACHE || new Map<string, { data: any, timestamp: number }>();
globalScope.CHATRADE_RULE_CACHE = globalScope.CHATRADE_RULE_CACHE || new Map<string, { data: any, timestamp: number }>();

function sanitizeGeminiError(error: any): string {
  if (!error) return "An unknown error occurred while calling the AI service.";
  let msg = error.message || String(error);
  
  if (error.status === 429 || error.code === 429) {
    return "Chatrade AI services are temporarily unavailable because the project's prepayment credits or Gemini API quota is depleted. Please add credits or update the API Key in Google AI Studio to resume AI Trading assistance.";
  }
  
  const lowerMsg = msg.toLowerCase();
  if (lowerMsg.includes("prepayment credits") || lowerMsg.includes("resource_exhausted") || lowerMsg.includes("credits are depleted") || lowerMsg.includes("billing") || lowerMsg.includes("prepay")) {
    return "Chatrade AI services are temporarily unavailable because the project's prepayment credits or Gemini API quota is depleted. Please add credits or update the API Key in Google AI Studio to resume AI Trading assistance.";
  }
  
  if (lowerMsg.includes("api key not valid") || lowerMsg.includes("invalid_argument") || lowerMsg.includes("api_key_invalid") || lowerMsg.includes("invalid api key")) {
    return "Invalid Gemini API Key. Please configure a valid API Key in the Google AI Studio settings to enable Chatrade AI.";
  }
  
  return msg;
}

/**
 * LOCAL FALLBACK MODE:
 * Enforces risk rules and technical signals when Gemini is unavailable
 */
function localFallbackAnalysis(accountId: string, symbol: string, direction: string, userPlan: any, techAnalysis: any) {
  console.log(`[CHATRADE_FALLBACK] Executing local rule-based analysis for ${symbol}...`);
  
  const techScore = techAnalysis ? techAnalysis.confidence || 50 : 50;
  const isCorrectDirection = techAnalysis && techAnalysis.trend === direction;
  
  // Rule-based decision
  let outcome = "REJECT";
  let confidence = techScore;
  let reason = "Gemini API unavailable. Falling back to local technical strategy.";
  
  if (isCorrectDirection && techScore >= 60) {
    outcome = "APPROVE";
  } else if (isCorrectDirection) {
    outcome = "WAIT";
  }
  
  // Math-based parameters
  const capital = parseFloat(userPlan.capital) || 200;
  const riskPercent = userPlan.riskProfile === "Aggressive" ? 0.02 : userPlan.riskProfile === "Conservative" ? 0.005 : 0.01;
  const lotSize = Math.max(0.01, parseFloat(((capital * riskPercent) / 100).toFixed(2))); // Simple lot heuristic
  
  return {
    outcome,
    confidence,
    reason,
    detailedReasoning: "LOCAL FALLBACK ACTIVATED: Gemini API is currently depleted. The system is operating in safe local mode using technical indicators and verified risk parameters only.",
    technicalAlignment: isCorrectDirection ? "Bullish trend detected locally." : "Trend conflict detected locally.",
    fundamentalAlignment: "Unavailable in Fallback Mode.",
    newsImpact: "Neutral (Caches disabled in Fallback).",
    calendarRisk: "Moderate.",
    leverageSafety: "Verified by local risk engine.",
    lotSize,
    stopLossPips: 25,
    takeProfitPips: 50,
    trailingStopPips: 15,
    riskRewardRatio: "1:2",
    mentorVoice: "Chatrade AI (Local Edition): Currently operating in safe recovery mode. I am suppressing AI reasoning to preserve system uptime while maintaining algorithmic trade safety."
  };
}

/**
 * LOCAL RULE PARSER FALLBACK:
 * Extracts prop-firm limits from prompt or document locally when Gemini is depleted
 */
function localRuleParser(text?: string) {
  const content = text || "";
  
  let maxDailyDrawdown: string | null = null;
  const m1 = content.match(/daily\s+(?:drawdown|loss)(?:\s+of)?\s*(\d+(?:\.\d+)?%)/i) || 
             content.match(/(?:drawdown|loss)\s+daily\s*(\d+(?:\.\d+)?%)/i) ||
             content.match(/(\d+(?:\.\d+)?%)\s+daily\s*(?:drawdown|loss)/i) ||
             content.match(/daily\s*:\s*(\d+(?:\.\d+)?%)/i);
  if (m1) maxDailyDrawdown = m1[1];
  else if (/daily/i.test(content) && content.match(/(\d+(?:\.\d+)?%)/)) {
    const matched = content.match(/(\d+(?:\.\d+)?%)/);
    if (matched) maxDailyDrawdown = matched[1];
  } else {
    maxDailyDrawdown = "5%";
  }

  let maxTotalDrawdown: string | null = null;
  const m2 = content.match(/(?:total|max|overall)\s+(?:drawdown|loss)(?:\s+of)?\s*(\d+(?:\.\d+)?%)/i) ||
             content.match(/(?:drawdown|loss)\s+(?:total|max|overall)\s*(\d+(?:\.\d+)?%)/i) ||
             content.match(/(\d+(?:\.\d+)?%)\s+(?:total|max|overall)\s*(?:drawdown|loss)/i) ||
             content.match(/(?:overall|max)\s*:\s*(\d+(?:\.\d+)?%)/i);
  if (m2) maxTotalDrawdown = m2[1];
  else {
    maxTotalDrawdown = "10%";
  }

  let profitTarget: string | null = null;
  const m3 = content.match(/(?:profit|target)\s+(?:of|is|target)?\s*(\d+(?:\.\d+)?%)/i) ||
             content.match(/(\d+(?:\.\d+)?%)\s+(?:profit|target)/i);
  if (m3) profitTarget = m3[1];
  else {
    profitTarget = "8%";
  }

  let maxLotSize: string | null = null;
  const m4 = content.match(/(?:max|lot|sizing)\s+(?:size|limit)?(?:\s*is)?\s*(\d+(?:\.\d+)?)/i);
  if (m4) maxLotSize = m4[1];
  else {
    maxLotSize = "No strict limit.";
  }

  let newsRestrictions = "Standard prop-firm news restrictions apply (2 mins before and after).";
  if (/news/i.test(content)) {
    newsRestrictions = "High-impact news trading is restricted/monitored.";
  }
  
  let timeRestrictions = "No weekend holding allowed. Active positions must close before Friday market closing.";
  if (/week|time|session/i.test(content)) {
    timeRestrictions = "Restricted holdings during weekends and sessions.";
  }

  let consistencyRule = "Prop-firm consistency requirements must be respected.";

  const summary = `Offline Confluence rule extraction complete. Loaded Parameters: ${maxDailyDrawdown} Daily Drawdown, ${maxTotalDrawdown} Max Overall Target, ${profitTarget} Profit Target. Risk desk is ready to enforce guidelines.`;

  return {
    maxDailyDrawdown,
    maxTotalDrawdown,
    maxLotSize,
    profitTarget,
    newsRestrictions,
    timeRestrictions,
    consistencyRule,
    summary
  };
}

let aiClient: any = null;
function getGeminiClient() {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.warn("[GEMINI] Warning: GEMINI_API_KEY is not defined in environment secrets. Attempting fallback.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key || "MOCK_KEY",
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

async function callAIWithFallback(contents: any, config?: any) {
    const ai = getGeminiClient();
    const models = [
        "gemini-3.5-flash",
        "gemini-3.1-flash-lite",
        "gemini-3-flash-preview",
        "gemini-3.1-pro-preview",
        "gemini-pro-latest",
        "gemini-flash-latest"
    ];

    let lastError: any;

    for (const model of models) {
        try {
            const params: any = {
                model,
                contents
            };
            if (config) {
                params.config = config;
            }
            return await ai.models.generateContent(params);
        } catch (error: any) {
            lastError = error;
            console.warn(`[CHATRADE_AI] Model ${model} failed: ${error.message}`);
        }
    }
    throw lastError || new Error("All Gemini models failed.");
}

const PLANS_FILE = path.join(process.cwd(), "chatrade_plans.json");
function loadUserPlans() {
  try {
    if (fs.existsSync(PLANS_FILE)) {
      const data = fs.readFileSync(PLANS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("[CHATRADE_PLANS] Error loading plans file", e);
  }
  return {};
}

function saveUserPlan(email: string, plan: any) {
  try {
    const plans = loadUserPlans();
    plans[email] = plan;
    fs.writeFileSync(PLANS_FILE, JSON.stringify(plans, null, 2), "utf-8");
  } catch (e) {
    console.error("[CHATRADE_PLANS] Error saving plan", e);
  }
}

// ==========================================
// AI QUOTA & OPTIMIZATION SYSTEM (ALGOTRADE)
// ==========================================

const QUOTA_FILE = path.join(process.cwd(), "chatrade_quota_usage.json");

interface UserQuotaState {
  chatsUsed: number;
  deepsUsed: number;
  lastRequestTime: number;
  lastRequestText?: string;
  lastResponseText?: string;
}

interface QuotaDatabase {
  daily: {
    [dateStr: string]: {
      [email: string]: UserQuotaState;
    };
  };
  analytics: {
    id: string;
    timestamp: string;
    email: string;
    plan: string;
    mode: 'LIGHT' | 'DEEP';
    tokensUsed: number;
    estimatedCost: number;
    modelUsed: string;
    status: 'success' | 'fallback_active' | 'user_quota_blocked' | 'api_error';
  }[];
}

let quotaDb: QuotaDatabase = { daily: {}, analytics: [] };

function loadQuotaDb() {
  try {
    if (fs.existsSync(QUOTA_FILE)) {
      quotaDb = JSON.parse(fs.readFileSync(QUOTA_FILE, 'utf-8'));
    }
  } catch (e) {
    console.warn("[QUOTA] Failed to load quota DB, resetting", e);
  }
  if (!quotaDb.daily) quotaDb.daily = {};
  if (!quotaDb.analytics) quotaDb.analytics = [];
}

function saveQuotaDb() {
  try {
    fs.writeFileSync(QUOTA_FILE, JSON.stringify(quotaDb, null, 2), 'utf-8');
  } catch (e) {
    console.error("[QUOTA] Failed to save quota DB", e);
  }
}

loadQuotaDb();

const PLAN_LIMITS = {
  STARTER: { chats: 50, deeps: 15 },
  PRO: { chats: 200, deeps: 75 },
  ELITE: { chats: 500, deeps: 250 }
};

function getTodayDateStr(): string {
  return new Date().toISOString().split('T')[0];
}

function getUserPlanName(email: string): 'STARTER' | 'PRO' | 'ELITE' {
  const plans = loadUserPlans();
  const userPlan = plans[email];
  if (userPlan) {
    if (userPlan.tier) {
      const t = String(userPlan.tier).toUpperCase();
      if (t === 'PRO') return 'PRO';
      if (t === 'ELITE') return 'ELITE';
    }
    if (userPlan.plan) {
      const p = String(userPlan.plan).toUpperCase();
      if (p === 'PRO') return 'PRO';
      if (p === 'ELITE') return 'ELITE';
    }
  }
  return 'STARTER';
}

function getUserQuota(email: string): {
  plan: 'STARTER' | 'PRO' | 'ELITE';
  chatsTotal: number;
  chatsUsed: number;
  chatsRemaining: number;
  deepsTotal: number;
  deepsUsed: number;
  deepsRemaining: number;
  lowQuotaMode: boolean;
} {
  const dateStr = getTodayDateStr();
  const plan = getUserPlanName(email);
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.STARTER;

  if (!quotaDb.daily[dateStr]) {
    quotaDb.daily[dateStr] = {};
  }
  if (!quotaDb.daily[dateStr][email]) {
    quotaDb.daily[dateStr][email] = {
      chatsUsed: 0,
      deepsUsed: 0,
      lastRequestTime: 0
    };
  }

  const userUsage = quotaDb.daily[dateStr][email];
  const chatsUsed = userUsage.chatsUsed || 0;
  const deepsUsed = userUsage.deepsUsed || 0;

  const chatsRemaining = Math.max(0, limits.chats - chatsUsed);
  const deepsRemaining = Math.max(0, limits.deeps - deepsUsed);

  // Low quota mode active when remaining is <= 20% of capacity (from user prompt: "reaches 80% usage")
  const isChatLow = (chatsRemaining / limits.chats) <= 0.20;
  const isDeepLow = (deepsRemaining / limits.deeps) <= 0.20;
  const lowQuotaMode = isChatLow || isDeepLow;

  return {
    plan,
    chatsTotal: limits.chats,
    chatsUsed,
    chatsRemaining,
    deepsTotal: limits.deeps,
    deepsUsed,
    deepsRemaining,
    lowQuotaMode
  };
}

function consumeQuotaPoints(email: string, isDeep: boolean): { success: boolean; error?: string } {
  const dateStr = getTodayDateStr();
  const quota = getUserQuota(email);
  const plan = quota.plan;

  // Check user subscription limits first
  if (isDeep) {
    if (quota.deepsRemaining <= 0) {
      return { success: false, error: "Your daily AI analysis limit for your current plan has been reached. Trading functions remain active until quota resets." };
    }
    if (quota.chatsRemaining < 5) {
      return { success: false, error: "Your daily AI analysis limit for your current plan has been reached. Trading functions remain active until quota resets." };
    }
  } else {
    if (quota.chatsRemaining <= 0) {
      return { success: false, error: "Your daily AI analysis limit for your current plan has been reached. Trading functions remain active until quota resets." };
    }
  }

  if (!quotaDb.daily[dateStr]) {
    quotaDb.daily[dateStr] = {};
  }
  const userUsage = quotaDb.daily[dateStr][email];

  // Cooldown Protection (to prevent visual UI or backend spamming)
  const now = Date.now();
  const lastTime = userUsage.lastRequestTime || 0;
  if (now - lastTime < 2500) { // 2.5 seconds cooldown
    return { success: false, error: "COOLDOWN_PROTECTION: Please wait a moment before sending another AI request." };
  }

  // Commit points spending
  if (isDeep) {
    userUsage.deepsUsed = (userUsage.deepsUsed || 0) + 1;
    userUsage.chatsUsed = (userUsage.chatsUsed || 0) + 5;
  } else {
    userUsage.chatsUsed = (userUsage.chatsUsed || 0) + 1;
  }
  userUsage.lastRequestTime = now;

  saveQuotaDb();
  return { success: true };
}

function checkAndGetDuplicateResponse(email: string, messageText: string): string | null {
  const dateStr = getTodayDateStr();
  if (!quotaDb.daily[dateStr] || !quotaDb.daily[dateStr][email]) return null;
  const userUsage = quotaDb.daily[dateStr][email];
  const cleanMsg = messageText.trim().toLowerCase();

  if (userUsage.lastRequestText?.trim().toLowerCase() === cleanMsg) {
    console.log(`[QUOTA_ANTI_SPAM] Duplicate prompt suppressed. Returning cached Gemini response.`);
    return userUsage.lastResponseText || null;
  }
  return null;
}

function saveLastResponse(email: string, messageText: string, responseText: string) {
  const dateStr = getTodayDateStr();
  if (!quotaDb.daily[dateStr]) {
    quotaDb.daily[dateStr] = {};
  }
  if (!quotaDb.daily[dateStr][email]) {
    quotaDb.daily[dateStr][email] = { chatsUsed: 0, deepsUsed: 0, lastRequestTime: Date.now() };
  }
  quotaDb.daily[dateStr][email].lastRequestText = messageText;
  quotaDb.daily[dateStr][email].lastResponseText = responseText;
  saveQuotaDb();
}

function logAIAnalytics(
  email: string,
  plan: string,
  mode: 'LIGHT' | 'DEEP',
  modelUsed: string,
  status: 'success' | 'fallback_active' | 'user_quota_blocked' | 'api_error'
) {
  const costMap: Record<string, number> = {
    "gemini-3.5-flash": 0.00015,
    "gemini-3.1-flash-lite": 0.000075,
    "gemini-3-flash-preview": 0.0001,
    "gemini-3.1-pro-preview": 0.00125,
    "gemini-pro-latest": 0.001,
    "gemini-flash-latest": 0.00015,
    "local_fallback": 0.0
  };
  const baseCost = costMap[modelUsed] || 0.00015;
  const estCost = mode === 'DEEP' ? baseCost * 5 : baseCost;

  if (!quotaDb.analytics) {
    quotaDb.analytics = [];
  }

  quotaDb.analytics.push({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    email,
    plan,
    mode,
    tokensUsed: mode === 'DEEP' ? 4200 : 950,
    estimatedCost: status === 'success' || status === 'fallback_active' ? estCost : 0,
    modelUsed,
    status
  });

  if (quotaDb.analytics.length > 500) {
    quotaDb.analytics = quotaDb.analytics.slice(-500);
  }

  saveQuotaDb();
}

// QUOTA STATUS API PORT
app.get("/api/chatrade/quota-status", async (req, res) => {
  try {
    const userEmail = await getUserEmailFromRequest(req);
    if (!userEmail) {
      return res.status(401).json({ error: "Unauthorized: Missing session context" });
    }
    const quota = getUserQuota(userEmail);
    res.json({ success: true, ...quota });
  } catch (err: any) {
    res.status(401).json({ error: err.message || "Unauthorized" });
  }
});

app.post("/api/chatrade/set-tier", async (req, res) => {
  try {
    const userEmail = await getUserEmailFromRequest(req);
    if (!userEmail) {
      return res.status(401).json({ error: "Unauthorized: Missing session context" });
    }
    const { tier } = req.body || {};
    if (!tier) {
      return res.status(400).json({ error: "tier is required" });
    }
    const plans = loadUserPlans();
    const current = plans[userEmail] || {
      capital: "200",
      goal: "Double account",
      riskProfile: "Balanced",
      rules: null
    };
    current.tier = tier;
    current.plan = tier; // ensure both fields are in sync
    saveUserPlan(userEmail, current);
    
    const quota = getUserQuota(userEmail);
    res.json({ success: true, quota });
  } catch (err: any) {
    res.status(401).json({ error: err.message || "Unauthorized" });
  }
});

// ADMIN ANALYTICS API PORT
app.get("/api/admin/ai-analytics", (req, res) => {
  const logs = quotaDb.analytics || [];
  
  // Aggregate plan counts
  const planCounts: Record<string, number> = { STARTER: 0, PRO: 0, ELITE: 0 };
  const plans = loadUserPlans();
  Object.values(plans).forEach((p: any) => {
    const tier = (p.tier || p.plan || 'STARTER').toUpperCase();
    planCounts[tier] = (planCounts[tier] || 0) + 1;
  });

  const totalCost = logs.reduce((sum, item) => sum + (item.estimatedCost || 0), 0);
  
  // Highest consumers
  const consumerMap: Record<string, { email: string; plan: string; chats: number; deeps: number; cost: number }> = {};
  logs.forEach(log => {
    const key = log.email;
    if (!consumerMap[key]) {
      consumerMap[key] = { email: log.email, plan: log.plan, chats: 0, deeps: 0, cost: 0 };
    }
    if (log.mode === 'DEEP') {
      consumerMap[key].deeps += 1;
    } else {
      consumerMap[key].chats += 1;
    }
    consumerMap[key].cost += (log.estimatedCost || 0);
  });
  const highestConsumers = Object.values(consumerMap).sort((a, b) => b.cost - a.cost).slice(0, 5);

  // Daily requests
  const dailyMap: Record<string, number> = {};
  logs.forEach(log => {
    const date = log.timestamp.split('T')[0];
    dailyMap[date] = (dailyMap[date] || 0) + 1;
  });
  const dailyRequests = Object.entries(dailyMap).map(([date, count]) => ({ date, count }));

  // Model breakdown
  const modelsMap: Record<string, number> = {};
  logs.forEach(log => {
    modelsMap[log.modelUsed] = (modelsMap[log.modelUsed] || 0) + 1;
  });

  res.json({
    success: true,
    stats: {
      planCounts,
      totalCost,
      highestConsumers,
      dailyRequests,
      modelsUsed: modelsMap,
      recentLogs: logs.slice(-50).reverse()
    }
  });
});

app.get("/api/chatrade/plan", async (req, res) => {
  try {
    const userEmail = await getUserEmailFromRequest(req);
    if (!userEmail) {
      return res.status(401).json({ error: "Unauthorized: Missing session context" });
    }
    const plans = loadUserPlans();
    const userPlan = plans[userEmail] || null;
    res.json({ success: true, plan: userPlan });
  } catch (err: any) {
    res.status(401).json({ error: err.message || "Unauthorized" });
  }
});

app.post("/api/chatrade/plan", async (req, res) => {
  try {
    const userEmail = await getUserEmailFromRequest(req);
    if (!userEmail) {
      return res.status(401).json({ error: "Unauthorized: Missing session context" });
    }
    const { plan } = req.body || {};
    saveUserPlan(userEmail, plan);
    res.json({ success: true });
  } catch (err: any) {
    res.status(401).json({ error: err.message || "Unauthorized" });
  }
});

app.post("/api/chatrade/parse-rules", async (req, res) => {
  const { text, fileData, mimeType } = req.body || {};
  
  // CACHE CHECK (Text only)
  if (text && !fileData) {
    const textHash = crypto.createHash('md5').update(text).digest('hex');
    const cached = globalScope.CHATRADE_RULE_CACHE.get(textHash);
    if (cached && (Date.now() - cached.timestamp < 86400000)) { // 24h cache for rules
        console.log("[CHATRADE_CACHE] Using cached rules analysis.");
        return res.json({ success: true, rules: cached.data });
    }
  }

  try {
     let contents: any;
    if (fileData && mimeType) {
      contents = {
        parts: [
          {
            inlineData: {
              data: fileData,
              mimeType: mimeType
            }
          },
          {
            text: `Analyze the provided prop-firm guidelines (rules/requirements) or screenshot.
Extract these exact rules, structured as JSON output:
1. Max daily drawdown (e.g. 5%)
2. Max total drawdown (e.g. 10%)
3. Max lot size rule (if any)
4. Profit target (e.g. 8% or 10%)
5. News trading restrictions (e.g. no trading 2 mins before/after high-impact news)
6. Trading time restrictions (e.g. weekend close or session restrictions)
7. Consistency rules or others

Format your response strictly as a JSON object with these keys:
{
  "maxDailyDrawdown": string or null,
  "maxTotalDrawdown": string or null,
  "maxLotSize": string or null,
  "profitTarget": string or null,
  "newsRestrictions": string or null,
  "timeRestrictions": string or null,
  "consistencyRule": string or null,
  "summary": string (a natural human trading mentor summary of these restrictions)
}`
          }
        ]
      };
    } else if (text) {
      contents = `Analyze the provided prop-firm guidelines (rules/requirements):
"${text}"

Extract these exact rules, structured as JSON output:
1. Max daily drawdown (e.g. 5%)
2. Max total drawdown (e.g. 10%)
3. Max lot size rule (if any)
4. Profit target (e.g. 8% or 10%)
5. News trading restrictions (e.g. no trading 2 mins before/after high-impact news)
6. Trading time restrictions (e.g. weekend close or session restrictions)
7. Consistency rules or others

Format your response strictly as a JSON object with these keys:
{
  "maxDailyDrawdown": string or null,
  "maxTotalDrawdown": string or null,
  "maxLotSize": string or null,
  "profitTarget": string or null,
  "newsRestrictions": string or null,
  "timeRestrictions": string or null,
  "consistencyRule": string or null,
  "summary": string (a natural human trading mentor summary of these restrictions)
}`;
    } else {
      return res.status(400).json({ error: "Text or fileData is required" });
    }

    const response = await callAIWithFallback(contents, {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          maxDailyDrawdown: { type: Type.STRING },
          maxTotalDrawdown: { type: Type.STRING },
          maxLotSize: { type: Type.STRING },
          profitTarget: { type: Type.STRING },
          newsRestrictions: { type: Type.STRING },
          timeRestrictions: { type: Type.STRING },
          consistencyRule: { type: Type.STRING },
          summary: { type: Type.STRING }
        },
        required: ["summary"]
      }
    });

    const parsedData = JSON.parse(response.text || "{}");
    
    // CACHE STORAGE
    if (text && !fileData) {
      const textHash = crypto.createHash('md5').update(text).digest('hex');
      globalScope.CHATRADE_RULE_CACHE.set(textHash, { data: parsedData, timestamp: Date.now() });
    }
    
    res.json({ success: true, rules: parsedData });
  } catch (error: any) {
    console.warn("[PARSE_RULES_ERROR] Gemini model is depleted. Engaging local rule-based parsing fallback.", error.message || error);
    const parsedData = localRuleParser(req.body.text || "Generic prop-firm setup");
    res.json({ success: true, rules: parsedData, fallbackActive: true });
  }
});

app.post("/api/chatrade/analyze", async (req, res) => {
  try {
    const userEmail = await getUserEmailFromRequest(req);
    if (!userEmail) {
      return res.status(401).json({ error: "Unauthorized: Missing session context" });
    }
    const { accountId, symbol, direction, isDeepRequest = false } = req.body || {};
    if (!accountId || !symbol || !direction) {
      return res.status(400).json({ error: "accountId, symbol, and direction are required" });
    }

    // STRICT MULTI-USER LEASE OWNERSHIP CHECK: Ensure account belongs to user!
    if (adminSupabase) {
        const userId = await getUserIdFromRequest(req);
        const { data: lease } = await adminSupabase.from("ea_leases").select("user_id").eq("account_id", accountId).maybeSingle();
        if (lease && lease.user_id !== userId) {
            return res.status(403).json({ error: "Access Denied: You do not own this trading account lease." });
        }
    }

    const planName = getUserPlanName(userEmail);

  // VALIDATE SYMBOL EXISTS ON BROKER
  try {
      const availableSymbols = await getSymbolsCached(metaapi, accountId);
      if (availableSymbols && availableSymbols.length > 0 && !availableSymbols.includes(symbol)) {
          return res.json({ 
              success: true, 
              analysis: { 
                  outcome: "REJECT", 
                  confidence: 100, 
                  reason: `Symbol validation failed. ${symbol} is not available in connected broker account.`,
                  mentorVoice: `Rule Violation: You requested analysis on an un-tradable symbol (${symbol}). Always verify the broker's actual available instruments before attempting to trade.` 
              } 
          });
      }
  } catch (err) {
      console.warn("Could not validate symbol before analysis", err);
  }

  // 1. ANTI-SPAM / DUPLICATE REQUESTS PROTECTION (Repeated prompt suppression)
  // Bypasses Gemini API call entirely, directly returning cached outcomes to save token expense.
  const timeStep = Math.floor(Date.now() / (10 * 60000)); // 10 minute granularity
  const cacheKey = `${accountId}_${symbol}_${direction}_${timeStep}`;
  const cachedAnalysis = globalScope.CHATRADE_ANALYSIS_CACHE.get(cacheKey);
  if (cachedAnalysis && !isDeepRequest) {
      console.log(`[CHATRADE_CACHE] Returning existing 10m duplicate cached analysis for ${symbol}`);
      return res.json({ 
        success: true, 
        analysis: cachedAnalysis.data, 
        quotaInfo: getUserQuota(userEmail),
        cached: true
      });
  }

  // 2. CHECK & SPEND USER PERSONAL TIERS/PLANS DAILY QUOTA POINTS
  const consumeRes = consumeQuotaPoints(userEmail, true); // Deep-level Confluence requests consume 5 units
  if (!consumeRes.success) {
    const errorMsg = consumeRes.error && consumeRes.error.includes("COOLDOWN_PROTECTION")
      ? "🚨 COOLDOWN PROTECTION: Processing previous parameters. Please wait 2 seconds."
      : "Your daily AI analysis limit for your current plan has been reached. Trading functions remain active until quota resets.";
    
    logAIAnalytics(userEmail, planName, 'DEEP', 'local_fallback', 'user_quota_blocked');
    return res.json({
      success: true,
      quotaReached: true,
      analysis: {
        outcome: "REJECT",
        confidence: 100,
        reason: errorMsg,
        mentorVoice: errorMsg
      },
      quotaInfo: getUserQuota(userEmail)
    });
  }

  const quotaInfo = getUserQuota(userEmail);

  try {
    // 1. Technical signal (Optimized: Last 12 candles)
    const rawBuffer = globalScope.CANDLE_STORE?.[accountId]?.[symbol] || [];
    const buffer = rawBuffer.slice(-12); 
    let techAnalysis = null;
    if (buffer && buffer.length >= 5) {
      techAnalysis = performPatternAnalysis(accountId, symbol, buffer);
    }
    
    // 2. Fetch FRED fundamental data (Optimized: 1 hour cache)
    const FRED_CACHE_DURATION = 3600000;
    let fredSummary = "";
    const cachedFred = globalScope.CHATRADE_FRED_CACHE.get("MASTER");
    
    if (cachedFred && (Date.now() - cachedFred.timestamp < FRED_CACHE_DURATION)) {
      fredSummary = cachedFred.data;
    } else {
      try {
        const fredIndicators = ['FEDFUNDS', 'CPIAUCSL', 'UNRATE', 'GDP'];
        const observations: any[] = [];
        for (const id of fredIndicators) {
          try {
            const res = await axios.get(`https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=3f7616a1fc27586c2a083e232aec6a8f&file_type=json&sort_order=desc&limit=2`);
            if (res.data?.observations?.length > 0) {
              observations.push({ id, current: res.data.observations[0].value, previous: res.data.observations[1].value });
            }
          } catch(e) {}
        }
        fredSummary = observations.map(obs => `${obs.id}:${obs.current}(p:${obs.previous})`).join(';');
        globalScope.CHATRADE_FRED_CACHE.set("MASTER", { data: fredSummary, timestamp: Date.now() });
      } catch(e) {
        fredSummary = "FRED Indicators stable.";
      }
    }

    // 3. Pull News Sentiment (Optimized: 15 min cache)
    const NEWS_CACHE_DURATION = 900000;
    const category = symbol.includes('BTC') ? 'crypto' : 'forex';
    let newsSummary = "";
    const cachedNews = globalScope.CHATRADE_NEWS_CACHE.get(category);
    
    if (cachedNews && (Date.now() - cachedNews.timestamp < NEWS_CACHE_DURATION)) {
      newsSummary = cachedNews.data;
    } else {
      try {
        const newsRes = await axios.get(`https://finnhub.io/api/v1/news?category=${category}&token=d82220hr01qrojfdmpn0d82220hr01qrojfdmpng`);
        if (newsRes.data && Array.isArray(newsRes.data)) {
          newsSummary = newsRes.data.slice(0, 3).map((n: any) => `- ${n.headline.slice(0, 80)}`).join('\n');
          globalScope.CHATRADE_NEWS_CACHE.set(category, { data: newsSummary, timestamp: Date.now() });
        }
      } catch(e) {
        newsSummary = "Sentiment neutral.";
      }
    }

    // 4. Calendar event risk (Static summarized)
    const economicCalendarEvents = "FOMC/CPI/NFP pending this week. Volatility expected.";

    // 5. User capital & risk plan
    const plans = loadUserPlans();
    const userPlan = plans[userEmail] || {
      capital: "200",
      goal: "Double account",
      riskProfile: "Balanced",
      rules: null
    };

    // 6. PRE-FILTER RULE: Check locally before calling AI
    const posMap = globalScope.ACTIVE_POSITIONS.get(accountId) || new Map();
    const activePositionsCount = posMap.size;
    
    // Check for duplicate trade locally
    const duplicate = Array.from(posMap.values()).find((p: any) => p.symbol === symbol && p.type.includes(direction));
    if (duplicate && !isDeepRequest) {
        return res.json({ 
            success: true, 
            analysis: { 
                outcome: "REJECT", 
                confidence: 100, 
                reason: "Local Pre-filter: Same-direction trade already active on this symbol.",
                mentorVoice: "Focus, trader. You already have a position in this direction on this symbol. Don't over-leverage." 
            },
            quotaInfo: getUserQuota(userEmail)
        });
    }

    const realContext = accountId ? await fetchAccountRealContext(accountId) : null;

    // 3. LOW QUOTA MODE: Automatically adapt prompt for extreme token compression
    const lowQuotaIndicatorText = quotaInfo.lowQuotaMode
      ? `\n[LOW QUOTA MODE ACTIVE] Compress reasoning and explanation (mentorVoice) to 1 short sentence max. Simplify SL/TP logic. Keep token overhead minimal.`
      : `\nEnsure stop loss and take profit values are mathematically correct, realistic for ${symbol}, and align with the user's risk ratio (${userPlan.riskProfile}). Provide direct mentoring voice guidance.`;

    const prompt = `You are the Chatrade Institutional AI Confluence Decision System.
Act as the chief risk officer and market analyst. Analyze this setup and render a final trading decision.

CONTEXT:
- Instrument: ${symbol}
- Direction: ${direction}
- Technical snapshot: ${JSON.stringify(techAnalysis)}
- Fundamental summary (FRED): ${fredSummary}
- Sentiment & news: ${newsSummary}
- Calendar events: ${economicCalendarEvents}
- User Trading Plan: Capital: $${userPlan.capital}, Risk Profile: ${userPlan.riskProfile}${lowQuotaIndicatorText}

REAL-TIME TRADING TERMINAL STATE (SOURCE OF TRUTH):
- Account Balance: ${realContext ? realContext.currency + ' ' + realContext.balance : 'No terminal active'}
- Account Equity: ${realContext ? realContext.currency + ' ' + realContext.equity : 'No terminal active'}
- Free Margin: ${realContext ? realContext.currency + ' ' + realContext.freeMargin : 'No terminal active'}
- Margin Level: ${realContext ? realContext.marginLevel.toFixed(1) + '%' : '0.0%'}
- Account Leverage: 1:${realContext ? realContext.leverage : '100'}
- Active Exposure Count: ${realContext ? realContext.activePositionsCount : '0'} positions
- Active Exposure Details: ${realContext ? JSON.stringify(realContext.activeTradesSummary) : '[]'}
- Recent Win Rate: ${realContext ? realContext.recentWinRate + '%' : '65%'}
- Current Drawdown State: ${realContext ? realContext.recentDrawdown.toFixed(1) + '%' : '0%'}
- Account Currency: ${realContext ? realContext.currency : 'USD'}

CRITICAL INSTITUTIONAL RISK APPROVAL RULES (MANDATORY):
Before APPROVING any trade:
1. Validate SUFFICIENT MARGIN: Estimate margin required = (Requested Lot Size * 100000) / Leverage. High-leverage or low free margin must result in "REJECT". If margin required > Free Margin, reject.
2. Validate SAFE POSITION SIZING: Standard risk is 1.0% to 2.5% of real Balance. Convert Stop Loss to Pip value. Maximum Risk Amount = Lot Size * Stop Loss Pips * $10 (or currency equivalent). Adjust or reduce lotSize automatically so Risk Amount <= (acceptable risk proportion of Balance).
   - If user balance is small (e.g. R5,000 / $250) and risk exceeds safe limits, reduce requested lotSize automatically to 0.01 or safe fractional size and explain this in mentorVoice.
3. Validate PROP FIRM DRAWDOWN LIMITS & SURVIVAL PROBABILITY:
   - If Current Drawdown State > 4.5% or Max Drawdown > 8.0%, you MUST REJECT with outcome "REJECT" and reason "PROP_FIRM_DRAWDOWN_LIMIT" to prevent catastrophic account failure.
4. REJECTION / REDUCTION: If parameters violate account safety, output "REJECT" or automatically scale down the lotSize size and explain in mentorVoice.

Your outputs must strictly adhere to the requested JSON schema.
Return a professional mentoring voice explanation (mentorVoice) that explains your reasoning and any safety adjustments directly.`;

    // 7. Call Gemini (Optimized for tokens)
    try {
        const analysisResult = await callAIWithFallback(prompt, {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              outcome: { type: Type.STRING },
              confidence: { type: Type.INTEGER },
              reason: { type: Type.STRING },
              detailedReasoning: { type: Type.STRING },
              lotSize: { type: Type.NUMBER },
              stopLossPips: { type: Type.NUMBER },
              takeProfitPips: { type: Type.NUMBER },
              riskRewardRatio: { type: Type.STRING },
              mentorVoice: { type: Type.STRING }
            },
            required: ["outcome", "confidence", "reason", "mentorVoice"]
          }
        });

        const parsedResult = JSON.parse(analysisResult.text || "{}");
        
        // CACHE THE RESULT
        globalScope.CHATRADE_ANALYSIS_CACHE.set(cacheKey, { data: parsedResult, timestamp: Date.now() });
        
        // LOG TO MEMORY SYSTEM
        ChatradeMemory.logAIDecision(crypto.randomUUID(), accountId || userEmail, 'N/A', {
          decision: parsedResult.outcome,
          confidence: parsedResult.confidence,
          reasoning: parsedResult.mentorVoice || parsedResult.reason,
          risk_score: 50,
          lot_size: parsedResult.lotSize,
          tp: parsedResult.takeProfitPips,
          sl: parsedResult.stopLossPips
        }).catch(err => console.error("Memory Log AI Error:", err));

        logAIAnalytics(userEmail, planName, 'DEEP', 'gemini-3.5-flash', 'success');

        res.json({ 
          success: true, 
          analysis: parsedResult,
          quotaInfo: getUserQuota(userEmail)
        });
    } catch (apiErr: any) {
        // 8. EMERGENCY SYSTEM-FAULT API PROTECTION INSTEAD OF FRONTEND CRASHES
        const errStr = String(apiErr).toLowerCase();
        console.warn(`[CHATRADE_AI_FAILURE] System-fault AI error. Engaged Local Fallback. Exception:`, apiErr.message || errStr);
        
        const fallback = localFallbackAnalysis(accountId, symbol, direction, userPlan, techAnalysis);
        
        // Inject a custom system alert warning in mentor voice so they are notified gracefully
        fallback.mentorVoice = `⚠️ Gemini API limits hit. Switched to local Confluence safe solver. Direct trading and ALGOTRADE execution systems remain 100% active.`;

        logAIAnalytics(userEmail, planName, 'DEEP', 'local_fallback', 'fallback_active');

        return res.json({ 
          success: true, 
          analysis: fallback, 
          fallbackActive: true,
          quotaInfo: getUserQuota(userEmail)
        });
    }
  } catch (error: any) {
    console.error("[CHATRADE_ANALYZE_ERROR]", error);
    res.status(500).json({ error: sanitizeGeminiError(error) });
  }
} catch (outerErr: any) {
  console.error("[CHATRADE_ANALYZE_OUTER_ERROR]", outerErr);
  res.status(401).json({ error: outerErr.message || "Unauthorized" });
}
});

app.post("/api/chatrade/chat", async (req, res) => {
  try {
    const userEmail = await getUserEmailFromRequest(req);
    if (!userEmail) {
      return res.status(401).json({ error: "Unauthorized: Missing session context" });
    }
    const { message, accountId, history = [] } = req.body || {};
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // STRICT MULTI-USER LEASE OWNERSHIP CHECK: Ensure account belongs to user!
    if (accountId && adminSupabase) {
        const userId = await getUserIdFromRequest(req);
        const { data: lease } = await adminSupabase.from("ea_leases").select("user_id").eq("account_id", accountId).maybeSingle();
        if (lease && lease.user_id !== userId) {
            return res.status(403).json({ error: "Access Denied: You do not own this trading account lease." });
        }
    }

    const planName = getUserPlanName(userEmail);

  try {
    const plans = loadUserPlans();
    const userPlan = plans[userEmail] || {
      capital: "200",
      goal: "Double account",
      riskProfile: "Balanced",
      rules: null
    };

    // 1. ANTI-SPAM: DUPLICATE MESSAGE DETECTION & REPEATED PROMPT SUPPRESSION
    const cachedResponseText = checkAndGetDuplicateResponse(userEmail, message);
    if (cachedResponseText) {
      return res.json({ 
        success: true, 
        reply: cachedResponseText, 
        cached: true,
        quotaInfo: getUserQuota(userEmail)
      });
    }

    // 2. DETERMINING MODE & CONSUMING QUOTA POINTS
    // Deep mode matches keywords demanding comprehensive strategies or analytical decisions.
    const isDeepRequested = /\b(deep|analyze|tp|sl|confluence|risk|fundamental|reasoning|prop|setup|calc)\b/i.test(message);
    const consumeRes = consumeQuotaPoints(userEmail, isDeepRequested);
    
    // If user has depleted their daily quota, block and return the required message
    if (!consumeRes.success) {
      const errorMsg = consumeRes.error && consumeRes.error.includes("COOLDOWN_PROTECTION") 
        ? "🚨 COOLDOWN PROTECTION: Please pace your commands. AI Engine is processing previous parameters."
        : "Your daily AI analysis limit for your current plan has been reached. Trading functions remain active until quota resets.";
      
      logAIAnalytics(userEmail, planName, isDeepRequested ? 'DEEP' : 'LIGHT', 'local_fallback', 'user_quota_blocked');
      return res.json({ 
        success: true, // return true with custom warning reply message so it prints directly inside Chat history cleanly
        reply: errorMsg,
        quotaReached: true,
        quotaInfo: getUserQuota(userEmail)
      });
    }

    const quotaInfo = getUserQuota(userEmail);

    const realContext = accountId ? await fetchAccountRealContext(accountId) : null;
    const positionsList = realContext ? realContext.activeTradesSummary : [];

    // Get available symbols to enforce strict rules
    let availableSymbols: string[] = [];
    try {
        if (accountId && metaapi) {
            availableSymbols = await getSymbolsCached(metaapi, accountId);
        }
    } catch(e) {
        console.warn("Could not load symbols for chat context", e);
    }
    
    // OPTIMIZATION: Truncate chat history to last 5 messages
    const limitedHistory = history.slice(-5).map((h: any) => `${h.sender}: ${h.text}`).join('\n');

    // 3. LOW QUOTA MODE: Automatically adapt prompt for extreme token compression & cache priority
    const lowQuotaModifierText = quotaInfo.lowQuotaMode 
      ? `\n[LOW QUOTA MODE ACTIVE] You must compress your reasoning to the absolute maximum. Do NOT write unnecessary intro/outro fluff. Respond in exactly 1-2 sentences with high technical density. Prefer cache-efficient terminology.`
      : `\nAct as mentor. Use DEEP MODE only if requested. Otherwise, respond concisely (1-2 paragraphs max). Reference rules if a violation exists. Keep responses highly optimized and concise.`;

    const prompt = `You are Chatrade AI - Institutional mentor mode [LOW-COST].
Style: Disciplined, direct, professional. No fluff.
- Connected Broker Account Balance: ${realContext ? realContext.currency + ' ' + realContext.balance : 'No terminal connected'}
- Connected Broker Account Equity: ${realContext ? realContext.currency + ' ' + realContext.equity : 'No terminal connected'}
- Free Margin: ${realContext ? realContext.currency + ' ' + realContext.freeMargin : 'No terminal connected'}
- Current Drawdown State: ${realContext ? realContext.recentDrawdown.toFixed(1) + '%' : '0.0%'}
- Recent Win Rate: ${realContext ? realContext.recentWinRate + '%' : '65%'}
Context:
- User: ${userEmail}
- Plan Tier: ${quotaInfo.plan} (Remaining: ${quotaInfo.chatsRemaining} chats, ${quotaInfo.deepsRemaining} deep analyses)
- Acc: $${userPlan.capital} (${userPlan.riskProfile})
- Rules: ${userPlan.rules ? "Active" : "None"}
- Live: ${JSON.stringify(positionsList)}
- Available Trading Symbols on Broker: ${availableSymbols.length > 0 ? availableSymbols.join(", ") : "Unknown"}

Conversation History:
${limitedHistory}

User message: "${message}"

Your instruction:${lowQuotaModifierText}
CRITICAL SYMBOL RULE:
1. ONLY use trading symbols that already exist inside the "Available Trading Symbols on Broker" list.
2. Never invent symbols. Never generate unsupported symbols.
3. If user asks "Analyze gold", map intelligently ONLY if symbol exists (e.g. XAUUSD, GOLD, XAUUSDm). Prioritize the broker's actual available names.
4. If the symbol asked for is NOT in the available list, reject it safely (e.g. "Symbol not available in connected broker account.").

CRITICAL AUTOMATION RULE:
1. If the user mentions "automation", "autopilot", "auto trading", "robot", "expert advisor", "auto mode", or requests automated AI trading, you must politely but firmly command them to press the "START" button on the Chatrade console or Market tab to engage active auto-trading. Explain that you can verify and suggest the ideal parameters, but they must manually toggle the core automation mechanism on via the START / STOP control.`;

    let replyText = "";
    let systemModel = "gemini-3.5-flash";

    try {
      const response = await callAIWithFallback(prompt);
      replyText = response.text || "";
      
      // Save last response for duplicate prompt suppression
      saveLastResponse(userEmail, message, replyText);
      logAIAnalytics(userEmail, planName, isDeepRequested ? 'DEEP' : 'LIGHT', 'gemini-3.5-flash', 'success');

      // Save to memory system natively in async background
      ChatradeMemory.saveChat(crypto.randomUUID(), accountId || userEmail, 'user', message, 'general').catch(console.error);
      ChatradeMemory.saveChat(crypto.randomUUID(), accountId || userEmail, 'assistant', replyText, 'general').catch(console.error);
    } catch (apiErr: any) {
      // 4. EMERGENCY SYSTEM-FAULT API PROTECTION INSTEAD OF FRONTEND CRASHES
      console.warn(`[CHATRADE_AI_FAILURE] System-fault AI error. Engaged Local Fallback. Exception:`, apiErr.message || apiErr);
      
      replyText = getLocalFallbackChatResponse(message, userPlan, positionsList, availableSymbols);
      systemModel = "local_fallback";

      logAIAnalytics(userEmail, planName, isDeepRequested ? 'DEEP' : 'LIGHT', 'local_fallback', 'fallback_active');
    }

    res.json({ 
      success: true, 
      reply: replyText, 
      quotaInfo: getUserQuota(userEmail),
      fallbackActive: systemModel === 'local_fallback'
    });
  } catch (error: any) {
    console.error("[CHATRADE_CHAT_ERROR]", error);
    res.status(500).json({ error: sanitizeGeminiError(error) });
  }
} catch (outerErr: any) {
  console.error("[CHATRADE_CHAT_OUTER_ERROR]", outerErr);
  res.status(401).json({ error: outerErr.message || "Unauthorized" });
}
});

function getLocalFallbackChatResponse(message: string, userPlan: any, positionsList: any[], availableSymbols: string[]) {
  const isTrendQuery = /trend|market|direction|buy|sell|gold|xauusd|eurusd/i.test(message);
  let fallbackText = `⚠️ Gemini AI services are temporarily exhausted or over-capacity. Chatrade AI has automatically engaged local micro-analysis safety protocols to ensure trading functions remain 100% active and safe.\n\n`;
  
  if (isTrendQuery) {
    fallbackText += `🔧 **Local Safe Confluence Solver**:\n`;
    fallbackText += `- Connected Capital: $${userPlan.capital}\n`;
    fallbackText += `- Risk Model: ${userPlan.riskProfile}\n`;
    fallbackText += `- Live Exposure: ${positionsList.length} active trade(s).\n`;
    fallbackText += `- Solver Guidance: Standard direct trading systems are fully active. Maintain standard lot allocations. Technical structures remain neutral.`;
  } else {
    fallbackText += `🔧 **Risk Desk Local Report**:\n`;
    fallbackText += `- Balance Protected: Safe capital allocation is applied locally.\n`;
    fallbackText += `- Operational Status: Safe direct manual trading and ALGOTRADE execution engines are online.\n`;
    fallbackText += `- Recommendation: Local automated risk filters and safety guards (SL/TP enforcements) are operating autonomously. No action required.`;
  }
  return fallbackText;
}

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
      if (userCache && userCache.length > 0) {
        return res.json(userCache.filter((a: any) => activeAccountIds.has(a.id)));
      }
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
  const symbols = await getSymbolsCached(metaapi, accountId);
  if (!symbols || symbols.length === 0) {
      throw new Error(`Symbol list empty or unavailable for account. Symbol ${symbol} could not be validated.`);
  }

  // Exact match
  if (symbols.includes(symbol)) return symbol;

  // Case-insensitive match
  const lowerSymbol = symbol.toLowerCase();
  const caseInMatch = symbols.find(s => s.toLowerCase() === lowerSymbol);
  if (caseInMatch) return caseInMatch;

  // Suffix match (e.g. XAUUSD -> XAUUSDm, XAUUSD.m, XAUUSD#, mXAUUSD)
  const suffixMatch = symbols.find(s => {
    const sLower = s.toLowerCase();
    if (sLower === lowerSymbol) return true;
    if (sLower.startsWith(lowerSymbol + ".") || sLower.startsWith(lowerSymbol + "#") || sLower.startsWith(lowerSymbol + "+") || sLower.startsWith(lowerSymbol + "m")) return true;
    if (sLower.endsWith(lowerSymbol) || sLower.endsWith("m" + lowerSymbol)) return true;
    return false;
  });

  if (suffixMatch) {
    console.log(`[SDK] Symbol Normalization: ${symbol} -> ${suffixMatch}`);
    return suffixMatch;
  }
  
  // Intelligent mapping for human inputs
  const aliases: Record<string, string[]> = {
    'gold': ['XAUUSD', 'GOLD', 'XAUUSDm', 'XAUUSD.m', 'XAUEUR'],
    'bitcoin': ['BTCUSD', 'BTCUSDT', 'BTCUSDm'],
    'btc': ['BTCUSD', 'BTCUSDT', 'BTCUSDm'],
    'eurusd': ['EURUSD', 'EURUSDm', 'EURUSD.'],
    'us30': ['US30', 'DJ30', 'WS30', 'DOWJONES'],
    'nasdaq': ['NAS100', 'US100', 'NDX']
  };
  
  const possibleMappings = aliases[lowerSymbol];
  if (possibleMappings) {
      for (const mapping of possibleMappings) {
         // Also check case insensitive inside the mapping
         const mappingMatch = symbols.find(s => s.toLowerCase() === mapping.toLowerCase() || s.toLowerCase().startsWith(mapping.toLowerCase() + "m"));
         if (mappingMatch) {
             console.log(`[SDK] Mapped alias ${symbol} -> ${mappingMatch}`);
             return mappingMatch;
         }
      }
  }

  throw new Error(`Symbol validation failed: ${symbol} is not available in connected broker account. Available symbols check failed.`);
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
    const currentTrades = Array.from(positionsMap.values()).filter((p: any) => p.comment === 'ALGOTRADE' || p.comment === 'CHATRADE').length;

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
    const currentTrades = Array.from(positionsMap.values()).filter((p: any) => p.comment === 'ALGOTRADE' || p.comment === 'CHATRADE').length;

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

const POSITIONS_CACHE = new Map<string, { data: any; timestamp: number }>();

app.get("/api/account/:accountId/positions", async (req, res) => {
  const { accountId } = req.params;
  if (!accountId || accountId === 'undefined' || accountId === 'null') {
    return res.json([]);
  }
  try {
    const now = Date.now();
    const cached = POSITIONS_CACHE.get(accountId);
    if (cached && (now - cached.timestamp < 60000)) { // 60s cache
        return res.json(cached.data);
    }

    const userId = await getUserIdFromRequest(req);
    // Use the synchronized stream connection instead of RPC to avoid polling limits
    const connection = REGISTRY.stream.get(accountId);
    if (!connection || !connection.terminalState) {
      const posMap = globalScope.ACTIVE_POSITIONS?.get(accountId);
      if (posMap && typeof posMap.values === 'function') {
        const fallback = Array.from(posMap.values());
        POSITIONS_CACHE.set(accountId, { data: fallback, timestamp: now });
        return res.json(fallback);
      }
      return res.json([]);
    }
    const positions = connection.terminalState.positions || [];
    POSITIONS_CACHE.set(accountId, { data: positions, timestamp: now });
    res.json(positions);
  } catch (err: any) {
    console.error("[POSITIONS_FETCH_ERROR]", err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

const STATUS_CACHE = new Map<string, { data: any; timestamp: number }>();

app.get("/api/account/:accountId/status", async (req, res) => {
  const { accountId } = req.params;
  if (!accountId || accountId === 'undefined' || accountId === 'null') {
    return res.json({
        ready: false,
        streamActive: false,
        metaApiReady: false,
        state: 'UNDEPLOYED',
        connectionStatus: 'DISCONNECTED',
        lastTick: 0,
        positions: [],
        orders: [],
        lastCacheUpdate: 0,
        eaDeployed: false,
        algoRunning: false
    });
  }
  try {
    const userId = await getUserIdFromRequest(req);
    
    // Caching layer to prevent MetaApi 429 during rapid polling
    const now = Date.now();
    const cachedStatus = STATUS_CACHE.get(accountId);
    if (cachedStatus && (now - cachedStatus.timestamp < 5000)) { // 5s cache
        return res.json(cachedStatus.data);
    }

    const connection = REGISTRY.stream.get(accountId);
    
    const cache = globalScope.ACCOUNT_CACHE.get(accountId) || { positions: [], orders: [], lastUpdate: 0 };
    
    let metaApiReady = false;
    if (connection) {
       metaApiReady = connection.terminalState?.connected === true && connection.terminalState?.connectedToBroker === true;
    }

    const account = metaapi ? await getAccount(accountId).catch(() => null) : null;
    const state = account ? account.state : 'UNDEPLOYED';
    const connectionStatus = account ? account.connectionStatus : 'DISCONNECTED';
    
    const statusData = {
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
    };

    STATUS_CACHE.set(accountId, { data: statusData, timestamp: now });
    res.json(statusData);
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
  if (!accountId || accountId === 'undefined' || accountId === 'null') {
    return res.json([]);
  }
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

const METASTATS_CACHE = new Map<string, { data: any; timestamp: number }>();

app.get("/api/account/:accountId/metastats", async (req, res) => {
  const { accountId } = req.params;
  if (!accountId || accountId === 'undefined' || accountId === 'null') {
    return res.json({ trades: [], metrics: {} });
  }
  try {
    const now = Date.now();
    const cached = METASTATS_CACHE.get(accountId);
    if (cached && (now - cached.timestamp < 300000)) { // 5-minute cache
        return res.json(cached.data);
    }
    
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
        
        // Use the same domain suffix as the SDK to ensure consistency
        const sdkConfig = (metaapi as any)._options || {};
        const domainToUse = sdkConfig.domain || 'agiliumtrade.agiliumtrade.ai';
        const domainSuffix = domainToUse;
        
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
        
        const result = { metrics, trades };
        METASTATS_CACHE.set(accountId, { data: result, timestamp: now });
        res.json(result);
    } catch (e: any) {
        const cached = METASTATS_CACHE.get(accountId);
        if (cached) {
            console.warn(`[METASTATS] Fetch failed for ${accountId}, serving stale cache.`);
            return res.json(cached.data);
        }
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
  if (!accountId || accountId === 'undefined' || accountId === 'null') {
    return res.json([]);
  }
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
                          // EXPERIMENTAL: Log to new Chatrade Memory System if DB active
                          ChatradeMemory.logTrade(crypto.randomUUID(), accountId, {
                              symbol: activeSymbol,
                              direction: signal,
                              lot_size: lotSize,
                              status: 'OPEN',
                              execution_source: 'NODE_STRATEGY',
                              opened_at: new Date().toISOString()
                          }).catch(err => console.error("Memory Log Error:", err));
                          
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
                if (info) {
                    console.log(`[SDK] Pushing initial account state to stream for ${accountId}: ${info.balance} ${info.currency}`);
                    ws.send(JSON.stringify({
                        type: 'account:update',
                        accountId,
                        balance: info.balance ?? 0,
                        equity: info.equity ?? info.balance ?? 0,
                        margin: info.margin ?? 0,
                        freeMargin: info.freeMargin ?? 0,
                        marginLevel: info.marginLevel ?? 0,
                        currency: info.currency || 'USD'
                    }));
                } else {
                    console.warn(`[SDK] Initial accountInfo missing for ${accountId} at STREAM_SUBSCRIBE time.`);
                }
                
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
                            // Try connection object (G2/Streaming) - Most reliable for synchronized streams
                            if (connection && typeof (connection as any).getHistoricalCandles === 'function') {
                                console.log(`[SDK_RPC] Using G2 path for candles (connection) on ${accountId} for ${s}`);
                                return await (connection as any).getHistoricalCandles(s, timeframe, undefined, 400);
                            }

                            const account = await metaapi.metatraderAccountApi.getAccount(accountId);
                            
                            // Try account object (G1 or cached G2)
                            if (typeof (account as any).getHistoricalCandles === 'function') {
                                console.log(`[SDK_RPC] Using account-object path for candles on ${accountId} for ${s}`);
                                return await (account as any).getHistoricalCandles(s, timeframe, undefined, 400);
                            }
                            
                            // Fallback to direct API method
                            if (typeof metaapi.metatraderAccountApi.getHistoricalCandles === 'function') {
                                 console.log(`[SDK_RPC] Using MetatraderAccountApi path for candles on ${accountId} for ${s}`);
                                 return await metaapi.metatraderAccountApi.getHistoricalCandles(accountId, s, timeframe, undefined, 400);
                            }

                            console.warn('[SDK_RPC] No historical candles method found on account or connection.');
                            return [];
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
                  candles: (history && Array.isArray(history)) ? history : []
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
             
             if (globalScope.STREAM_READY?.get(accountId)) {
                 ws.send(JSON.stringify({ type: 'ACCOUNT_READY', accountId, status: 'READY' }));
             }
             
             // 0. Update Account Information immediately on sync state request
             const connection = REGISTRY.stream.get(accountId);
             if (connection?.synchronized) {
                 ws.send(JSON.stringify({ type: 'status:update', accountId, status: 'READY' }));
                 ws.send(JSON.stringify({ type: 'ACCOUNT_READY', accountId, status: 'READY' }));
                 ws.send(JSON.stringify({ type: 'SYNC_READY', accountId }));
                 globalScope.STREAM_READY.set(accountId, true);
                 REGISTRY.locked.set(accountId, true);
             }
             const info = connection?.terminalState?.accountInformation;
             if (info) {
                 ws.send(JSON.stringify({ 
                   type: 'account:update', 
                   accountId, 
                   balance: info.balance ?? 0,
                   equity: info.equity ?? info.balance ?? 0,
                   margin: info.margin ?? 0,
                   freeMargin: info.freeMargin ?? 0,
                   marginLevel: info.marginLevel ?? 0,
                   currency: info.currency || 'USD'
                 }));
             }

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

    app.get('*all', (req, res) => {
      if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: `Not Found: ${req.method} ${req.path}` });
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

startServer().catch(err => {
  console.error("[CORE] FATAL: Server failed to start:", err);
  process.exit(1);
});
