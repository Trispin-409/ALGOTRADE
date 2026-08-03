import { useState, useEffect, useCallback, useRef } from 'react';
import { useStore, PushNotification } from '../store';
import { playHighImpactAlertSound } from '../utils/audioAlert';

const HIGH_IMPACT_KEYWORDS = [
  'CPI', 'NFP', 'NON-FARM', 'FOMC', 'FED RATE', 'INTEREST RATE', 'RATE CUT',
  'RATE HIKE', 'INFLATION', 'JEROME POWELL', 'GDP', 'UNEMPLOYMENT', 'WAR',
  'CRUDE OIL', 'OPEC', 'ECB RATE', 'BOE RATE', 'BANK OF JAPAN', 'HIGH-IMPACT',
  'HIGH IMPACT', 'BREAKING', 'SURGE', 'CRASH', 'EMERGENCY', 'LIQUIDITY', 'TARIFFS'
];

function isSymbolMatch(symbol: string, text: string): boolean {
  if (!symbol || !text) return false;
  const upperText = text.toUpperCase();
  const cleanSym = symbol.toUpperCase().replace(/[^A-Z]/g, '');

  if (cleanSym.includes('XAU') || cleanSym.includes('GOLD')) {
    if (upperText.includes('GOLD') || upperText.includes('XAU') || upperText.includes('FED') || upperText.includes('INFLATION') || upperText.includes('USD')) {
      return true;
    }
  }

  if (cleanSym.includes('BTC') || cleanSym.includes('CRYPTO')) {
    if (upperText.includes('BTC') || upperText.includes('BITCOIN') || upperText.includes('CRYPTO') || upperText.includes('FED') || upperText.includes('SEC')) {
      return true;
    }
  }

  const base = cleanSym.substring(0, 3);
  const quote = cleanSym.substring(3, 6);

  if (base && upperText.includes(base)) return true;
  if (quote && upperText.includes(quote)) return true;
  if (upperText.includes('FED') || upperText.includes('USD') || upperText.includes('MACRO')) return true;

  return false;
}

