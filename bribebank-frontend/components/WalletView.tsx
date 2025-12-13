import React, { useState, useEffect, useRef } from 'react';
import { AssignedPrize, PrizeStatus, PrizeTemplate, User, PrizeType, HistoryEvent, AppNotification, BountyAssignment, BountyTemplate, BountyStatus, StoreItem } from '../types';
import { storageService } from '../services/storageService';
import { API_BASE } from "../config";
import { PrizeCard } from './PrizeCard';
import { History, Ticket, Bell, X, CheckCircle, XCircle, ListTodo, Play, Trash2, ThumbsUp, ThumbsDown, gift, ShoppingBag, Link as LinkIcon, Image as ImageIcon, Settings, User as UserIcon } from 'lucide-react';
import { SseEvent } from "../types/sseEvents";

interface WalletViewProps {
  currentUser: User;
  initialTab?: "wallet" | "tasks" | "history";
}

type WalletTab = "wallet" | "tasks" | "store" | "history";

const getWalletTabFromUrl = (): WalletTab | null => {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("walletTab") || params.get("tab");
  return raw === "wallet" || raw === "tasks" || raw === "store" || raw === "history" ? raw : null;
};

interface GroupedPrize {
    templateId: string;
    template: PrizeTemplate;
    ids: string[];
    count: number;
    status: PrizeStatus;
    assignedBy: string;
}

