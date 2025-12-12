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
  });
  
  // Listen for messages from service worker
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data && event.data.type === "NAVIGATE_AND_RELOAD") {
      console.log("[SW] Navigating and reloading:", event.data.url);
      // Change location which triggers a full page reload
      window.location.href = event.data.url;
    }
  });
}
