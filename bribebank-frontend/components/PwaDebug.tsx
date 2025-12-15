import React, { useEffect, useState } from "react";
import { Download, CheckCircle, XCircle, AlertCircle } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export const PwaDebug: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [checks, setChecks] = useState({
    https: false,
    serviceWorker: false,
    manifest: false,
    standalone: false,
    eventFired: false,
  });
  const [swState, setSwState] = useState<string>("checking...");
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    const runChecks = async () => {
      // Check HTTPS
      const isSecure = window.location.protocol === "https:" || window.location.hostname === "localhost";
      
      // Check standalone mode
      const isStandalone = window.matchMedia("(display-mode: standalone)").matches ||
                           (window.navigator as any).standalone ||
                           document.referrer.includes("android-app://");
      
      // Check service worker
      let swReady = false;
      let swStateText = "Not supported";
      if ("serviceWorker" in navigator) {
        try {
          const reg = await navigator.serviceWorker.ready;
          swReady = !!reg.active;
          swStateText = reg.active?.state || "no active worker";
        } catch (e) {
          swStateText = "error: " + (e as Error).message;
        }
      }
      
      // Check manifest
      const manifestLink = document.querySelector('link[rel="manifest"]');
      const hasManifest = !!manifestLink;
      
      setChecks({
        https: isSecure,
        serviceWorker: swReady,
        manifest: hasManifest,
        standalone: isStandalone,
        eventFired: !!deferredPrompt,
      });
      setSwState(swStateText);
    };

    runChecks();

    const handler = (e: Event) => {
      console.log("[PWA Debug] beforeinstallprompt fired!");
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setChecks(prev => ({ ...prev, eventFired: true }));
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, [deferredPrompt]);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      alert("Install prompt not available. Check the requirements above.");
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`[PWA Debug] User choice: ${outcome}`);
    
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  const StatusIcon = ({ status }: { status: boolean }) => {
    return status ? (
      <CheckCircle className="text-green-500" size={20} />
    ) : (
      <XCircle className="text-red-500" size={20} />
    );
  };

  if (!showDebug) {
    return (
      <button
        onClick={() => setShowDebug(true)}
        className="fixed bottom-4 left-4 bg-gray-800 text-white px-4 py-2 rounded-lg shadow-lg text-sm z-50 hover:bg-gray-700"
      >
        PWA Debug
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold">PWA Installation Debug</h3>
            <button
              onClick={() => setShowDebug(false)}
              className="text-white/80 hover:text-white text-2xl"
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <StatusIcon status={checks.https} />
              <div className="flex-1">
                <div className="font-medium">HTTPS</div>
                <div className="text-sm text-gray-600">
                  {window.location.protocol} - {checks.https ? "Secure" : "Required for PWA install"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <StatusIcon status={checks.serviceWorker} />
              <div className="flex-1">
                <div className="font-medium">Service Worker</div>
                <div className="text-sm text-gray-600">{swState}</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <StatusIcon status={checks.manifest} />
              <div className="flex-1">
                <div className="font-medium">Web Manifest</div>
                <div className="text-sm text-gray-600">
                  {checks.manifest ? "Found" : "Not found"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {checks.standalone ? (
                <AlertCircle className="text-yellow-500" size={20} />
              ) : (
                <CheckCircle className="text-green-500" size={20} />
              )}
              <div className="flex-1">
                <div className="font-medium">Standalone Mode</div>
                <div className="text-sm text-gray-600">
                  {checks.standalone ? "Already installed!" : "Not installed (good for testing)"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <StatusIcon status={checks.eventFired} />
              <div className="flex-1">
                <div className="font-medium">beforeinstallprompt Event</div>
                <div className="text-sm text-gray-600">
                  {checks.eventFired ? "Fired - ready to install!" : "Not fired yet"}
                </div>
              </div>
            </div>
          </div>

          {/* Install Requirements */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-blue-900 mb-2">Requirements for Install Prompt:</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Must be served over HTTPS (or localhost)</li>
              <li>• Service worker must be registered</li>
              <li>• Valid web manifest file</li>
              <li>• User must engage with site (click, scroll, etc.)</li>
              <li>• Not already installed</li>
            </ul>
          </div>

          {/* Install Button */}
          {deferredPrompt && (
            <button
              onClick={handleInstall}
              className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
            >
              <Download size={20} />
              Install Now
            </button>
          )}

          {!deferredPrompt && checks.https && checks.serviceWorker && checks.manifest && !checks.standalone && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                <strong>Waiting for install event...</strong>
                <br />
                Try interacting with the page (scroll, click) or wait a few seconds.
                The browser decides when to fire the event.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
