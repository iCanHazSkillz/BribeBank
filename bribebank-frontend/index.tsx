import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import "./index.css";

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then((registration) => {
        console.log(
          "[SW] registered with scope:",
          registration.scope
        );
      })
      .catch((err) => {
        console.error("[SW] registration failed:", err);
      });
    
    // Check if opened from notification (new window case)
    const params = new URLSearchParams(window.location.search);
    if (params.get('_from_notification')) {
      // Clean up the URL
      params.delete('_from_notification');
      const cleanUrl = params.toString() 
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
    }
  });
  
  // Listen for messages from service worker
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data && event.data.type === "SET_NOTIFICATION_FLAG") {
      console.log("[SW] Setting notification flag and navigating to:", event.data.url);
      // Set flag in sessionStorage
      sessionStorage.setItem('_from_notification', event.data.url);
      // Force immediate reload to target URL
      window.location.href = event.data.url;
    }
  });
  
  // Check on visibility change if we need to reload from notification
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const notificationUrl = sessionStorage.getItem('_from_notification');
      if (notificationUrl) {
        console.log('[SW] Reloading from notification:', notificationUrl);
        sessionStorage.removeItem('_from_notification');
        window.location.href = notificationUrl;
      }
    }
  });
}
