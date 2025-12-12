import React, { useState, useEffect, useRef } from 'react';
import { AssignedPrize, PrizeStatus, PrizeTemplate, User, PrizeType, HistoryEvent, AppNotification, BountyAssignment, BountyTemplate, BountyStatus, StoreItem } from '../types';
import { storageService } from '../services/storageService';
import { API_BASE } from "../config";
import { PrizeCard } from './PrizeCard';
import { History, Ticket, Bell, X, CheckCircle, XCircle, ListTodo, Play, Trash2, ThumbsUp, ThumbsDown, gift, ShoppingBag, Link as LinkIcon, Image as ImageIcon } from 'lucide-react';
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

  // UI State
  const [showNotifications, setShowNotifications] = useState(false);

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
      ] = await Promise.all([
        storageService.getAssignments(familyId),          // prizes
        storageService.getTemplates(familyId),           // prize templates
        storageService.getBountyAssignments(familyId),   // bounty assignments
        storageService.getBountyTemplates(familyId),     // bounty templates
        storageService.getFamilyUsers(familyId),
        storageService.getHistoryEvents(familyId, currentUser.id),
        storageService.getNotifications(currentUser.id),
        storageService.getStoreItems(familyId),          // store items
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
             <div className={`w-10 h-10 rounded-full ${currentUser.avatarColor} shadow-md border-2 border-white flex items-center justify-center text-white font-bold`}>
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
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${event.action.includes('APPROVED') || event.action.includes('VERIFIED') || event.action.includes('ASSIGNED') || event.action.includes('ACCEPTED') || event.action.includes('COMPLETED') || event.action.includes('CLAIMED') ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'}`}>
                          {event.action.includes('APPROVED') || event.action.includes('VERIFIED') || event.action.includes('ASSIGNED') || event.action.includes('ACCEPTED') || event.action.includes('COMPLETED') || event.action.includes('CLAIMED') ? <CheckCircle size={18}/> : <XCircle size={18}/>}
                      </div>
                  </div>
                ))}
            </div>
        )}
      </div>
    </div>
  );
};