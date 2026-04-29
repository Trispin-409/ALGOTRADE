
export const formatCurrency = (value: number, currency?: string) => {
  const currencyCode = (currency || 'ZAR').toUpperCase();
  try {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: currencyCode,
    }).format(value || 0);
  } catch (e) {
    // Fallback if currency code is invalid or formatting fails
    return `${currencyCode} ${(value || 0).toLocaleString()}`;
  }
};

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

let restQueue: Promise<any> = Promise.resolve();

export const safeFetch = async (url: string, options?: RequestInit) => {
  // Global Request Circuit Breaker: Total Serialization of all REST traffic
  const result = restQueue.then(async () => {
    const res = await fetch(url, options);
    const text = await res.text();
    
    if (!res.ok) {
      let errorMsg = `HTTP ${res.status}`;
      try {
        const errorJson = JSON.parse(text);
        if (errorJson.error) errorMsg += `: ${errorJson.error}`;
      } catch {
        errorMsg += `: ${text.slice(0, 50)}${text.length > 50 ? '...' : ''}`;
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
      if (text.trim().startsWith('<!doctype') || text.trim().startsWith('<html')) {
        throw new Error(`Unexpected HTML response (likely a server crash or routing error).`);
      }
      throw new Error(`Invalid JSON response: ${text.slice(0, 50)}`);
    }
  });

  // Chain the next request to the tail of the queue
  restQueue = result.catch(() => {});
  
  return result;
};
