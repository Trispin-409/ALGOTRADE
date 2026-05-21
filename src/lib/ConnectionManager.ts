
import { safeFetch, delay } from './utils';

export const TradingPhase = {
  INIT: 'INIT',
  CONNECTING_META: 'CONNECTING_META',
  META_CONNECTED: 'META_CONNECTED',
  BROKER_CONNECTED: 'BROKER_CONNECTED',
  ACCOUNT_SYNCING: 'ACCOUNT_SYNCING',
  ACCOUNT_READY: 'ACCOUNT_READY',
  STREAMING: 'STREAMING'
} as const;

export type TradingPhase = typeof TradingPhase[keyof typeof TradingPhase];

/**
 * ConnectionManager Singleton
 * Orchestrates a single MetaApi WS client per account,
 * enforces connection registries, exponential backoff, health checks,
 * and stream debouncing.
 */
class ConnectionManager {
  private static instance: ConnectionManager;
  private connections: Map<string, WebSocket> = new Map();
  private baseUrls: Map<string, string> = new Map();
  private statusListeners: Map<string, Set<(status: boolean) => void>> = new Map();
  private registries: Map<string, any> = new Map();
  private retryCount: Map<string, number> = new Map();
  private listeners: Set<(data: any) => void> = new Set();
  private phaseListeners: Set<(phase: TradingPhase) => void> = new Set();
  
  private selectedAccountId: string | null = null;
  private phase: TradingPhase = TradingPhase.INIT;
  private pendingCommands: any[] = [];
  private syncRetryCounter = 0;
  private maxSyncRetries = 15;
  
  // State Locks
  public initialized: boolean = false;
  private static ACTIVE_LIFECYCLES: Set<string> = new Set();
  
  private brokerConnectedState: Map<string, boolean> = new Map();
  private terminalSyncedState: Map<string, boolean> = new Map();

  private transitionTo(newPhase: TradingPhase) {
      if (this.phase === newPhase) return;
      
      console.log(`[PHASE_CHANGE] ${this.phase} -> ${newPhase} for ${this.selectedAccountId}`);
      this.phase = newPhase;
      
      if (this.phase === TradingPhase.ACCOUNT_READY || this.phase === TradingPhase.STREAMING) {
          if (this.phase === TradingPhase.ACCOUNT_READY) {
            console.log(`[LIFECYCLE_READY] Phase ACCOUNT_READY - Flushing queues.`);
            this.flushCommands();
            this.listeners.forEach(cb => cb({ type: 'LIFECYCLE_READY' }));
            // Automatically transition to STREAMING
            this.transitionTo(TradingPhase.STREAMING);
          }
      }
      
      this.phaseListeners.forEach(cb => cb(this.phase));
  }

  private flushCommands() {
      console.log(`[QUEUE_FLUSHED] Flushing ${this.pendingCommands.length} commands.`);
      while (this.pendingCommands.length > 0) {
          const cmd = this.pendingCommands.shift();
          this.send(this.selectedAccountId!, cmd, true);
      }
  }
  
  private restHydrated: Map<string, boolean> = new Map();
  private initLocks: Set<string> = new Set();
  private syncLocks: Set<string> = new Set();
  private streamRegistry: Set<string> = new Set();
  private streamFailures: Map<string, number> = new Map();
  private desiredStream: { symbol: string, timeframe: string } | null = null;
  private activeStreamKey: string | null = null;

  private constructor() {}

  public static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  public setStreamIntent(accountId: string, symbol: string, timeframe: string) {
      if (!accountId || !symbol || !timeframe) return;
      
      const newKey = `${accountId}:${symbol}:${timeframe}`;
      if (this.activeStreamKey === newKey) return;
      if (this.streamRegistry.has(newKey)) return;

      if (this.activeStreamKey && this.desiredStream) {
          this.send(accountId, { 
              type: 'STREAM_UNSUBSCRIBE', 
              accountId, 
              symbol: this.desiredStream.symbol, 
              timeframe: this.desiredStream.timeframe 
          }, false);
      }

      this.desiredStream = { symbol, timeframe };
      this.activeStreamKey = newKey;
      console.log(`[STREAM_AUTHORITY] Intent set: ${symbol} (${timeframe}) for ${accountId}`);
      
      this.orchestrateStream(accountId, symbol, timeframe, (m) => console.log(m))
          .catch(err => console.error(`[STREAM_AUTHORITY] Automated engagement failed:`, err));
  }

