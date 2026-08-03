
import { supabase } from './supabase';

export const formatCurrency = (value: number, currency?: string) => {
  const currencyCode = (currency || 'ZAR').toUpperCase();
  try {
    const valStr = Math.abs(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const sign = (value || 0) < 0 ? '-' : '';
    if (currencyCode === 'ZAR') {
      return `${sign}R${valStr}`;
    }
    if (currencyCode === 'USD') {
      return `${sign}$${valStr}`;
    }
    if (currencyCode === 'GBP') {
      return `${sign}£${valStr}`;
    }
    if (currencyCode === 'EUR') {
      return `${sign}€${valStr}`;
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
    }).format(value || 0);
  } catch (e) {
    return `${currencyCode} ${(value || 0).toLocaleString()}`;
  }
};

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const getVerifiedSession = async () => {
  try {
    let sessionRes = await supabase.auth.getSession();
    if (sessionRes.error) {
      if (sessionRes.error.message?.toLowerCase().includes('refresh token') || sessionRes.error.message?.toLowerCase().includes('invalid')) {
        console.warn("[AUTH] Invalid refresh token in getSession, clearing stale auth session:", sessionRes.error.message);
        try { await supabase.auth.signOut(); } catch (e) {}
        try { localStorage.clear(); } catch (e) {}
      }
      return null;
    }
    let session = sessionRes.data?.session;
    if (!session) return null;
    
    if (session.expires_at && Date.now() / 1000 > session.expires_at - 10) {
      // Token is expiring very soon or is expired. Try to refresh.
      try {
        const refresh = await supabase.auth.refreshSession();
        if (refresh.error || !refresh.data?.session) {
          console.warn("[AUTH] Refresh session failed, clearing stale auth session:", refresh.error?.message);
          try { await supabase.auth.signOut(); } catch (e) {}
          try { localStorage.clear(); } catch (e) {}
          return null;
        }
        session = refresh.data.session;
      } catch (refErr: any) {
        console.warn("[AUTH] Exception during session refresh, clearing stale session:", refErr?.message || refErr);
        try { await supabase.auth.signOut(); } catch (e) {}
        try { localStorage.clear(); } catch (e) {}
        return null;
      }
    }
    
    return session;
  } catch (err: any) {
    console.error("[AUTH] Error in getVerifiedSession:", err);
    if (err?.message?.toLowerCase().includes('refresh token') || err?.message?.toLowerCase().includes('invalid')) {
      try { await supabase.auth.signOut(); } catch (e) {}
      try { localStorage.clear(); } catch (e) {}
    }
    return null;
  }
};

export const generateFingerprint = () => {
  return navigator.userAgent + '||' + window.screen.width + 'x' + window.screen.height + '||' + navigator.language;
};

export const getApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    const isCapacitor = (window as any).Capacitor?.isNative;
    const isStandardWeb = (window.location.protocol === 'http:' || window.location.protocol === 'https:') && 
      !window.location.hostname.match(/^(localhost|127\.0\.0\.1)$/);
    if (isCapacitor && !isStandardWeb) {
      return import.meta.env.VITE_API_URL || 'https://algotrade-tristech.com';
    }
  }
  return '';
};

export const safeFetch = async (url: string, options?: RequestInit) => {
  // Automatically inject fresh token if Authorization header is missing or placeholder
  let finalOptions = { ...options };
  if (finalOptions.headers) {
    finalOptions.headers = { ...finalOptions.headers };
  } else {
    finalOptions.headers = {};
  }
  
  const headers = finalOptions.headers as Record<string, string>;
  
  // Attach device fingerprint for account security tracking
  headers['X-Device-Fingerprint'] = generateFingerprint();
  
  // Clean Content-Type/body for GET requests or requests without a body
  const method = (finalOptions.method || 'GET').toUpperCase();
  if (method === 'GET' || !finalOptions.body) {
    delete headers['Content-Type'];
    delete headers['content-type'];
    delete (finalOptions as any).body;
  }

  // Always inject fresh auth for internal API routes
  if (url.startsWith('/api/') || !headers['Authorization'] || headers['Authorization'].includes('undefined')) {
    try {
      const session = await getVerifiedSession();
      if (session) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
    } catch (e) {
      console.warn("[AUTH] safeFetch session resolution warning:", e);
    }
  }

  const fetchUrl = url.startsWith('/') ? `${getApiBaseUrl()}${url}` : url;
  let res: Response;
  try {
    res = await fetch(fetchUrl, finalOptions);
  } catch (netErr: any) {
    console.warn(`[NETWORK] Fetch to ${fetchUrl} failed:`, netErr?.message || netErr);
    throw new Error(`Connection Error: Unable to reach server (${netErr?.message || 'Failed to fetch'}). Please check your network connection.`);
  }

  const text = await res.text();
  
  if (!res.ok) {
    let errorMsg = `HTTP ${res.status}`;
    try {
      const errorJson = JSON.parse(text);
      if (errorJson.error) errorMsg += `: ${errorJson.error}`;
    } catch {
      errorMsg += `: ${text.slice(0, 50)}${text.length > 50 ? '...' : ''}`;
    }
    
    // Auto-logout on token invalidation or poisoned giant token (HTTP 413/431)
    if (res.status === 413 || res.status === 431 || (res.status === 401 && (errorMsg.includes('Invalid token') || errorMsg.includes('Unauthorized') || errorMsg.includes('No token') || errorMsg.includes('Refresh Token')))) {
       try { 
         await supabase.auth.signOut(); 
         localStorage.clear();
       } catch(e) {}
       window.location.href = '/';
    }
    
    throw new Error(errorMsg);
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    if (text.trim().toLowerCase().startsWith('<!doctype') || text.trim().toLowerCase().startsWith('<html')) {
      // Return a softer error without destroying session to prevent brute-force logout loops
      throw new Error(`Connection Error: Server returned HTML page instead of API data. The proxy might require re-authentication.`);
    }
    throw new Error(`Invalid JSON response (HTTP ${res.status}) on ${url}: ${text.slice(0, 50)}`);
  }
};
