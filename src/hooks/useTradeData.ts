import { useState, useEffect } from 'react';
import { safeFetch } from '../lib/utils';
import { useStore } from '../store';

export interface Position {
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  volume: number;
  openPrice: number;
  currentPrice: number;
  profit: number;
  stopLoss?: number;
  takeProfit?: number;
  comment?: string;
  time?: string;
}

export interface HistoryOrder {
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  volume: number;
  openPrice: number;
  closePrice?: number;
  profit: number;
  time?: string;
  doneTime?: string;
}

export function useTradeData(accountId: string | null) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [history, setHistory] = useState<HistoryOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accountId) {
      setPositions([]);
      setHistory([]);
      return;
    }

    let isMounted = true;

    const fetchData = async () => {
      if (!isMounted) return;
      setLoading(true);
      setError(null);

      try {
        const userEmail = useStore.getState().currentUserEmail || '';
        
        // Append email as an extra secure RLS identifier check parameter
        const emailQuery = userEmail ? `&u=${encodeURIComponent(userEmail)}` : '';

        // Fetch user-specific, account-scoped positions and history
        const [positionsData, historyData] = await Promise.all([
          safeFetch(`/api/account/${accountId}/positions?scope=private${emailQuery}`),
          safeFetch(`/api/account/${accountId}/history?limit=100&scope=private${emailQuery}`)
        ]);

        if (isMounted) {
          setPositions(Array.isArray(positionsData) ? positionsData : []);
          setHistory(Array.isArray(historyData) ? historyData : []);
        }
      } catch (err: any) {
        if (isMounted) {
          console.error(`[useTradeData] Error fetching trade data for account ${accountId}:`, err);
          setError(err.message || 'Failed to fetch secure trade data');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    // Poll every 10 seconds for clean data-scoped updates
    const interval = setInterval(fetchData, 10000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [accountId]);

  return {
    positions,
    history,
    loading,
    error
  };
}
