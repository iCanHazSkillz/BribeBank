import React, { useState, useEffect, useCallback, useRef } from "react";
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
type ReleaseNotesEntry = {
  title?: string;
  date?: string;
  features?: string[];
  improvements?: string[];
  fixes?: string[];
};

type ReleaseNotesPayload = {
  latest?: ReleaseNotesEntry;
  releases?: Record<string, ReleaseNotesEntry>;
};

type VersionManifest = {
  buildId: string;
  releaseVersion: string;
  builtAt?: string;
};

const UPDATE_RELOAD_GUARD_KEY = "bb_update_reload_in_progress";
const LAST_SEEN_BUILD_ID_KEY = "bb_last_seen_build_id";
const VERSION_CHECK_COOLDOWN_KEY = "bb_version_check_failed_at";
const UPDATE_MODAL_SEEN_PREFIX = "bb_update_modal_seen::";
const RELOAD_GUARD_WINDOW_MS = 15000;
const VERSION_CHECK_COOLDOWN_MS = 60000;
const FALLBACK_RELEASE_NOTES: ReleaseNotesEntry = {
  title: "BribeBank was updated",
  features: ["New app updates are now applied automatically."],
  improvements: ["Update summaries are now shown after successful upgrades."],
  fixes: ["General bug fixes and stability improvements."]
};

const isWalletTab = (v: string | null): v is WalletTab =>
  v === "wallet" || v === "tasks" || v === "store" || v === "history";