  private async orchestrateStream(accountId: string, symbol: string, timeframe: string, addLog: (msg: string) => void) {
      const streamKey = `${accountId}:${symbol}:${timeframe}`;

      try {
          console.log(`[STREAM_ENGINE] Engaging MetaTrader SDK stream for ${symbol} (${timeframe})...`);
          
          this.send(accountId, { 
              type: 'STREAM_SUBSCRIBE', 
              accountId, 
              symbol, 
              timeframe 
          }, false);

          this.streamRegistry.add(streamKey);
          this.send(accountId, { type: 'subscribe', accountId }, false);

          return true;
      } catch (err: any) {
          console.error(`[STREAM_AUTHORITY] FATAL: ${streamKey} failed.`, err);
          this.activeStreamKey = null;
          this.streamRegistry.delete(streamKey);
          addLog(`STREAM_ERROR: Failed to engage ${streamKey}: ${err.message}`);
          throw err;
      }
  }

  public clearStreamIntent(accountId: string) {
      if (this.activeStreamKey && this.desiredStream) {
          this.send(accountId, { 
              type: 'STREAM_UNSUBSCRIBE', 
              accountId, 
              symbol: this.desiredStream.symbol, 
              timeframe: this.desiredStream.timeframe 
          }, true);
      }
      this.activeStreamKey = null;
      this.desiredStream = null;
  }

  public setAccountSyncComplete(accountId: string) {
      this.terminalSyncedState.set(accountId, true);
      console.log(`[TERMINAL_SYNC_OK] Account ${accountId} Sync Confirmed ✅`);
      this.evaluatePhase();
  }

  public get currentPhase(): TradingPhase {
    return this.phase;
  }
  
  public subscribePhase(cb: (phase: TradingPhase) => void) {
      if (typeof cb !== 'function') return () => {};
      this.phaseListeners.add(cb);
      cb(this.phase);
      return () => this.phaseListeners.delete(cb);
  }
  
  public subscribe(cb: (data: any) => void) {
      if (typeof cb !== 'function') {
        console.error("[ConnectionManager] subscribe called with non-function:", cb);
        return () => {};
      }
      this.listeners.add(cb);
      return () => this.listeners.delete(cb);
  }
  
  public get isTradingReady(): boolean {
      return this.phase === TradingPhase.ACCOUNT_READY || this.phase === TradingPhase.STREAMING;
  }

  private tokens: Map<string, string> = new Map();

  public bootOnce(accountId: string, baseUrl: string, token: string = '') {
      if (!baseUrl || baseUrl === 'undefined') {
          throw new Error(`[CRITICAL] MetaApi base URL missing for ${accountId}. Boot aborted.`);
      }

      if (token) {
        this.tokens.set(accountId, token);
      }

      if (ConnectionManager.ACTIVE_LIFECYCLES.has(accountId)) return;
      ConnectionManager.ACTIVE_LIFECYCLES.add(accountId);
      
      console.log(`[LIFECYCLE] 🧱 HARD LOCK: Booting Global Lifecycle for ${accountId}...`);
      
      this.selectedAccountId = accountId;
      this.connectAccount(accountId, baseUrl);
  }

  private evaluatePhase() {
      if (!this.selectedAccountId) {
          this.transitionTo(TradingPhase.INIT);
          return;
      }
      
      const socket = this.connections.get(this.selectedAccountId);
      const wsReady = socket && socket.readyState === WebSocket.OPEN;
      
      const brokerConnected = this.brokerConnectedState.get(this.selectedAccountId);
      const terminalSyncOk = this.terminalSyncedState.get(this.selectedAccountId);
      
      let nextPhase: TradingPhase = this.phase;
      

      if (!wsReady) {
          nextPhase = TradingPhase.CONNECTING_META;
      } else if (wsReady && !brokerConnected) {
          if (this.phase !== TradingPhase.META_CONNECTED) console.log(`[META_CONNECTED]`);
          nextPhase = TradingPhase.META_CONNECTED;
      } else if (wsReady && brokerConnected && !terminalSyncOk) {
          if (this.phase !== TradingPhase.BROKER_CONNECTED && this.phase !== TradingPhase.ACCOUNT_SYNCING) {
              console.log(`[BROKER_CONNECTED]`);
          }
          if (this.phase === TradingPhase.META_CONNECTED || this.phase === TradingPhase.BROKER_CONNECTED) {
              nextPhase = TradingPhase.BROKER_CONNECTED;
          } else {
              if (this.phase !== TradingPhase.ACCOUNT_SYNCING) {
                  this.syncRetryCounter = 0;
                  this.handleSyncRetry();
              }
              nextPhase = TradingPhase.ACCOUNT_SYNCING;
          }
      } else if (brokerConnected && terminalSyncOk) {
          nextPhase = TradingPhase.ACCOUNT_READY;
      }
      
      this.transitionTo(nextPhase);
  }

