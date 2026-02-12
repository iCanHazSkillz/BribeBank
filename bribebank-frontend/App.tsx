import React, { useState, useEffect } from "react";
import { User, UserRole, BountyStatus, AssignedBounty, AssignedPrize, PrizeStatus } from "./types";
import { storageService } from "./services/storageService";
import { LoginView } from "./components/LoginView";
import { WalletView } from "./components/WalletView";
import { AdminView } from "./components/AdminView";
import { PwaInstallPrompt } from "./components/PwaInstallPrompt";
import { useTheme } from "./contexts/ThemeContext";
import { LogOut, Wallet, Shield, ChevronDown, Bell, Sun, Moon } from "lucide-react";
import { SseEvent } from "./types/sseEvents";
import { API_BASE } from "./config";

type View = "wallet" | "admin" | "login";
type WalletTab = "wallet" | "tasks" | "store" | "history";

const isWalletTab = (v: string | null): v is WalletTab =>
  v === "wallet" || v === "tasks" || v === "store" || v === "history";

const App: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [view, setView] = useState<View>("login");
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [walletBadgeCount, setWalletBadgeCount] = useState(0);
  const [adminBadgeCount, setAdminBadgeCount] = useState(0);

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

    // Check for service worker updates on load
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((registration) => {
        if (registration) {
          // Check for updates immediately
          registration.update();
          
          // Listen for new service worker being installed/waiting
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // There's a new service worker waiting to activate
                  setUpdateAvailable(true);
                }
              });
            }
          });

          // Also check if there's already a waiting service worker
          if (registration.waiting) {
            setUpdateAvailable(true);
          }
        }
      });
    }
  }, []);

  const fetchBadgeCounts = async () => {
    if (!currentUser) return;

    try {
      const familyId = currentUser.familyId;
      
      // Fetch bounty assignments for wallet badge (child tasks)
      const bountyAssignments = await storageService.getBountyAssignments(familyId);
      const myActiveBounties = bountyAssignments.filter(
        b => b.userId === currentUser.id && 
        (b.status === BountyStatus.OFFERED || b.status === BountyStatus.DENIED)
      );
      setWalletBadgeCount(myActiveBounties.length);

      // Fetch pending approvals for admin badge (parent approvals)
      if (currentUser.role === UserRole.ADMIN) {
        const [assignments, allBounties] = await Promise.all([
          storageService.getAssignments(familyId),
          storageService.getBountyAssignments(familyId),
        ]);

        const pendingRewards = assignments.filter(
          a => a.status === PrizeStatus.PENDING_APPROVAL && a.userId !== currentUser.id
        );
        const pendingTasks = allBounties.filter(
          b => b.status === BountyStatus.COMPLETED && b.userId !== currentUser.id
        );

        setAdminBadgeCount(pendingRewards.length + pendingTasks.length);
      }
    } catch (err) {
      console.error("Failed to fetch badge counts", err);
    }
  };

  useEffect(() => {
    const refreshCurrentUser = async () => {
      if (!currentUser) return;
      
      try {
        const freshUser = await storageService.refreshSession();
        setCurrentUser(freshUser);
        await fetchBadgeCounts();
      } catch (err) {
        console.error("Failed to refresh user session", err);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshCurrentUser();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (showUserMenu && !target.closest('.user-menu-container')) {
        setShowUserMenu(false);
      }
      if (showNotifications && !target.closest('.notifications-container')) {
        setShowNotifications(false);
      }
    };

    // Listen for service worker updates
    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SW_UPDATE_AVAILABLE') {
        console.log('[App] Service worker update available:', event.data.message);
        setUpdateAvailable(true);
      }
    };

    navigator.serviceWorker?.addEventListener('message', handleSWMessage);

    document.addEventListener("visibilitychange", handleVisibility);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleSWMessage);
      document.removeEventListener("visibilitychange", handleVisibility);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [currentUser?.id, showUserMenu, showNotifications]);

  useEffect(() => {
    if (currentUser) {
      fetchBadgeCounts();
      
      // Set up SSE connection for real-time badge updates
      const token = storageService.getAuthToken();
      if (!token) return;

      const source = new EventSource(`${API_BASE}/events?token=${token}`);

      source.onmessage = (msg) => {
        try {
          const event: SseEvent = JSON.parse(msg.data);

          // Update badge counts on relevant events
          switch (event.type) {
            case "CHILD_ACTION":
            case "WALLET_UPDATE":
            case "TEMPLATE_UPDATE":
              fetchBadgeCounts();
              break;
          }
        } catch (err) {
          console.error("Invalid SSE event in App", err);
        }
      };

      return () => source.close();
    }
  }, [currentUser?.id]);

  const handleUpdateClick = () => {
    // Simply reload the page - the service worker will serve the new version
    // Local storage and dark mode preference will be preserved
    window.location.reload();
  };

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
    <div className="min-h-screen max-w-md lg:max-w-none mx-auto bg-gray-50 dark:bg-gray-900 shadow-2xl lg:shadow-none overflow-hidden relative border-x lg:border-x-0 border-gray-200 dark:border-gray-700">
      {/* PWA Install Prompt */}
      <PwaInstallPrompt />

      {/* Desktop Top Navigation */}
      <header className="hidden lg:flex lg:fixed lg:top-0 lg:right-0 lg:left-0 lg:z-50 lg:bg-white dark:lg:bg-gray-800 lg:border-b lg:border-gray-200 dark:lg:border-gray-700 lg:px-6 lg:py-3">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-2 rounded-xl font-bold text-lg">
              BribeBank
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {currentUser.role === UserRole.ADMIN && (
              <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 rounded-xl p-1">
                <button
                  onClick={() => setView("wallet")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors relative ${
                    view === "wallet" ? "bg-white dark:bg-gray-800 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                  }`}
                >
                  <Wallet size={18} />
                  <span className="font-medium">My Wallet</span>
                  {walletBadgeCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[20px] h-5 flex items-center justify-center text-xs font-bold rounded-full px-1.5 bg-red-500 text-white">
                      {walletBadgeCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setView("admin")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors relative ${
                    view === "admin" ? "bg-white dark:bg-gray-800 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                  }`}
                >
                  <Shield size={18} />
                  <span className="font-medium">Admin</span>
                  {adminBadgeCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[20px] h-5 flex items-center justify-center text-xs font-bold rounded-full px-1.5 bg-red-500 text-white">
                      {adminBadgeCount}
                    </span>
                  )}
                </button>
              </div>
            )}
            
            <div className="relative notifications-container">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
              >
                <Bell size={24} />
              </button>
            </div>
            
            <button
              onClick={toggleTheme}
              className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={24} /> : <Moon size={24} />}
            </button>
            
            <div className="relative user-menu-container">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-3 px-4 py-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                {currentUser.avatarUrl ? (
                  <img 
                    src={currentUser.avatarUrl} 
                    alt={currentUser.name}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className={`w-10 h-10 rounded-full ${currentUser.avatarColor} flex items-center justify-center text-white font-bold`}>
                    {currentUser.name.charAt(0)}
                  </div>
                )}
                <div className="text-left">
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{currentUser.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{currentUser.role === UserRole.ADMIN ? 'Admin' : 'Member'}</p>
                </div>
                <ChevronDown size={16} className="text-gray-400 dark:text-gray-500" />
              </button>
              
              {showUserMenu && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50">
                  <div className="p-2">
                    <button
                      onClick={() => {
                        handleLogout();
                        setShowUserMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <LogOut size={18} />
                      <span className="font-medium">Log Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      
      {/* Update Available Banner */}
      {updateAvailable && (
        <div className="fixed top-0 left-0 right-0 bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-4 py-3 z-40 lg:top-16">
          <div className="max-w-md lg:max-w-none mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-white/20">
                  <span className="text-sm font-bold">✓</span>
                </div>
              </div>
              <p className="font-medium text-sm">A new version is available</p>
            </div>
            <button
              onClick={handleUpdateClick}
              className="flex-shrink-0 px-4 py-1.5 bg-white text-blue-600 font-semibold rounded-lg hover:bg-blue-50 transition-colors text-sm"
            >
              Update Now
            </button>
          </div>
        </div>
      )}
      
      {/* Content Area */}
      <main className={`h-full overflow-y-auto no-scrollbar lg:pt-16 ${updateAvailable ? 'pt-16 lg:pt-24' : ''}`}>
        {view === "admin" && currentUser.role === UserRole.ADMIN && (
          <AdminView 
            currentUser={currentUser} 
            initialTab={initialAdminTab}
            onUserUpdate={async () => {
              await handleUserUpdate();
              await fetchBadgeCounts();
            }}
            desktopShowNotifications={showNotifications}
            onDesktopNotificationsToggle={() => setShowNotifications(!showNotifications)}
          />
        )}

        {view === "wallet" && (
          <WalletView
            currentUser={currentUser}
            initialTab={initialWalletTab}
            desktopShowNotifications={showNotifications}
            onDesktopNotificationsToggle={() => setShowNotifications(!showNotifications)}
            onUserUpdate={async () => {
              await handleUserUpdate();
              await fetchBadgeCounts();
            }}
          />
        )}
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 max-w-md lg:max-w-none w-full bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex justify-around lg:justify-center lg:gap-8 items-center py-3 pb-5 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] lg:hidden">
        {currentUser.role === UserRole.ADMIN && (
          <>
            <button
              onClick={() => setView("wallet")}
              className={`flex flex-col items-center space-y-1 transition-colors relative ${
                view === "wallet" ? "text-indigo-600 dark:text-indigo-400" : "text-gray-400 dark:text-gray-500"
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
              {walletBadgeCount > 0 && (
                <span className="absolute top-0 right-1/2 translate-x-3 -translate-y-1 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold rounded-full px-1 bg-red-500 text-white">
                  {walletBadgeCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setView("admin")}
              className={`flex flex-col items-center space-y-1 transition-colors relative ${
                view === "admin" ? "text-indigo-600 dark:text-indigo-400" : "text-gray-400 dark:text-gray-500"
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
              {adminBadgeCount > 0 && (
                <span className="absolute top-0 right-1/2 translate-x-3 -translate-y-1 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold rounded-full px-1 bg-red-500 text-white">
                  {adminBadgeCount}
                </span>
              )}
            </button>
          </>
        )}

        <button
          onClick={handleLogout}
          className="flex flex-col items-center space-y-1 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
        >
          <LogOut size={24} />
          <span className="text-xs font-medium">Log Out</span>
        </button>
      </nav>
    </div>
  );
};

export default App;
