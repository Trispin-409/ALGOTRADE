
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// @ts-ignore
if (import.meta.hot) {
  // @ts-ignore
  import.meta.hot.dispose(() => {
    // HARD STOP any socket reconnect side effects
    // @ts-ignore
    window.__VITE_HMR_DISPOSED__ = true;
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

// Global Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.log('SW registration error:', err);
    });
  });
}

root.render(
  <App />
);