const App: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [view, setView] = useState<View>("login");
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [releaseNotes, setReleaseNotes] = useState<ReleaseNotesEntry>(FALLBACK_RELEASE_NOTES);
  const [walletBadgeCount, setWalletBadgeCount] = useState(0);
  const [adminBadgeCount, setAdminBadgeCount] = useState(0);
  const [showRecoverySetupModal, setShowRecoverySetupModal] = useState(false);
  const [isGeneratingRecoveryKey, setIsGeneratingRecoveryKey] = useState(false);
  const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState("");
  const [recoveryAcknowledged, setRecoveryAcknowledged] = useState(false);
  const staleLogoutInProgressRef = useRef(false);

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
    const rawAdminTab = params.get("adminTab"); // e.g. "manage" | legacy "approvals"
    const adminTab = rawAdminTab === "approvals" ? "manage" : rawAdminTab;
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

  const triggerAutoReload = useCallback((reason: string) => {
    const lastSeenBuildId = localStorage.getItem(LAST_SEEN_BUILD_ID_KEY);
    if (!lastSeenBuildId) {
      // First install session: do not force a reload.
      return;
    }

    const now = Date.now();
    const guardRaw = sessionStorage.getItem(UPDATE_RELOAD_GUARD_KEY);
    const guardTimestamp = guardRaw ? Number(guardRaw) : 0;

    if (Number.isFinite(guardTimestamp) && now - guardTimestamp < RELOAD_GUARD_WINDOW_MS) {
      return;
    }

    sessionStorage.setItem(UPDATE_RELOAD_GUARD_KEY, String(now));
    console.log(`[App] Auto reloading for app update (${reason})`);
    window.location.reload();
  }, []);

  const checkForNewBuildOnOpen = useCallback(async (reason: string) => {
    const lastSeenBuildId = localStorage.getItem(LAST_SEEN_BUILD_ID_KEY);
    if (!lastSeenBuildId) {
      localStorage.setItem(LAST_SEEN_BUILD_ID_KEY, __APP_BUILD_ID__);
      return;
    }

    const cooldownRaw = sessionStorage.getItem(VERSION_CHECK_COOLDOWN_KEY);
    const cooldownAt = cooldownRaw ? Number(cooldownRaw) : 0;
    if (Number.isFinite(cooldownAt) && Date.now() - cooldownAt < VERSION_CHECK_COOLDOWN_MS) {
      return;
    }

    try {
      const response = await fetch("/version.json", { cache: "no-store" });
      if (!response.ok) {
        sessionStorage.setItem(VERSION_CHECK_COOLDOWN_KEY, String(Date.now()));
        return;
      }

      const manifest = (await response.json()) as VersionManifest;
      if (manifest?.buildId && manifest.buildId !== __APP_BUILD_ID__) {
        triggerAutoReload(`version-manifest-${reason}`);
        return;
      }

      sessionStorage.removeItem(VERSION_CHECK_COOLDOWN_KEY);
    } catch {
      sessionStorage.setItem(VERSION_CHECK_COOLDOWN_KEY, String(Date.now()));
    }
  }, [triggerAutoReload]);

  const clearSessionAndRouteToLogin = useCallback(() => {
    storageService.logout();
    setCurrentUser(null);
    setView("login");
    setInitialAdminTab(undefined);
    setInitialWalletTab(undefined);
    setShowRecoverySetupModal(false);
    setGeneratedRecoveryKey("");
    setRecoveryAcknowledged(false);
  }, []);

  const forceLogoutToLogin = useCallback((reason: string) => {
    if (staleLogoutInProgressRef.current) {
      return;
    }

    staleLogoutInProgressRef.current = true;
    console.warn(`[App] Logging out due to stale session (${reason})`);
    clearSessionAndRouteToLogin();
    setShowUserMenu(false);
    setShowNotifications(false);
  }, [clearSessionAndRouteToLogin]);

  const dismissUpdateModal = useCallback(() => {
    localStorage.setItem(`${UPDATE_MODAL_SEEN_PREFIX}${__APP_RELEASE_VERSION__}`, "true");
    setShowUpdateModal(false);
  }, []);

  useEffect(() => {
    const guardRaw = sessionStorage.getItem(UPDATE_RELOAD_GUARD_KEY);
    if (guardRaw) {
      const guardTimestamp = Number(guardRaw);
      if (!Number.isFinite(guardTimestamp) || Date.now() - guardTimestamp >= RELOAD_GUARD_WINDOW_MS) {
        sessionStorage.removeItem(UPDATE_RELOAD_GUARD_KEY);
      }
    }

    const cooldownRaw = sessionStorage.getItem(VERSION_CHECK_COOLDOWN_KEY);
    if (cooldownRaw) {
      const cooldownAt = Number(cooldownRaw);
      if (!Number.isFinite(cooldownAt) || Date.now() - cooldownAt >= VERSION_CHECK_COOLDOWN_MS) {
        sessionStorage.removeItem(VERSION_CHECK_COOLDOWN_KEY);
      }
    }

    const maybeShowUpdatedModal = async () => {
      const lastSeenBuildId = localStorage.getItem(LAST_SEEN_BUILD_ID_KEY);
      if (!lastSeenBuildId) {
        localStorage.setItem(LAST_SEEN_BUILD_ID_KEY, __APP_BUILD_ID__);
        return;
      }

      if (lastSeenBuildId === __APP_BUILD_ID__) {
        return;
      }

      localStorage.setItem(LAST_SEEN_BUILD_ID_KEY, __APP_BUILD_ID__);
      const modalSeenKey = `${UPDATE_MODAL_SEEN_PREFIX}${__APP_RELEASE_VERSION__}`;
      if (localStorage.getItem(modalSeenKey)) {
        return;
      }

      try {
        const response = await fetch("/release-notes.json", { cache: "no-store" });
        if (!response.ok) {
          setReleaseNotes(FALLBACK_RELEASE_NOTES);
          setShowUpdateModal(true);
          return;
        }

        const payload = (await response.json()) as ReleaseNotesPayload;
        const selected =
          payload?.releases?.[__APP_RELEASE_VERSION__] ||
          payload?.latest ||
          FALLBACK_RELEASE_NOTES;
        setReleaseNotes(selected);
      } catch (err) {
        console.warn("[App] Failed to load release notes", err);
        setReleaseNotes(FALLBACK_RELEASE_NOTES);
      }

      setShowUpdateModal(true);
    };

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
      } catch (err) {
        if (err instanceof Error && err.message === "SESSION_STALE") {
          forceLogoutToLogin("init-refresh");
          return;
        }
        clearSessionAndRouteToLogin();
      }
    };

    void init();
    void maybeShowUpdatedModal();
    void checkForNewBuildOnOpen("startup");

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
                  triggerAutoReload("updatefound-installed");
                }
              });
            }
          });

          // Also check if there's already a waiting service worker
          if (registration.waiting) {
            triggerAutoReload("registration-waiting");
          }
        }
      });
    }
  }, [triggerAutoReload, clearSessionAndRouteToLogin, forceLogoutToLogin, checkForNewBuildOnOpen]);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const response = await originalFetch(input, init);

      if (response.status === 401) {
        try {
          const body = await response.clone().json();
          if (body?.error === "SESSION_STALE") {
            forceLogoutToLogin("http-401");
          }
        } catch {
          // Ignore non-JSON 401 responses.
        }
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [forceLogoutToLogin]);

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
        if (err instanceof Error && err.message === "SESSION_STALE") {
          forceLogoutToLogin("visibility-refresh");
          return;
        }
        console.error("Failed to refresh user session", err);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshCurrentUser();
        void checkForNewBuildOnOpen("foreground");
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
        console.log('[App] Service worker update available:', event.data.message, event.data.buildId);
        triggerAutoReload("sw-message");
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
  }, [currentUser?.id, showUserMenu, showNotifications, triggerAutoReload, forceLogoutToLogin, checkForNewBuildOnOpen]);

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

      source.onerror = async () => {
        try {
          await storageService.refreshSession();
        } catch (err) {
          if (err instanceof Error && err.message === "SESSION_STALE") {
            source.close();
            forceLogoutToLogin("sse-refresh");
          }
        }
      };

      return () => source.close();
    }
  }, [currentUser?.id, forceLogoutToLogin]);

  const handleLogin = async (user: User) => {
    staleLogoutInProgressRef.current = false;
    setCurrentUser(user);

    // Apply deep-link post-login too
    applyDeepLinkForUser(user);

    await storageService.registerPushNotifications();
  };

  const handleLogout = () => {
    clearSessionAndRouteToLogin();
  };

  const handleUserUpdate = async () => {
    try {
      const freshUser = await storageService.refreshSession();
      setCurrentUser(freshUser);
    } catch (err) {
      if (err instanceof Error && err.message === "SESSION_STALE") {
        forceLogoutToLogin("post-update-refresh");
        return;
      }
      console.error("Failed to refresh user after update", err);
    }
  };

  const handleGenerateRecoveryKey = async () => {
    try {
      setIsGeneratingRecoveryKey(true);
      const result = await storageService.regenerateRecoveryKey();
      setGeneratedRecoveryKey(result.recoveryKey);
      setRecoveryAcknowledged(false);
    } catch (err) {
      console.error("Failed to generate recovery key", err);
    } finally {
      setIsGeneratingRecoveryKey(false);
    }
  };

  useEffect(() => {
    const ensureRecoveryKeySetup = async () => {
      if (!currentUser || currentUser.role !== UserRole.ADMIN) {
        setShowRecoverySetupModal(false);
        return;
      }

      try {
        const status = await storageService.getRecoveryKeyStatus();
        const needsSetup = !status.configured;
        setShowRecoverySetupModal(needsSetup);
        if (needsSetup) {
          setGeneratedRecoveryKey("");
          setRecoveryAcknowledged(false);
        }
      } catch (err) {
        console.error("Failed to load recovery key status", err);
      }
    };

    void ensureRecoveryKeySetup();
  }, [currentUser?.id, currentUser?.role]);

  const updateModal = showUpdateModal ? (
    <div className="fixed inset-0 z-[110] bg-black/60 flex items-start lg:items-center justify-center p-3 sm:p-4 h-[100dvh] overflow-y-auto">
      <div className="w-full max-w-xl my-4 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden max-h-[calc(100dvh-2rem)] flex flex-col">
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-5 text-white">
          <h2 className="text-2xl font-bold">BribeBank was updated</h2>
          <p className="mt-1 text-emerald-50 text-sm">
            {releaseNotes.title || "Latest improvements are now available."}
            {releaseNotes.date ? ` (${releaseNotes.date})` : ""}
          </p>
        </div>
        <div className="p-6 space-y-5 overflow-y-auto">
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-200 mb-2">New Features</h3>
            <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
              {(releaseNotes.features?.length ? releaseNotes.features : ["General feature enhancements."]).map((item) => (
                <li key={`feature-${item}`} className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-0.5">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-200 mb-2">Improvements</h3>
            <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
              {(releaseNotes.improvements?.length ? releaseNotes.improvements : ["General UX and performance improvements."]).map((item) => (
                <li key={`improvement-${item}`} className="flex items-start gap-2">
                  <span className="text-teal-500 mt-0.5">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-200 mb-2">Bug Fixes</h3>
            <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
              {(releaseNotes.fixes?.length ? releaseNotes.fixes : ["General stability fixes."]).map((item) => (
                <li key={`fix-${item}`} className="flex items-start gap-2">
                  <span className="text-cyan-500 mt-0.5">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
          <div className="pt-2 flex justify-end">
            <button
              onClick={dismissUpdateModal}
              className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold hover:opacity-95 transition-opacity"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  if (!currentUser || view === "login") {
    return (
      <>
        <LoginView onLogin={handleLogin} />
        {updateModal}
      </>
    );
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
      
      {updateModal}
      {showRecoverySetupModal && (
        <div className="fixed inset-0 z-[120] bg-black/70 flex items-start lg:items-center justify-center p-3 sm:p-4 h-[100dvh] overflow-y-auto">
          <div className="w-full max-w-xl my-4 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden max-h-[calc(100dvh-2rem)] flex flex-col">
            <div className="bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-5 text-white">
              <h2 className="text-2xl font-bold">Set Up Family Recovery Key</h2>
              <p className="mt-1 text-amber-50 text-sm">
                Required before continuing. This key is needed if a parent forgets their password.
              </p>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              {!generatedRecoveryKey ? (
                <>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Generate a family recovery key now and store it securely. If lost, only your self-hoster administrator can recover access.
                  </p>
                  <button
                    onClick={handleGenerateRecoveryKey}
                    disabled={isGeneratingRecoveryKey}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {isGeneratingRecoveryKey ? "Generating..." : "Generate Recovery Key"}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-700 dark:text-gray-300">Your new family recovery key (shown once):</p>
                  <div className="p-3 rounded-lg bg-gray-100 dark:bg-gray-900 font-mono text-sm text-gray-900 dark:text-gray-100 break-all">
                    {generatedRecoveryKey}
                  </div>
                  <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={recoveryAcknowledged}
                      onChange={(e) => setRecoveryAcknowledged(e.target.checked)}
                      className="mt-1"
                    />
                    I have securely saved this recovery key.
                  </label>
                  <div className="flex justify-end">
                    <button
                      onClick={() => setShowRecoverySetupModal(false)}
                      disabled={!recoveryAcknowledged}
                      className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      Continue
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Content Area */}
      <main className="h-full overflow-y-auto no-scrollbar lg:pt-16">
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
