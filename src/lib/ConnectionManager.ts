
import { safeFetch, delay } from './utils';

export const TradingPhase = {
  INIT: 'INIT',
  OFFLINE: 'OFFLINE',
  CONNECTING: 'CONNECTING',
  SYNCING: 'SYNCING',
  READY: 'READY'
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
  private statusListeners: Map<string, Set<(status: boolean) => void>> = new Map();
  private registries: Map<string, any> = new Map();
  private retryCount: Map<string, number> = new Map();
  private listeners: Set<(data: any) => void> = new Set();
  private phaseListeners: Set<(phase: TradingPhase) => void> = new Set();
  
  private selectedAccountId: string | null = null;
  private phase: TradingPhase = TradingPhase.INIT;
  
  // State Locks
  public initialized: boolean = false;
  private static ACTIVE_LIFECYCLES: Set<string> = new Set();
  private static GLOBAL_EXECUTION_LOCKS: Map<string, Promise<any>> = new Map();
  
  private restHydrated: Map<string, boolean> = new Map();
  private initLocks: Set<string> = new Set();
  private syncLocks: Set<string> = new Set();
  private streamRegistry: Set<string> = new Set();
  private streamFailures: Map<string, number> = new Map();
  private desiredStream: { symbol: string, timeframe: string } | null = null;
  private activeStreamKey: string | null = null;

  private constructor() {}

  public setStreamIntent(accountId: string, symbol: string, timeframe: string) {
      if (!accountId || !symbol || !timeframe) return;
      
      const newKey = `${accountId}:${symbol}:${timeframe}`;
      if (this.activeStreamKey === newKey) return; // No change in intent

      // Unsubscribe from old stream if switching
      if (this.activeStreamKey && this.desiredStream) {
          const oldSymbol = this.desiredStream.symbol;
          const oldTimeframe = this.desiredStream.timeframe;
          console.log(`[STREAM_AUTHORITY] Switching stream: Unsubscribing ${oldSymbol} (${oldTimeframe}) for ${accountId}`);
          this.send(accountId, { 
              type: 'STREAM_UNSUBSCRIBE', 
              accountId, 
              symbol: oldSymbol, 
              timeframe: oldTimeframe 
          }, true);
      }

      this.desiredStream = { symbol, timeframe };
      this.activeStreamKey = newKey;
      console.log(`[STREAM_AUTHORITY] Intent set: ${symbol} (${timeframe}) for ${accountId}`);
      
      this.orchestrateStream(accountId, symbol, timeframe, (m) => console.log(m))
          .catch(err => console.error(`[STREAM_AUTHORITY] Automated engagement failed:`, err));
  }

  // Refactored Stream Entry Point without deadlocks
  private async orchestrateStream(accountId: string, symbol: string, timeframe: string, addLog: (msg: string) => void) {
      const streamKey = `${accountId}:${symbol}:${timeframe}`;

      try {
          // 2. State Prep
          const isAlreadyHydrated = this.isRestHydrated(accountId);
          
          if (!isAlreadyHydrated) {
              addLog(`STREAM_ENGINE: Engaging MetaTrader SDK stream for ${symbol} (${timeframe})...`);
              this.setRestHydrated(accountId, true);
          }

          // 3. EXECUTE: The ONLY place in the frontend allowed to initiate streams
          await delay(800); // Throttling to stay under 500 cpu credits/s
          this.send(accountId, { 
              type: 'STREAM_SUBSCRIBE', 
              accountId, 
              symbol, 
              timeframe 
          }, true);

          // 4. Registry Update
          this.streamRegistry.add(streamKey);
          
          // 6. BRIDGE: Set session subscription on the socket
          this.send(accountId, { type: 'subscribe', accountId }, true);

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
          // Send unsubscribe command
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
      if (this.syncLocks.has(accountId)) return;
      this.syncLocks.add(accountId);
      console.log(`[LIFECYCLE] Account ${accountId} Sync Confirmed ✅`);
      this.evaluatePhase();
  }

  private isAccountSynced(accountId: string): boolean {
      return this.syncLocks.has(accountId);
  }

  public get currentPhase(): TradingPhase {
    return this.phase;
  }

  public get isTradingReady(): boolean {
      return this.phase === TradingPhase.READY;
  }

  public isRestHydrated(accountId: string): boolean {
      return this.restHydrated.get(accountId) || false;
  }

  public setRestHydrated(accountId: string, hydrated: boolean) {
      if (this.restHydrated.get(accountId) === hydrated) return;
      this.restHydrated.set(accountId, hydrated);
      this.evaluatePhase();
  }

  // Unified Entry Point
  public bootOnce(accountId: string, baseUrl: string) {
      if (!baseUrl || baseUrl === 'undefined') {
          throw new Error(`[CRITICAL] MetaApi base URL missing for ${accountId}. Boot aborted.`);
      }

      if (ConnectionManager.ACTIVE_LIFECYCLES.has(accountId)) {
          console.log(`[LIFECYCLE] Lifecycle already active for ${accountId}. Ignoring boot command.`);
          return;
      }
      ConnectionManager.ACTIVE_LIFECYCLES.add(accountId);
      
      console.log(`[LIFECYCLE] 🧱 HARD LOCK: Booting Global Lifecycle for ${accountId}...`);
      this.setAccount(accountId);
      this.connectAccount(accountId, baseUrl);
  }

  private setAccount(accountId: string) {
      if (this.selectedAccountId === accountId) return;
      this.selectedAccountId = accountId;
      this.evaluatePhase();
  }

  public getSelectedAccountId(): string | null {
    return this.selectedAccountId;
  }

  private evaluatePhase() {
      const oldPhase = this.phase;
      if (!this.selectedAccountId) {
          this.phase = TradingPhase.INIT;
      } else {
          const socket = this.connections.get(this.selectedAccountId);
          const wsReady = socket && socket.readyState === WebSocket.OPEN;

          if (!wsReady) {
              // If we already tried but are disconnected, mark as OFFLINE
              if (this.retryCount.get(this.selectedAccountId) || 0 > 0) {
                  this.phase = TradingPhase.OFFLINE;
              } else {
                  this.phase = TradingPhase.CONNECTING;
              }
          } else if (!this.isAccountSynced(this.selectedAccountId)) {
              this.phase = TradingPhase.SYNCING;
          } else if (!this.isRestHydrated(this.selectedAccountId)) {
              // Note: We might stay in SYNCING until REST hydration is done if desired
              this.phase = TradingPhase.SYNCING; 
          } else {
              this.phase = TradingPhase.READY;
          }
      }

      if (oldPhase !== this.phase) {
          console.log(`[LIFECYCLE] Phase Transition: ${oldPhase} -> ${this.phase} for ${this.selectedAccountId}`);
          this.phaseListeners.forEach(cb => cb(this.phase));
      }
  }

  public subscribePhase(cb: (phase: TradingPhase) => void) {
      if (typeof cb !== 'function') return () => {};
      this.phaseListeners.add(cb);
      cb(this.phase);
      return () => this.phaseListeners.delete(cb);
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

  public subscribe(cb: (data: any) => void) {
      if (typeof cb !== 'function') {
        console.error("[ConnectionManager] subscribe called with non-function:", cb);
        return () => {};
      }
      this.listeners.add(cb);
      return () => this.listeners.delete(cb);
  }

  public static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  private async connectAccount(accountId: string, baseUrl: string) {
    if (!baseUrl || baseUrl === 'undefined') {
        throw new Error("MetaApi base URL is undefined. Critical configuration missing.");
    }
    
    this.initiateWSWithBackoff(accountId, baseUrl);
  }

  private initiateWSWithBackoff(accountId: string, baseUrl: string) {
    const maxRetries = 10;
    
    // Check if we run in browser
    if (typeof window === 'undefined') return;

    if (document.readyState === 'loading') {
       document.addEventListener('DOMContentLoaded', () => this.initiateWSWithBackoff(accountId, baseUrl));
       return;
    }

    const currentAttempt = this.retryCount.get(accountId) || 0;
    const delay = currentAttempt === 0 ? 0 : 1000;
    
    const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';

    setTimeout(() => {
        const socket = new WebSocket(protocol + window.location.host);
        
        let pingInterval: any = null;

        socket.onopen = () => {
            console.log(`[CONN] Account ${accountId} Connected.`);
            this.connections.set(accountId, socket);
            this.retryCount.set(accountId, 0); // Stop retry chain after success
            this.notifyStatus(accountId, true);
            
            // Set up WebSocket heartbeat to prevent stale timeouts
            pingInterval = setInterval(() => {
              if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: 'PING' }));
              }
            }, 5000); // 5s ping
            
            // On reconnection, re-assert stream intent if we had one
            socket.send(JSON.stringify({ type: 'SYNC_STATE', accountId }));

            if (this.desiredStream) {
                console.log(`[STREAM_AUTHORITY] Re-asserting stream intent after reconnection for ${accountId}`);
                const { symbol, timeframe } = this.desiredStream;
                this.activeStreamKey = null; // Reset so intent fires
                this.setStreamIntent(accountId, symbol, timeframe);
            }
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                // Handle System Status Updates
                if (data.type === 'status:update') {
                  const isReady = data.status === 'CONNECTED';
                  this.notifyStatus(accountId, isReady);
                }

                if (data.type === 'ACCOUNT_READY') {
                    console.log(`[LIFECYCLE] RECEIVED ACCOUNT_READY for ${accountId} - Confirming synchronization...`);
                    this.setAccountSyncComplete(accountId);
                }

                this.listeners.forEach(cb => cb(data));
            } catch (e) {
                console.error("[CONN] Failed to parse message", e);
            }
        };

        socket.onclose = () => {
            if (pingInterval) clearInterval(pingInterval);
            console.log(`[CONN] Account ${accountId} Disconnected. Reconnecting...`);
            this.connections.delete(accountId);
            this.notifyStatus(accountId, false);

            setTimeout(() => {
                this.initiateWSWithBackoff(accountId, baseUrl);
            }, 2000);
        };

        socket.onerror = () => {
           socket.close();
        };
    }, delay);
  }

  public switchMode(accountId: string, mode: 'EA' | 'STRATEGY') {
      this.send(accountId, { type: 'SWITCH_MODE', accountId, mode });
  }

  public send(accountId: string, data: any, bypassPhase: boolean = false) {
    if (!bypassPhase && this.phase !== TradingPhase.READY) {
        console.warn(`[LIFECYCLE_GUARD] Blocking ${data.type} send - current phase is ${this.phase} (EXPECTED: READY)`);
        return;
    }
    const socket = this.connections.get(accountId);
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.warn(`[LIFECYCLE_GUARD] Socket not ready for ${accountId}`);
        return;
    }
    socket.send(JSON.stringify(data));
  }
}

export const connectionManager = ConnectionManager.getInstance();