export const WalletView: React.FC<WalletViewProps> = ({ currentUser, initialTab }) => {
  const [tab, setTab] = useState<WalletTab>(() => {
    return initialTab ?? getWalletTabFromUrl() ?? "wallet";
  }); 
  // Data State
  const [myPrizes, setMyPrizes] = useState<AssignedPrize[]>([]);
  const [myBounties, setMyBounties] = useState<BountyAssignment[]>([]);
  const [templates, setTemplates] = useState<PrizeTemplate[]>([]);
  const [bountyTemplates, setBountyTemplates] = useState<BountyTemplate[]>([]);
  const [historyEvents, setHistoryEvents] = useState<HistoryEvent[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [familyUsers, setFamilyUsers] = useState<User[]>([]);
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [ticketBalance, setTicketBalance] = useState(currentUser.ticketBalance);
  const [toast, setToast] = useState<{message: string, type: 'info' | 'success' | 'error' } | null>(null);

  // Wheel State
  const [wheelSegments, setWheelSegments] = useState<Array<{label: string, color: string, prob: number}>>([]);
  const [wheelSpinCost, setWheelSpinCost] = useState(1);
  const [showWheel, setShowWheel] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [spinResult, setSpinResult] = useState<{won: boolean, prize?: string, emoji?: string} | null>(null);

  // UI State
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);

  // Account Settings State
  const [settingsName, setSettingsName] = useState(currentUser.name);
  const [settingsUsername, setSettingsUsername] = useState(currentUser.username);
  const [settingsPassword, setSettingsPassword] = useState('');
  const [settingsAvatarColor, setSettingsAvatarColor] = useState(currentUser.avatarColor);

  const AVATAR_COLORS = ['bg-pink-400', 'bg-teal-400', 'bg-blue-500', 'bg-purple-500', 'bg-orange-400', 'bg-green-500', 'bg-red-400', 'bg-indigo-500'];

  type ConfirmOptions = {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
  };

  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const confirmResolveRef = useRef<(result: boolean) => void>();

  const confirm = (options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      confirmResolveRef.current = resolve;
      setConfirmState(options);
    });
  };

  const refreshData = async () => {
    const familyId = currentUser.familyId;
    if (!familyId) return;

    try {
      const [
        rewardAssignmentsFromApi,
        rewardTemplatesFromApi,
        bountyAssignmentsFromApi,
        bountyTemplatesFromApi,
        usersFromApi,
        historyFromApi,
        notificationsFromApi,
        storeItemsFromApi,
        wheelSegmentsFromApi,
        wheelConfigFromApi,
      ] = await Promise.all([
        storageService.getAssignments(familyId),          // prizes
        storageService.getTemplates(familyId),           // prize templates
        storageService.getBountyAssignments(familyId),   // bounty assignments
        storageService.getBountyTemplates(familyId),     // bounty templates
        storageService.getFamilyUsers(familyId),
        storageService.getHistoryEvents(familyId, currentUser.id),
        storageService.getNotifications(currentUser.id),
        storageService.getStoreItems(familyId),          // store items
        storageService.getWheelSegments(familyId),       // wheel segments
        storageService.getWheelConfig(familyId),         // wheel config
      ]);

      setMyPrizes(
        rewardAssignmentsFromApi.filter(
          (a) => a.userId === currentUser.id
        )
      );
      setTemplates(rewardTemplatesFromApi);

      setMyBounties(
        bountyAssignmentsFromApi.filter(
          (b) => b.userId === currentUser.id
        )
      );
      setBountyTemplates(bountyTemplatesFromApi);

      setFamilyUsers(usersFromApi);
      setHistoryEvents(historyFromApi);
      setNotifications(
        notificationsFromApi.filter((n) => !n.isRead)
      );
      setStoreItems(storeItemsFromApi);
      setWheelSegments(wheelSegmentsFromApi);
      setWheelSpinCost(wheelConfigFromApi.spinCost);
      
      // Update ticket balance from family users list
      const updatedCurrentUser = usersFromApi.find(u => u.id === currentUser.id);
      if (updatedCurrentUser) {
        setTicketBalance(updatedCurrentUser.ticketBalance);
      }
    } catch (err) {
      console.error("Failed to refresh wallet data", err);
    }
  };

  useEffect(() => {
    refreshData();
  }, [currentUser.id]);

  useEffect(() => {
    // Sync ticket balance when currentUser prop changes
    setTicketBalance(currentUser.ticketBalance);
  }, [currentUser.ticketBalance]);

  useEffect(() => {
      if(toast) {
          const timer = setTimeout(() => setToast(null), 3000);
          return () => clearTimeout(timer);
      }
  }, [toast]);

  useEffect(() => {
    const token = storageService.getAuthToken();
    if (!token || !currentUser?.familyId) return;

    const source = new EventSource(`${API_BASE}/events?token=${token}`);

    source.onmessage = (msg) => {
      try {
        const event: SseEvent = JSON.parse(msg.data);

        switch (event.type) {
          case "CONNECTED":
            console.log("[SSE] connected");
            break;

          case "CHILD_ACTION":
            refreshData();
            break;

          case "TEMPLATE_UPDATE":
            refreshData();
            break;

          case "WALLET_UPDATE":
            refreshData();
            break;

          case "TICKETS_GIVEN":
            if (event.userId === currentUser.id) {
              refreshData();
              setToast({ message: `You received ${event.amount} tickets!`, type: "success" });
            }
            break;

          case "STORE_ITEM_ADDED":
          case "STORE_ITEM_UPDATED":
          case "STORE_ITEM_DELETED":
            refreshData();
            break;

          case "STORE_PURCHASE":
            if (event.userId === currentUser.id) {
              refreshData();
            }
            break;

          default:
            console.warn("Unknown SSE event:", event);
        }
      } catch (err) {
        console.error("Invalid SSE event", err);
      }
    };

    return () => source.close();
  }, [currentUser?.familyId]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshData();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshData]);
  
  useEffect(() => {
    if (initialTab && (initialTab === "wallet" || initialTab === "tasks" || initialTab === "history")) {
      setTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    const applyTabFromUrl = () => {
      const t = getWalletTabFromUrl();
      if (t) setTab(t);

      // only remove params if we actually used one
      if (t) {
        const url = new URL(window.location.href);
        url.searchParams.delete("walletTab");
        url.searchParams.delete("tab");
        window.history.replaceState({}, "", url.toString());
      }
    };

    applyTabFromUrl();

    window.addEventListener("focus", applyTabFromUrl);
    window.addEventListener("popstate", applyTabFromUrl);
    document.addEventListener("visibilitychange", applyTabFromUrl);

    return () => {
      window.removeEventListener("focus", applyTabFromUrl);
      window.removeEventListener("popstate", applyTabFromUrl);
      document.removeEventListener("visibilitychange", applyTabFromUrl);
    };
  }, []);

  const resolveUserName = (value?: string | null) => {
    if (!value) return "Parent"; // fallback label

    // If the value happens to be a user ID, resolve against familyUsers
    const byId = familyUsers.find((u) => u.id === value);
    if (byId) return byId.name;

    // Otherwise it's already a display name from the backend
    return value;
  };

  // Actions
  const handleClaim = async (assignmentId: string) => {
    try {
      await storageService.claimPrize(assignmentId);
      setToast({
        message: "Requested! Waiting for parents...",
        type: "info",
      });
      await refreshData();
    } catch (err) {
      console.error("Failed to claim prize", err);
      setToast({
        message: "Failed to claim prize. Please try again.",
        type: "error",
      });
    }
  };


  const handleBountyAction = async (
    assignmentId: string,
    action: 'start' | 'finish' | 'reject'
  ) => {
    try {
      if (action === 'start') {
        await storageService.updateBountyStatus(
          assignmentId,
          BountyStatus.IN_PROGRESS
        );
        setToast({ message: "Task started!", type: 'info' });
      } else if (action === 'finish') {
        await storageService.updateBountyStatus(
          assignmentId,
          BountyStatus.COMPLETED
        );
        setToast({
          message: "Marked as done! Waiting for verification.",
          type: 'success',
        });
      } else if (action === 'reject') {

        const ok = await confirm({
          title: "Reject This Task?",
          message: "Reject this task? This cannot be undone.",
          confirmLabel: "Reject Task",
          cancelLabel: "Cancel",
          destructive: true,
        });

        if (ok) {
          await storageService.deleteBountyAssignment(assignmentId);
          setToast({ message: "Task rejected.", type: 'info' });
        }
      }

      await refreshData();
    } catch (err) {
      console.error("handleBountyAction error:", err);
      setToast({ message: "Something went wrong with this task.", type: 'error' });
    }
  };

  const handleDismissNotification = async (id: string) => {
    try {
      await storageService.markNotificationRead(id);
      await refreshData();
    } catch (err) {
      console.error("Failed to dismiss notification", err);
      setToast({
        message: "Failed to update notification.",
        type: "error",
      });
    }
  };

  const handlePurchaseStoreItem = async (item: StoreItem) => {
    try {
      if (ticketBalance < item.cost) {
        setToast({ message: "Not enough tickets!", type: "error" });
        return;
      }

      const ok = await confirm({
        title: `Purchase ${item.title}?`,
        message: `This will cost ${item.cost} tickets. Your parents will be notified to fulfill this request.`,
        confirmLabel: `Buy for ${item.cost} tickets`,
        cancelLabel: "Cancel",
        destructive: false,
      });

      if (!ok) return;

      await storageService.purchaseStoreItem(item.id, currentUser.id);
      setToast({ message: "Purchase request sent to parents!", type: "success" });
      await refreshData();
    } catch (err) {
      console.error("Failed to purchase store item", err);
      setToast({ message: "Failed to purchase item", type: "error" });
    }
  };

  const handleClearAllNotifications = async () => {
    try {
      await storageService.markAllNotificationsRead(currentUser.id);
      await refreshData();
      setShowNotifications(false);
    } catch (err) {
      console.error("Failed to clear notifications", err);
      setToast({
        message: "Failed to clear notifications.",
        type: "error",
      });
    }
  };

  const handleSpinWheel = async () => {
    if (isSpinning) return;
    if (ticketBalance < wheelSpinCost) {
      setToast({ message: `Need ${wheelSpinCost - ticketBalance} more tickets!`, type: 'error' });
      return;
    }

    setIsSpinning(true);
    setSpinResult(null);

    try {
      const result = await storageService.spinWheel(currentUser.familyId, currentUser.id);
      
      // Find winning segment index (case-insensitive match)
      const winningLabel = result.prize || "Not this time";
      const winIndex = wheelSegments.findIndex(s => 
        s.label.toLowerCase() === winningLabel.toLowerCase()
      );
      
      if (winIndex === -1) {
        console.error('Could not find winning segment!');
        setIsSpinning(false);
        setToast({ message: 'Error: Could not find winning segment', type: 'error' });
        return;
      }
      
      // Calculate the center angle of the winning segment
      const previousProb = wheelSegments.slice(0, winIndex).reduce((sum, s) => sum + s.prob, 0);
      const winningSegmentProb = wheelSegments[winIndex].prob;
      const segmentCenterAngle = (previousProb + winningSegmentProb / 2) * 360;
      
      // The pointer is at the top (0°). We want to rotate the wheel so the winning segment center aligns with 0°
      // Since the SVG is rotated -90° initially, segment 0 starts at top
      // To land segment center at top, rotate by: -segmentCenterAngle
      const targetRotation = -segmentCenterAngle;
      
      // Add multiple spins for effect
      const spinCount = 5;
      const totalSpins = -(spinCount * 360);
      
      // Final rotation from current position
      const finalRotation = wheelRotation + totalSpins + (targetRotation - (wheelRotation % 360));
      
      setWheelRotation(finalRotation);
      
      // Wait for animation to complete
      setTimeout(() => {
        setSpinResult({
          won: result.won,
          prize: result.prize,
          emoji: result.emoji
        });
        setTicketBalance(result.newBalance);
        setIsSpinning(false);
        
        if (result.won) {
          refreshData(); // Refresh to show new prize in wallet
        }
      }, 4000); // Match CSS animation duration
      
    } catch (e: any) {
      setToast({ message: e.message || "Spin failed", type: 'error' });
      setIsSpinning(false);
    }
  };

  const handleOpenAccountSettings = () => {
    setSettingsName(currentUser.name);
    setSettingsUsername(currentUser.username);
    setSettingsPassword('');
    setSettingsAvatarColor(currentUser.avatarColor);
    setShowAccountSettings(true);
  };

  const handleSaveAccountSettings = async () => {
    try {
      if (!settingsName || !settingsUsername) {
        setToast({ message: "Name and username are required", type: "error" });
        return;
      }

      await storageService.updateUser(currentUser.id, currentUser.id, {
        name: settingsName,
        username: settingsUsername,
        avatarColor: settingsAvatarColor,
        ...(settingsPassword ? { password: settingsPassword } : {}),
      } as any);

      setToast({ message: "Account updated successfully!", type: "success" });
      setShowAccountSettings(false);
      
      // Refresh session to get updated user data
      const freshUser = await storageService.refreshSession();
      window.location.reload(); // Reload to update currentUser prop
    } catch (err: any) {
      console.error("Failed to update account", err);
      setToast({ message: err.message || "Failed to update account", type: "error" });
    }
  };

// --------- Grouped Prizes (fixed snapshot stacking) ---------

const normalize = (v?: string | null) => (v ?? "").trim().toLowerCase();

// For rewards that DON'T have a templateId (e.g., created from bounties),
// build a stable "reward identity" so only truly identical rewards stack.
const getSnapshotIdentity = (p: any) => {
  const title = normalize(p.title);
  const emoji = (p.emoji ?? "").trim();
  const type = String(p.type ?? "");
  const color = normalize(p.themeColor);

  // Intentionally NOT including description so
  // "Reward for completing: X" doesn't prevent stacking identical rewards.
  return `${title}|${emoji}|${type}|${color}`;
};

const groupedPrizes: GroupedPrize[] = Object.values(
  myPrizes.reduce((acc, prize) => {
    if (prize.status === PrizeStatus.REDEEMED) return acc;

    const hasTemplate = !!prize.templateId;

    const baseKey = hasTemplate
      ? `T:${prize.templateId}`
      : `S:${getSnapshotIdentity(prize)}`;

    const key = `${baseKey}-${prize.status}`;

    if (!acc[key]) {
      const template = hasTemplate
        ? templates.find((t) => t.id === prize.templateId)
        : undefined;

      // Use a stable "group template id" for snapshots so UI types stay happy.
      const groupTemplateId = hasTemplate
        ? (prize.templateId as string)
        : `snapshot:${getSnapshotIdentity(prize)}`;

      const resolvedTemplate: PrizeTemplate = {
        id: template?.id || groupTemplateId,
        familyId: prize.familyId,
        title: prize.title || template?.title || "Unknown",
        description: prize.description ?? template?.description ?? "?",
        emoji: prize.emoji || template?.emoji || "❓",
        type: prize.type ?? template?.type ?? PrizeType.CUSTOM,
        themeColor: prize.themeColor ?? template?.themeColor
      };

      acc[key] = {
        templateId: groupTemplateId,
        template: resolvedTemplate,
        ids: [],
        count: 0,
        status: prize.status,
        assignedBy: resolveUserName(prize.assignedBy)
      };
    }

    acc[key].ids.push(prize.id);
    acc[key].count++;
    return acc;
  }, {} as Record<string, GroupedPrize>)
);


  // Active Bounties
  const activeBounties = myBounties.filter(b => b.status !== BountyStatus.VERIFIED);

  return (
    <div className="pb-24 relative">
      {toast && (
          <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[60] w-[90%] max-w-sm">
              <div className="bg-gray-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 animate-fade-in-down">
                  <div className="bg-indigo-500 p-1 rounded-full"><CheckCircle size={16}/></div>
                  <p className="text-sm font-medium">{toast.message}</p>
              </div>
          </div>
      )}

      <header className="bg-white sticky top-0 z-50 px-6 py-4 shadow-sm mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div 
               className={`w-10 h-10 rounded-full ${currentUser.avatarColor} shadow-md border-2 border-white flex items-center justify-center text-white font-bold cursor-pointer hover:scale-110 transition-transform`}
               onClick={handleOpenAccountSettings}
               title="Account Settings"
             >
                 {currentUser.name.charAt(0)}
             </div>
             <div>
                <h1 className="text-lg font-extrabold text-gray-900 leading-tight">My Wallet</h1>
                <p className="text-xs text-gray-500">Hi, {currentUser.name}!</p>
             </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Ticket Balance */}
            <div className="bg-gradient-to-r from-purple-500 to-indigo-600 px-3 py-2 rounded-full flex items-center gap-2 shadow-md">
              <Ticket size={16} className="text-white" />
              <span className="text-white font-bold text-sm">{ticketBalance}</span>
            </div>

            <div className="relative">
                <button 
                    onClick={() => setShowNotifications(!showNotifications)} 
                    className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                >
                    <Bell size={24} />
                    {notifications.length > 0 && (
                        <span className="absolute top-1 right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white flex items-center justify-center">
                           <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        </span>
                    )}
                </button>
                
                {showNotifications && (
                    <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50 animate-fade-in">
                        <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-sm text-gray-700">Notifications</h3>
                            <div className="flex gap-2">
                                {notifications.length > 0 && (
                                    <button onClick={handleClearAllNotifications} className="text-xs text-indigo-600 font-semibold hover:text-indigo-800">Clear All</button>
                                )}
                                <button onClick={() => setShowNotifications(false)} className="text-gray-400 hover:text-gray-600"><X size={16}/></button>
                            </div>
                        </div>
                        <div className="max-h-64 overflow-y-auto p-2">
                            {notifications.length === 0 ? (
                                <div className="text-center py-8 text-gray-400">
                                    <Bell className="mx-auto mb-2 opacity-20" size={24} />
                                    <p className="text-sm italic">No new alerts</p>
                                </div>
                            ) : (
                                notifications.map(note => (
                                    <div key={note.id} className="p-3 mb-1 bg-white hover:bg-gray-50 rounded-xl border border-gray-100 transition-colors relative group">
                                        <p className="text-sm text-gray-800 pr-6">{note.message}</p>
                                        <p className="text-xs text-gray-400 mt-1">{new Date(note.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</p>
                                        <button onClick={(e) => { e.stopPropagation(); handleDismissNotification(note.id); }} className="absolute top-2 right-2 text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"><X size={14}/></button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
          </div>
        </div>
      </header>

      <div className="flex px-4 mb-6 gap-2">
        <button onClick={() => setTab('wallet')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold transition-colors ${tab === 'wallet' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600'}`}><Ticket size={16} /> Rewards</button>
        <button onClick={() => setTab('tasks')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold transition-colors relative ${tab === 'tasks' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600'}`}>
            <ListTodo size={16} /> Tasks
            {activeBounties.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center text-white border border-white">{activeBounties.length}</span>}
        </button>
        <button onClick={() => setTab('store')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold transition-colors ${tab === 'store' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600'}`}><ShoppingBag size={16} /> Store</button>
        <button onClick={() => setTab('history')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold transition-colors ${tab === 'history' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600'}`}><History size={16} /> History</button>
      </div>

      <div className="px-4 space-y-4">
        {tab === 'wallet' && (
          <>
            {groupedPrizes.length === 0 ? (
              <div className="text-center py-16 opacity-60">
                <span className="text-6xl mb-4 block">😕</span>
                <h3 className="text-lg font-bold text-gray-800">No rewards yet</h3>
                <p className="text-sm text-gray-500 mt-1">Ask for more tasks!</p>
              </div>
            ) : (
              groupedPrizes.map(group => (
                <div key={`${group.templateId}-${group.status}`} className="relative">
                    <PrizeCard
                    {...group.template}
                    status={group.status}
                    count={group.count}
                    actionLabel={group.status === PrizeStatus.AVAILABLE ? "Use Card" : "Waiting..."}
                    onClick={group.status === PrizeStatus.AVAILABLE ? () => handleClaim(group.ids[0]) : undefined}
                    disabled={group.status === PrizeStatus.PENDING_APPROVAL}
                    />
                    {group.status === PrizeStatus.AVAILABLE && (
                        <div className="text-xs text-gray-400 text-center mt-1 mb-2">Assigned by {group.assignedBy}</div>
                    )}
                </div>
              ))
            )}
          </>
        )}

        {/* Wheel Spin Modal */}
        {showWheel && (
          <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4" onClick={() => !isSpinning && setShowWheel(false)}>
            <div className="bg-white rounded-3xl p-8 max-w-md w-full" onClick={e => e.stopPropagation()}>
              <h3 className="text-2xl font-bold text-center mb-6 flex items-center justify-center gap-2">
                <span className="text-3xl">🎡</span>
                Prize Wheel
              </h3>
              
              {/* Wheel Container */}
              <div className="relative w-80 h-80 mx-auto mb-6">
                {/* Pointer Triangle at Top */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-3 z-20">
                  <div className="w-0 h-0 border-l-[20px] border-l-transparent border-r-[20px] border-r-transparent border-t-[30px]" style={{ borderTopColor: '#e50078' }}></div>
                </div>
                
                {/* Wheel SVG */}
                <div 
                  className="w-full h-full relative"
                  style={{
                    transform: `rotate(${wheelRotation}deg)`,
                    transition: isSpinning ? 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)' : 'none',
                  }}
                >
                  <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    {wheelSegments.map((segment, index) => {
                      // Calculate segment angles based on probabilities
                      const prevProb = wheelSegments.slice(0, index).reduce((sum, s) => sum + s.prob, 0);
                      const startAngle = prevProb * 360;
                      const endAngle = (prevProb + segment.prob) * 360;
                      const angleSpan = endAngle - startAngle;
                      
                      // Convert to radians for path calculation
                      const startRad = (startAngle * Math.PI) / 180;
                      const endRad = (endAngle * Math.PI) / 180;
                      
                      // Calculate path for the segment
                      const x1 = 50 + 50 * Math.cos(startRad);
                      const y1 = 50 + 50 * Math.sin(startRad);
                      const x2 = 50 + 50 * Math.cos(endRad);
                      const y2 = 50 + 50 * Math.sin(endRad);
                      
                      const largeArc = angleSpan > 180 ? 1 : 0;
                      
                      return (
                        <path
                          key={index}
                          d={`M 50 50 L ${x1} ${y1} A 50 50 0 ${largeArc} 1 ${x2} ${y2} Z`}
                          fill={segment.color}
                          stroke="#ffffff"
                          strokeWidth="0.5"
                        />
                      );
                    })}
                    
                    {/* Center circle */}
                    <circle cx="50" cy="50" r="8" fill="#ae46ff" />
                    <text x="50" y="52" textAnchor="middle" fill="white" fontSize="6" fontWeight="bold">Spin</text>
                  </svg>
                  
                  {/* Text Labels */}
                  {wheelSegments.map((segment, index) => {
                    // Don't show labels for Try Again segments
                    const isTryAgain = segment.label.toLowerCase().includes('try again');
                    if (isTryAgain) return null;
                    
                    const prevProb = wheelSegments.slice(0, index).reduce((sum, s) => sum + s.prob, 0);
                    const centerAngle = (prevProb + segment.prob / 2) * 360;
                    
                    // Position text along the segment
                    const angleRad = ((centerAngle + 90) * Math.PI) / 180; // +90 to account for -rotate-90 on SVG
                    const radius = 60; // Distance from center
                    const x = 50 + radius * Math.cos(angleRad - Math.PI / 2);
                    const y = 50 + radius * Math.sin(angleRad - Math.PI / 2);
                    
                    return (
                      <div
                        key={`label-${index}`}
                        className="absolute pointer-events-none"
                        style={{
                          left: '50%',
                          top: '50%',
                          transform: `translate(-50%, -50%) rotate(${centerAngle}deg) translateY(-110px)`,
                        }}
                      >
                        <div 
                          className="text-center"
                          style={{
                            transform: 'rotate(90deg)',
                            transformOrigin: 'center',
                          }}
                        >
                          <span 
                            className="text-xs font-bold inline-block px-1"
                            style={{
                              color: '#ffffff',
                              textShadow: '0 0 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.7), 1px 1px 3px rgba(0,0,0,1)',
                              WebkitTextStroke: '0.5px rgba(0,0,0,0.8)',
                              writingMode: 'horizontal-tb',
                              maxWidth: '100px',
                              wordBreak: 'break-word',
                              lineHeight: '1.2',
                            }}
                          >
                            {segment.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Result Display */}
              {spinResult && (
                <div className={`text-center mb-4 p-4 rounded-xl ${spinResult.won ? 'bg-green-50' : 'bg-yellow-50'}`}>
                  <div className="text-4xl mb-2">{spinResult.won ? spinResult.emoji : '😕'}</div>
                  <p className={`font-bold text-lg ${spinResult.won ? 'text-green-700' : 'text-yellow-700'}`}>
                    {spinResult.won ? `You won: ${spinResult.prize}!` : spinResult.prize}
                  </p>
                  {spinResult.won ? (
                    <p className="text-sm text-green-600 mt-1">Check your wallet!</p>
                  ) : (
                    <p className="text-sm text-yellow-600 mt-1">Better luck next time!</p>
                  )}
                </div>
              )}

              {/* Ticket Balance */}
              <div className="text-center mb-4">
                <div className="flex items-center justify-center gap-2 text-gray-600">
                  <Ticket size={20} className="text-purple-500" />
                  <span className="font-bold">{ticketBalance} tickets</span>
                </div>
                {ticketBalance < wheelSpinCost && (
                  <p className="text-xs text-red-500 mt-1">Not enough tickets!</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowWheel(false);
                    setSpinResult(null);
                    setWheelRotation(0);
                  }}
                  disabled={isSpinning}
                  className="flex-1 py-3 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors font-medium disabled:opacity-50"
                >
                  Close
                </button>
                <button
                  onClick={handleSpinWheel}
                  disabled={isSpinning || ticketBalance < wheelSpinCost}
                  className="flex-[2] py-3 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-xl font-bold hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:hover:scale-100"
                >
                  {isSpinning ? 'Spinning...' : `Spin (${wheelSpinCost} 🎫)`}
                </button>
              </div>
            </div>
          </div>
        )}

        {confirmState && (
          <div
            className="fixed inset-0 bg-black/60 z-[80] flex items-center justify-center"
            onClick={() => {
              // clicking backdrop = cancel
              confirmResolveRef.current?.(false);
              setConfirmState(null);
            }}
          >
            <div
              className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                {confirmState.title}
              </h3>
              <p className="text-sm text-gray-600 mb-6">
                {confirmState.message}
              </p>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  className="px-4 py-2 text-sm rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50"
                  onClick={() => {
                    confirmResolveRef.current?.(false);
                    setConfirmState(null);
                  }}
                >
                  {confirmState.cancelLabel ?? "Cancel"}
                </button>

                <button
                  type="button"
                  className={
                    "px-4 py-2 text-sm rounded-xl text-white " +
                    (confirmState.destructive
                      ? "bg-red-500 hover:bg-red-600"
                      : "bg-blue-600 hover:bg-blue-700")
                  }
                  onClick={() => {
                    confirmResolveRef.current?.(true);
                    setConfirmState(null);
                  }}
                >
                  {confirmState.confirmLabel ?? "Confirm"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Account Settings Modal */}
        {showAccountSettings && (
          <div
            className="fixed inset-0 bg-black/60 z-[80] flex items-center justify-center"
            onClick={() => setShowAccountSettings(false)}
          >
            <div
              className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 mb-4">
                <Settings size={24} className="text-gray-700" />
                <h3 className="text-lg font-bold text-gray-900">
                  Account Settings
                </h3>
              </div>

              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={settingsName}
                    onChange={(e) => setSettingsName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Your name"
                  />
                </div>

                {/* Username */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    value={settingsUsername}
                    onChange={(e) => setSettingsUsername(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Your username"
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    value={settingsPassword}
                    onChange={(e) => setSettingsPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Leave blank to keep current"
                  />
                </div>

                {/* Avatar Color */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Avatar Color
                  </label>
                  <div className="grid grid-cols-6 gap-2">
                    {AVATAR_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setSettingsAvatarColor(color)}
                        className={`w-10 h-10 rounded-full ${color} ${
                          settingsAvatarColor === color
                            ? 'ring-4 ring-blue-500 ring-offset-2'
                            : 'hover:scale-110'
                        } transition-all`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  className="px-4 py-2 text-sm rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50"
                  onClick={() => setShowAccountSettings(false)}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="px-4 py-2 text-sm rounded-xl text-white bg-blue-600 hover:bg-blue-700"
                  onClick={handleSaveAccountSettings}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === 'tasks' && (
            <div className="space-y-4">
                {activeBounties.length === 0 && <div className="text-center py-10 text-gray-400 italic">No active tasks. Good job!</div>}
                {activeBounties.map(b => {
                    const t = bountyTemplates.find(temp => temp.id === b.bountyTemplateId);
                    if(!t) return null;
                    
                    const rewardDescription = t.rewardType === 'TICKETS' 
                      ? `Reward: ${t.rewardValue} Tickets`
                      : `Reward: ${t.rewardValue}`;
                    
                    return (
                        <div key={b.id} className="relative">
                            <PrizeCard 
                                title={t.title}
                                description={rewardDescription}
                                emoji={t.emoji}
                                variant="bounty"
                                status={b.status}
                                isFCFS={t.isFCFS}
                                actionLabel={null} // We render custom buttons below
                                onClick={undefined} // Remove click handler from card body
                                disabled={b.status === BountyStatus.COMPLETED}
                                themeColor= {t.themeColor || "bg-white border-indigo-200 text-gray-900"}
                                customActions={
                                    <div className="flex gap-2 mt-4">
                                        {b.status === BountyStatus.OFFERED ? (
                                            <>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleBountyAction(b.id, 'reject'); }} 
                                                    className="flex-1 py-2 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 flex items-center justify-center gap-1 text-sm"
                                                >
                                                    <X size={16}/> Refuse
                                                </button>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleBountyAction(b.id, 'start'); }} 
                                                    className="flex-[2] py-2 bg-green-600 text-white font-bold rounded-xl shadow-md hover:bg-green-700 flex items-center justify-center gap-1 text-sm"
                                                >
                                                    <ThumbsUp size={16}/> Accept
                                                </button>
                                            </>
                                        ) : b.status === BountyStatus.IN_PROGRESS ? (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleBountyAction(b.id, 'finish'); }} 
                                                className="w-full py-2 bg-indigo-600 text-white font-bold rounded-xl shadow-md hover:bg-indigo-700 flex items-center justify-center gap-1 text-sm"
                                            >
                                                <CheckCircle size={16}/> Mark Complete
                                            </button>
                                        ) : (
                                            <button 
                                                disabled
                                                className="w-full py-2 bg-gray-100 text-gray-400 font-bold rounded-xl border border-gray-200 cursor-not-allowed text-sm"
                                            >
                                                Pending Verification
                                            </button>
                                        )}
                                    </div>
                                }
                            />
                        </div>
                    );
                })}
            </div>
        )}

        {tab === 'store' && (
            <div className="space-y-4">
                {/* Spin & Win Banner */}
                {wheelSegments.length > 0 && (
                  <button
                    onClick={() => setShowWheel(true)}
                    className="w-full bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between hover:scale-[1.02] transition-transform"
                  >
                    <div className="flex items-center gap-4">
                      <div className="text-4xl">🎡</div>
                      <div className="text-left">
                        <h3 className="text-xl font-bold">Spin & Win!</h3>
                        <p className="text-sm opacity-90">{wheelSpinCost} ticket{wheelSpinCost !== 1 ? 's' : ''} per spin</p>
                      </div>
                    </div>
                    <div className="bg-white/20 px-4 py-2 rounded-xl font-bold">
                      Try Your Luck!
                    </div>
                  </button>
                )}
                
                {storeItems.length === 0 ? (
                    <div className="text-center py-16 opacity-60">
                        <ShoppingBag size={64} className="mx-auto mb-4 text-gray-300" />
                        <h3 className="text-lg font-bold text-gray-800">Store is Empty</h3>
                        <p className="text-sm text-gray-500 mt-1">No items available yet</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {storeItems.map((item) => (
                            <div
                                key={item.id}
                                className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
                            >
                                {item.imageUrl && (
                                    <div className="aspect-video bg-gray-100 overflow-hidden">
                                        <img
                                            src={item.imageUrl}
                                            alt={item.title}
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                                e.currentTarget.style.display = 'none';
                                            }}
                                        />
                                    </div>
                                )}
                                <div className="p-4">
                                    <h3 className="font-bold text-gray-800 mb-2">{item.title}</h3>
                                    
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-1">
                                            <Ticket size={20} className="text-purple-500" />
                                            <span className="text-xl font-bold text-purple-600">{item.cost}</span>
                                        </div>
                                        {ticketBalance >= item.cost ? (
                                            <span className="text-xs text-green-600 font-medium bg-green-50 px-2 py-1 rounded">
                                                Can afford
                                            </span>
                                        ) : (
                                            <span className="text-xs text-gray-400 font-medium">
                                                Need {item.cost - ticketBalance} more
                                            </span>
                                        )}
                                    </div>

                                    {item.description && (
                                        <p className="text-xs text-gray-500 mb-3">{item.description}</p>
                                    )}

                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handlePurchaseStoreItem(item)}
                                            disabled={ticketBalance < item.cost}
                                            className={`flex-1 py-2 rounded-xl font-bold text-sm transition-colors ${
                                                ticketBalance >= item.cost
                                                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                            }`}
                                        >
                                            {ticketBalance >= item.cost ? 'Purchase' : 'Not Enough Tickets'}
                                        </button>
                                        
                                        {item.productUrl && (
                                            <a
                                                href={item.productUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="p-2 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center"
                                                title="View Product"
                                            >
                                                <LinkIcon size={18} />
                                            </a>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )}

        {tab === 'history' && (
            <div className="space-y-3">
                {historyEvents.length === 0 && <p className="text-center text-gray-400 py-10">Nothing here yet.</p>}
                {historyEvents.map(event => (
                  <div key={event.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4 opacity-80 grayscale-[0.2]">
                      <span className="text-3xl">{event.emoji}</span>
                      <div className="flex-1">
                          <h4 className="font-bold text-gray-800">{event.title}</h4>
                          <p className="text-xs text-gray-500">
                             {new Date(event.timestamp).toLocaleDateString()} • {event.action.replace('_', ' ')}
                             <span className="block text-[10px] text-indigo-500">By {event.assignerName}</span>
                          </p>
                      </div>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${event.action.includes('APPROVED') || event.action.includes('VERIFIED') || event.action.includes('EARNED') || event.action.includes('SPIN_WON') || event.action.includes('RECEIVED') || event.action.includes('ASSIGNED') || event.action.includes('ACCEPTED') || event.action.includes('COMPLETED') || event.action.includes('CLAIMED') ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'}`}>
                          {event.action.includes('APPROVED') || event.action.includes('VERIFIED') || event.action.includes('ASSIGNED') || event.action.includes('ACCEPTED') || event.action.includes('EARNED') || event.action.includes('SPIN_WON') || event.action.includes('RECEIVED') || event.action.includes('COMPLETED') || event.action.includes('CLAIMED') ? <CheckCircle size={18}/> : <XCircle size={18}/>}
                      </div>
                  </div>
                ))}
            </div>
        )}
      </div>
    </div>
  );
};