export function useNewsNotificationMonitor(selectedSymbol: string, isDNDActive: boolean = false) {
  const pushNotificationsEnabled = useStore(state => state.pushNotificationsEnabled);
  const audioAlertsEnabled = useStore(state => state.audioAlertsEnabled);
  const addPushNotification = useStore(state => state.addPushNotification);

  const [activeToastAlert, setActiveToastAlert] = useState<PushNotification | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });

  const notifiedIdsRef = useRef<Set<string>>(new Set());

  // Load notified IDs from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('notified_news_ids');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          notifiedIdsRef.current = new Set(parsed.slice(-200));
        }
      }
    } catch (e) {}
  }, []);

  const saveNotifiedIds = useCallback(() => {
    try {
      const arr = Array.from(notifiedIdsRef.current).slice(-200);
      localStorage.setItem('notified_news_ids', JSON.stringify(arr));
    } catch (e) {}
  }, []);

  // Sync notification permission
  const requestPermission = useCallback(async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        setNotificationPermission(perm);
        return perm;
      } catch (err) {
        console.warn("Permission request failed", err);
      }
    }
    return 'denied' as NotificationPermission;
  }, []);

  // Helper to dispatch a high impact push alert
  const dispatchHighImpactAlert = useCallback((item: {
    title: string;
    body: string;
    symbol: string;
    headline?: string;
    source?: string;
    url?: string;
    category?: string;
    impactScore?: number;
    newsId?: string;
  }) => {
    const idKey = item.newsId || item.headline || (item.title + '_' + item.symbol);
    if (notifiedIdsRef.current.has(idKey)) return;

    notifiedIdsRef.current.add(idKey);
    saveNotifiedIds();

    const notifObj: Omit<PushNotification, 'id' | 'timestamp' | 'read'> = {
      title: item.title,
      body: item.body,
      symbol: item.symbol,
      impact: 'HIGH',
      url: item.url,
      headline: item.headline || item.title,
      source: item.source || 'Market Intelligence',
      category: item.category || 'Forex/Macro',
      impactScore: item.impactScore || 85,
    };

    // 1. Add to Zustand store
    addPushNotification(notifObj);

    // 2. Set active in-app toast
    const fullNotifObj: PushNotification = {
      ...notifObj,
      id: 'toast_' + Date.now(),
      timestamp: Date.now(),
      read: false,
    };
    setActiveToastAlert(fullNotifObj);

    // 3. Play audio alert if enabled and not DND
    if (audioAlertsEnabled && !isDNDActive) {
      playHighImpactAlertSound();
    }

    // 4. Browser Native Push Notification
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted' &&
      pushNotificationsEnabled &&
      !isDNDActive
    ) {
      try {
        const bNotif = new Notification(`🚨 ${item.symbol}: ${item.title}`, {
          body: item.body,
          icon: '/bot-logo.png',
          tag: `news-${idKey}`,
          requireInteraction: true,
        });

        bNotif.onclick = () => {
          window.focus();
          if (item.url) window.open(item.url, '_blank');
          bNotif.close();
        };
      } catch (err) {
        console.warn("[PUSH] Native Notification construction failed:", err);
      }
    }
  }, [addPushNotification, audioAlertsEnabled, isDNDActive, pushNotificationsEnabled, saveNotifiedIds]);

  // Check Finnhub breaking news for selected symbol
  const checkFinnhubNews = useCallback(async (sym: string) => {
    if (!sym) return;
    const category = sym.includes('BTC') || sym.includes('CRYPTO') ? 'crypto' : 'forex';
    try {
      const res = await fetch(`https://finnhub.io/api/v1/news?category=${category}&token=d82220hr01qrojfdmpn0d82220hr01qrojfdmpng`);
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data)) return;

      for (const item of data.slice(0, 10)) {
        const headline = item.headline || '';
        const summary = item.summary || '';
        const fullText = (headline + ' ' + summary).toUpperCase();

        const matchesKeyword = HIGH_IMPACT_KEYWORDS.some(kw => fullText.includes(kw));
        const matchesSym = isSymbolMatch(sym, fullText);

        if (matchesKeyword && matchesSym) {
          const newsId = `fh_${item.id || item.datetime}_${sym}`;
          dispatchHighImpactAlert({
            title: `High-Impact Breakout News for ${sym}`,
            body: headline,
            symbol: sym,
            headline,
            source: item.source || 'Finnhub Wire',
            url: item.url,
            category: category.toUpperCase(),
            impactScore: 88,
            newsId,
          });
          break; // alert top matching breaking news
        }
      }
    } catch (err) {
      console.warn("Check Finnhub news monitor failed:", err);
    }
  }, [dispatchHighImpactAlert]);

  // Check Google Grounded Search sentiment for selected symbol
  const checkGoogleSearchNews = useCallback(async (sym: string) => {
    if (!sym) return;
    try {
      const res = await fetch(`/api/news/search-sentiment?symbol=${encodeURIComponent(sym)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data && (data.sentiment === 'BULLISH' || data.sentiment === 'BEARISH') && Math.abs(data.impactScore || 0) >= 45) {
        const newsId = `gg_${sym}_${Math.round(data.sentimentScore || 0)}_${data.explanation?.substring(0, 30)}`;
        dispatchHighImpactAlert({
          title: `Grounded Macro Volatility Alert: ${data.sentiment}`,
          body: data.explanation || `Extreme ${data.sentiment} sentiment detected for ${sym} today.`,
          symbol: sym,
          headline: data.explanation || `Macro sentiment for ${sym} is ${data.sentiment}`,
          source: 'Vertex AI Grounding Radar',
          category: 'Macro Intelligence',
          impactScore: Math.abs(data.impactScore || 85),
          newsId,
        });
      }
    } catch (err) {
      console.warn("Check Google Search news monitor failed:", err);
    }
  }, [dispatchHighImpactAlert]);

  // Background monitor poller
  useEffect(() => {
    if (!selectedSymbol) return;

    // Run immediate check
    checkFinnhubNews(selectedSymbol);

    // Periodically check every 40 seconds
    const interval = setInterval(() => {
      checkFinnhubNews(selectedSymbol);
      checkGoogleSearchNews(selectedSymbol);
    }, 40000);

    return () => clearInterval(interval);
  }, [selectedSymbol, checkFinnhubNews, checkGoogleSearchNews]);

  // Test Trigger Function for User
  const triggerTestNotification = useCallback((symbolOverride?: string) => {
    const sym = symbolOverride || selectedSymbol || 'XAUUSDm';
    const sampleNews = [
      {
        title: `⚡ TEST: High-Impact Fed Interest Rate Surge`,
        body: `Federal Reserve announces emergency rate policy update affecting ${sym} volatility.`,
        symbol: sym,
        headline: `Emergency FOMC Announcement: High-Impact volatility expected on ${sym}`,
        source: 'Vertex AI Real-Time Alert Engine',
        url: 'https://www.federalreserve.gov',
        category: 'Central Bank',
        impactScore: 95,
        newsId: `test_${Date.now()}`,
      },
      {
        title: `🚨 TEST: Breaking Non-Farm Payrolls (NFP)`,
        body: `US Jobs data surges past consensus. Heavy USD order flow detected for ${sym}.`,
        symbol: sym,
        headline: `NFP Release: Non-Farm Employment changes drive massive volume across ${sym}`,
        source: 'Finnhub Live Wire',
        category: 'Macro Economic',
        impactScore: 92,
        newsId: `test_nfp_${Date.now()}`,
      }
    ];

    const pick = sampleNews[Math.floor(Math.random() * sampleNews.length)];
    dispatchHighImpactAlert(pick);
  }, [selectedSymbol, dispatchHighImpactAlert]);

  const dismissToast = useCallback(() => {
    setActiveToastAlert(null);
  }, []);

  return {
    notificationPermission,
    requestPermission,
    activeToastAlert,
    dismissToast,
    triggerTestNotification,
  };
}
