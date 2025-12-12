import React, { useState, useEffect } from "react";
import { User, UserRole } from "./types";
import { storageService } from "./services/storageService";
import { LoginView } from "./components/LoginView";
import { WalletView } from "./components/WalletView";
import { AdminView } from "./components/AdminView";
import { LogOut } from "lucide-react";

type View = "wallet" | "admin" | "login";
type WalletTab = "wallet" | "tasks" | "history";

const isWalletTab = (v: string | null): v is WalletTab =>
  v === "wallet" || v === "tasks" || v === "history";

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [view, setView] = useState<View>("login");

  // allow AdminView to open a specific tab via deep-link
  const [initialAdminTab, setInitialAdminTab] = useState<string | undefined>(
    undefined
  );

  // NEW: allow WalletView to open a specific tab via deep-link
  const [initialWalletTab, setInitialWalletTab] = useState<
    WalletTab | undefined
  >(undefined);

  const readDeepLink = () => {
    const params = new URLSearchParams(window.location.search);

    const desiredView = params.get("view"); // "admin" | "wallet" | null
    const adminTab = params.get("adminTab"); // e.g. "approvals"
    const rawWalletTab = params.get("walletTab") || params.get("tab");
    const walletTab = isWalletTab(rawWalletTab) ? rawWalletTab : undefined;

    return { desiredView, adminTab, walletTab };
  };

  const clearDeepLink = () => {
    const url = new URL(window.location.href);

    // remove only the params we own
    url.searchParams.delete("view");
    url.searchParams.delete("adminTab");
    url.searchParams.delete("walletTab");
    url.searchParams.delete("tab");
    url.searchParams.delete("_t"); // Remove timestamp parameter

    // if nothing left, remove the "?" cleanly
    const next =
      url.searchParams.toString().length > 0
        ? `${url.pathname}?${url.searchParams.toString()}${url.hash}`
        : `${url.pathname}${url.hash}`;

    window.history.replaceState({}, "", next);
  };

  const applyDeepLinkForUser = (user: User) => {
    const { desiredView, adminTab, walletTab } = readDeepLink();

    // Default behaviour if no deep-link
    let nextView: View =
      user.role === UserRole.ADMIN ? "admin" : "wallet";

    let nextAdminTab: string | undefined = undefined;
    let nextWalletTab: WalletTab | undefined = undefined;

    if (desiredView === "admin") {
      if (user.role === UserRole.ADMIN) {
        nextView = "admin";
        nextAdminTab = adminTab ?? undefined;
      } else {
        // non-admin user can't open admin view
        nextView = "wallet";
        nextWalletTab = walletTab;
      }
    } else if (desiredView === "wallet") {
      nextView = "wallet";
      nextWalletTab = walletTab;
    } else {
      // no explicit view param
      if (user.role === UserRole.ADMIN) {
        // admin default stays admin unless a walletTab is present
        // (your call; this keeps your previous behaviour)
        nextView = "admin";
        nextAdminTab = adminTab ?? undefined;
      } else {
        nextView = "wallet";
      }

      // still respect wallet tab if present
      if (walletTab) {
        nextWalletTab = walletTab;
        nextView = "wallet";
      }
    }

    setView(nextView);
    setInitialAdminTab(nextAdminTab);
    setInitialWalletTab(nextWalletTab);

    // Only clear once we've consumed something
    if (desiredView || adminTab || walletTab) {
      clearDeepLink();
    }
  };

  useEffect(() => {
    const init = async () => {
      const stored = storageService.getCurrentUser();

      // If no session exists, leave deep-link intact
      // so it can be applied after login.
      if (!stored) {
        setView("login");
        return;
      }

      try {
        const freshUser = await storageService.refreshSession();
        setCurrentUser(freshUser);
        applyDeepLinkForUser(freshUser);
      } catch {
        storageService.logout();
        setCurrentUser(null);
        setView("login");
      }
    };

    void init();
  }, []);

  useEffect(() => {
    const refreshCurrentUser = async () => {
      if (!currentUser) return;
      
      try {
        const freshUser = await storageService.refreshSession();
        setCurrentUser(freshUser);
      } catch (err) {
        console.error("Failed to refresh user session", err);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshCurrentUser();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [currentUser?.id]);

  const handleLogin = async (user: User) => {
    setCurrentUser(user);

    // Apply deep-link post-login too
    applyDeepLinkForUser(user);

    await storageService.registerPushNotifications();
  };

  const handleLogout = () => {
    storageService.logout();
    setCurrentUser(null);
    setView("login");
    setInitialAdminTab(undefined);
    setInitialWalletTab(undefined);
  };

  const handleUserUpdate = async () => {
    try {
      const freshUser = await storageService.refreshSession();
      setCurrentUser(freshUser);
    } catch (err) {
      console.error("Failed to refresh user after update", err);
    }
  };

  if (!currentUser || view === "login") {
    return <LoginView onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen max-w-md mx-auto bg-gray-50 shadow-2xl overflow-hidden relative border-x border-gray-200">
      {/* Content Area */}
      <main className="h-full overflow-y-auto no-scrollbar">
        {view === "admin" && currentUser.role === UserRole.ADMIN && (
          <AdminView 
            currentUser={currentUser} 
            initialTab={initialAdminTab}
            onUserUpdate={handleUserUpdate}
          />
        )}

        {view === "wallet" && (
          <WalletView
            currentUser={currentUser}
            initialTab={initialWalletTab}
          />
        )}
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 max-w-md w-full bg-white border-t border-gray-200 flex justify-around items-center py-3 pb-5 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        {currentUser.role === UserRole.ADMIN && (
          <>
            <button
              onClick={() => setView("wallet")}
              className={`flex flex-col items-center space-y-1 transition-colors ${
                view === "wallet" ? "text-indigo-600" : "text-gray-400"
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="20" height="14" x="2" y="5" rx="2" />
                <line x1="2" x2="22" y1="10" y2="10" />
              </svg>
              <span className="text-xs font-medium">My Wallet</span>
            </button>
            <button
              onClick={() => setView("admin")}
              className={`flex flex-col items-center space-y-1 transition-colors ${
                view === "admin" ? "text-indigo-600" : "text-gray-400"
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                <path d="m9 12 2 2 4-4" />
              </svg>
              <span className="text-xs font-medium">Admin</span>
            </button>
          </>
        )}

        <button
          onClick={handleLogout}
          className="flex flex-col items-center space-y-1 text-gray-400 hover:text-red-500 transition-colors"
        >
          <LogOut size={24} />
          <span className="text-xs font-medium">Log Out</span>
        </button>
      </nav>
    </div>
  );
};

export default App;