  private handleSyncRetry() {
    if (this.syncRetryCounter >= this.maxSyncRetries) {
        console.error(`[TERMINAL_SYNC_FAIL] Max retries reached.`);
        return;
    }
    
    setTimeout(() => {
        if (this.phase === TradingPhase.ACCOUNT_SYNCING) {
            this.syncRetryCounter++;
            console.log(`[ACCOUNT_SYNCING] Retrying sync... Attempt ${this.syncRetryCounter}`);
            this.send(this.selectedAccountId!, { 
                type: 'SYNC_STATE', 
                accountId: this.selectedAccountId,
                symbol: this.desiredStream?.symbol,
                timeframe: this.desiredStream?.timeframe
            }, true);
            this.handleSyncRetry();
        }
    }, 10000);
  }

  public subscribeStatus(accountId: string, cb: (status: boolean) => void) {
      if (typeof cb !== 'function') {
          console.error("[ConnectionManager] subscribeStatus called with non-function:", cb);
          return () => {};
      }
      if (!this.statusListeners.has(accountId)) {
          this.statusListeners.set(accountId, new Set());
      }
      this.statusListeners.get(accountId)!.add(cb);
      
      const socket = this.connections.get(accountId);
      cb(socket?.readyState === WebSocket.OPEN);
      
      return () => this.statusListeners.get(accountId)!.delete(cb);
  }

  private notifyStatus(accountId: string, isReady: boolean) {
      if (this.statusListeners.has(accountId)) {
          this.statusListeners.get(accountId)!.forEach(cb => {
            if (typeof cb === 'function') cb(isReady);
            else console.error("[ConnectionManager] Callback is not a function", cb);
          });
      }
      if (accountId === this.selectedAccountId) {
        this.evaluatePhase();
      }
  }

  private async connectAccount(accountId: string, baseUrl: string) {
    this.baseUrls.set(accountId, baseUrl);
    this.initiateWSWithBackoff(accountId, baseUrl);
  }

  private async initiateWSWithBackoff(accountId: string, baseUrl: string) {
    try {
      const token = this.tokens.get(accountId);
      const headers: Record<string, string> = {
          'Content-Type': 'application/json'
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      const res = await fetch(`/api/account/${accountId}/status`, { headers });
      if (res.ok) {
          const data = await res.json();
          if (data.state !== 'DEPLOYED' || data.connectionStatus !== 'CONNECTED') {
              console.warn(`[RECONNECT_GUARD] Account ${accountId} is not active (${data.state}, ${data.connectionStatus}). Cancelling connection loop.`);
              return;
          }
      }
    } catch(e) {
      // If network is down, we might want to still attempt, or wait. We'll proceed to try websocket.
    }

    const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    const socket = new WebSocket(protocol + (typeof window !== 'undefined' ? window.location.host : ''));
        
    socket.onopen = () => {
        console.log(`[CONN] Account ${accountId} Connected.`);
        this.connections.set(accountId, socket);
        this.notifyStatus(accountId, true);
        this.evaluatePhase();
        
        // Ensure synchronization starts immediately upon connection
        this.send(accountId, { type: 'subscribe', accountId, token: this.tokens.get(accountId) }, true);
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'status:update') {
            const isReady = data.status === 'CONNECTED' || data.status === 'READY' || data.status === 'SYNCHRONIZED';
            this.brokerConnectedState.set(accountId, isReady);
            this.notifyStatus(accountId, isReady);
            this.evaluatePhase();
        }

        if (data.type === 'ACCOUNT_READY') {
            this.setAccountSyncComplete(accountId);
        }

        this.listeners.forEach(cb => cb(data));
    };

    socket.onclose = () => {
        this.connections.delete(accountId);
        this.notifyStatus(accountId, false);
        this.evaluatePhase();
        setTimeout(() => this.initiateWSWithBackoff(accountId, baseUrl), 5000); // 5 sec backoff
    };
  }

  public switchMode(accountId: string, mode: 'EA' | 'STRATEGY') {
      this.send(accountId, { type: 'SWITCH_MODE', accountId, mode });
  }

  public send(accountId: string, data: any, bypassPhase: boolean = false) {
    if (!bypassPhase && this.phase !== TradingPhase.STREAMING && this.phase !== TradingPhase.ACCOUNT_READY) {
        console.warn(`[QUEUE_PUSH]${data.type} - current phase is ${this.phase}. Queuing...`);
        this.pendingCommands.push(data);
        return;
    }
    const socket = this.connections.get(accountId);
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
    }
    socket.send(JSON.stringify(data));
  }
}

export const connectionManager = ConnectionManager.getInstance();

