import React, { useState, useEffect, useRef } from 'react';
import { AssignedPrize, PrizeStatus, PrizeTemplate, User, PrizeType, UserRole, HistoryEvent, BountyTemplate, AssignedBounty, BountyStatus, AppNotification } from '../types';
import { storageService } from '../services/storageService';
import { API_BASE } from "../config";
import { PrizeCard } from './PrizeCard';
import { Trash2, Check, X, Gift, Edit2, CheckCircle, AlertCircle, UserPlus, Shield, User as UserIcon, KeyRound, History, Plus, ListTodo, CircleDollarSign, Search, Zap, Bell, Settings } from 'lucide-react';
import { SseEvent } from "../types/sseEvents";
import EmojiPicker from "emoji-picker-react";


interface AdminViewProps {
  currentUser: User;
  initialTab?: string;
}

const QUICK_EMOJI_OPTIONS = ['🎁', '🧹', '🍕', '💵', '📱'];
const AVATAR_COLORS = ['bg-pink-400', 'bg-teal-400', 'bg-blue-500', 'bg-purple-500', 'bg-orange-400', 'bg-green-500', 'bg-red-400', 'bg-indigo-500'];
const PASTEL_COLORS = [
    'bg-red-100 text-red-800 border-red-200',
    'bg-orange-100 text-orange-800 border-orange-200',
    'bg-amber-100 text-amber-800 border-amber-200',
    'bg-green-100 text-green-800 border-green-200',
    'bg-teal-100 text-teal-800 border-teal-200',
    'bg-blue-100 text-blue-800 border-blue-200',
    'bg-indigo-100 text-indigo-800 border-indigo-200',
    'bg-purple-100 text-purple-800 border-purple-200',
    'bg-pink-100 text-pink-800 border-pink-200',
    'bg-gray-100 text-gray-800 border-gray-200',
];

export const AdminView: React.FC<AdminViewProps> = ({ currentUser, initialTab, }) => {
  const [tab, setTab] = useState<'assign' | 'approvals' | 'create' | 'users'>('assign');
  const [assignSubTab, setAssignSubTab] = useState<'rewards' | 'bounties'>('rewards');

  // Data State
  const [users, setUsers] = useState<User[]>([]);
  const [assignments, setAssignments] = useState<AssignedPrize[]>([]);
  const [bountyAssignments, setBountyAssignments] = useState<AssignedBounty[]>([]);
  const [templates, setTemplates] = useState<PrizeTemplate[]>([]);
  const [bountyTemplates, setBountyTemplates] = useState<BountyTemplate[]>([]);
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  
  // Selection & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [selectedBountyTemplateIds, setSelectedBountyTemplateIds] = useState<string[]>([]);
  
  // Create Template State
  const [createMode, setCreateMode] = useState<'reward' | 'bounty'>('reward');
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Reward Form
  const [prizeTitle, setPrizeTitle] = useState('');
  const [prizeDesc, setPrizeDesc] = useState('');
  const [prizeEmoji, setPrizeEmoji] = useState('🎁');
  const [prizeColor, setPrizeColor] = useState(PASTEL_COLORS[6]);

  // Bounty Form
  const [bountyTitle, setBountyTitle] = useState('');
  const [bountyRewardValue, setBountyRewardValue] = useState('');
  const [bountyEmoji, setBountyEmoji] = useState('🧹');
  const [bountyFCFS, setBountyFCFS] = useState(false);
  const [bountyColor, setBountyColor] = useState(PASTEL_COLORS[6]);
  const [emojiPickerTarget, setEmojiPickerTarget] =
    useState<"prize" | "bounty" | null>(null);
  const [showPrizeEmojiPicker, setShowPrizeEmojiPicker] = useState(false);
  const [showBountyEmojiPicker, setShowBountyEmojiPicker] = useState(false);

  // User Management State
  const [userFormView, setUserFormView] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [newUserName, setNewUserName] = useState('');
  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>(UserRole.USER);
  const [newUserColor, setNewUserColor] = useState(AVATAR_COLORS[0]);

  // View Rewards State
  const [viewingRewardsForUser, setViewingRewardsForUser] = useState<string | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);

  // UI State
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);

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
    if (!currentUser.familyId) return;
    const familyId = currentUser.familyId;

    try {
      const [
        templatesFromApi,
        assignmentsFromApi,
        bountyTemplatesFromApi,
        bountyAssignmentsFromApi,
        usersFromApi,
        historyFromApi,
        notificationsFromApi,
      ] = await Promise.all([
        storageService.getTemplates(familyId),         // Reward templates
        storageService.getAssignments(familyId),       // Assigned rewards
        storageService.getBountyTemplates(familyId),   // Bounty templates
        storageService.getBountyAssignments(familyId), // Assigned bounties
        storageService.getFamilyUsers(familyId),
        storageService.getFamilyHistory(familyId),
        storageService.getNotifications(currentUser.id),
      ]);

      //----------------------------------------------------
      // Rewards
      //----------------------------------------------------
      setTemplates(templatesFromApi);
      setAssignments(assignmentsFromApi);

      //----------------------------------------------------
      // Bounties
      //----------------------------------------------------
      setBountyTemplates(bountyTemplatesFromApi);
      setBountyAssignments(bountyAssignmentsFromApi);
      //----------------------------------------------------
      // Users
      //----------------------------------------------------
      setUsers(usersFromApi);

      //----------------------------------------------------
      // History + notifications (from backend)
      //----------------------------------------------------
      setHistory(historyFromApi);
      setNotifications(
        notificationsFromApi.filter((n) => !n.isRead)
      );

    } catch (err) {
      console.error("Failed to refresh from backend", err);
    }
  };

  useEffect(() => {
    refreshData();
  }, [currentUser]);

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
    if (initialTab) {
      setTab(initialTab as any);
      refreshData();
    }
  }, [initialTab]);

  const showToast = (message: string, type: 'success' | 'error') => {
      setToast({ message, type });
  };

  const resetForms = () => {
    setPrizeTitle(''); setPrizeDesc(''); setPrizeEmoji('🎁'); setPrizeColor(PASTEL_COLORS[6]);
    setBountyTitle(''); setBountyRewardValue(''); setBountyEmoji('🧹'); setBountyFCFS(false); setBountyColor(PASTEL_COLORS[6]);
    setEditingId(null);
  };

  // --- ACTIONS ---

const handleBulkAssign = async () => {
  if (selectedUsers.length === 0) {
    showToast("Select at least one child.", "error");
    return;
  }

  try {
    // --------------------------------------------------------
    // REWARDS
    // --------------------------------------------------------
    if (assignSubTab === "rewards") {
      if (selectedTemplateIds.length === 0) return;

      let count = 0;

      for (const userId of selectedUsers) {
        for (const templateId of selectedTemplateIds) {
          const template = templates.find(t => t.id === templateId);
          if (!template) continue;

          await storageService.assignPrize(
            template,          // full PrizeTemplate object
            userId,            // child id
            currentUser.id     // admin id (not actually used right now)
          );

          count++;
        }
      }
      showToast(`Assigned ${count} reward(s)!`, "success");
      setSelectedTemplateIds([]);
    }

    // --------------------------------------------------------
    // BOUNTIES (leave as-is)
    // --------------------------------------------------------
    else if (assignSubTab === "bounties") {
      if (selectedBountyTemplateIds.length === 0) return;

      let count = 0;

      for (const userId of selectedUsers) {
        for (const templateId of selectedBountyTemplateIds) {
          const bounty = bountyTemplates.find(t => t.id === templateId);
          if (!bounty) continue;

          await storageService.assignBounty(
            currentUser.familyId,
            bounty.id,
            userId
          );

          count++;
        }
      }

      showToast(`Assigned ${count} task(s)!`, "success");
      setSelectedBountyTemplateIds([]);
    }

    // --------------------------------------------------------
    // FINAL CLEANUP
    // --------------------------------------------------------
    setSelectedUsers([]);
    await refreshData();

  } catch (err) {
    console.error("Bulk assignment error:", err);
    showToast("Failed to assign some items. Check console.", "error");
  }
};


  const handleSaveTemplate = async () => {
    try {
      // ------------------------------------
      // REWARD TEMPLATE
      // ------------------------------------
      if (createMode === "reward") {
        if (!prizeTitle || !prizeDesc) return;

        const reward: PrizeTemplate = {
          id: editingId || Date.now().toString(),  // numeric = new
          familyId: currentUser.familyId,
          title: prizeTitle,
          description: prizeDesc,
          emoji: prizeEmoji,
          type: PrizeType.PRIVILEGE,
          themeColor: prizeColor,
        };

        try {
          await storageService.saveTemplate(reward);
          showToast("Reward template saved!", "success");
          await refreshData();
        } catch (err) {
          console.error("Failed to save reward template", err);
          showToast("Failed to save reward", "error");
          return;
        }
      }

      // ------------------------------------
      // BOUNTY TEMPLATE
      // ------------------------------------
      else if (createMode === "bounty") {
        if (!bountyTitle || !bountyRewardValue) return;

        const bounty: BountyTemplate = {
          id: editingId || Date.now().toString(), // numeric IDs = create
          familyId: currentUser.familyId,
          title: bountyTitle,
          emoji: bountyEmoji,
          rewardValue: bountyRewardValue,
          rewardTemplateId: undefined, // not used yet
          isFCFS: bountyFCFS,
          themeColor: bountyColor,
        };

        try {
          await storageService.saveBountyTemplate(bounty);
          showToast("Bounty template saved!", "success");
          await refreshData();
        } catch (err) {
          console.error("Failed to save bounty template", err);
          showToast("Failed to save bounty", "error");
          return;
        }
      }

      // ------------------------------------
      // CLEANUP
      // ------------------------------------
      resetForms();
      setEditingId(null);
      setTab("assign");
    } catch (err) {
      console.error("Unexpected error in handleSaveTemplate:", err);
      showToast("Something went wrong", "error");
    }
  };

  const handleApprovePrize = async (assignmentId: string) => {
    try {
      await storageService.approvePrize(assignmentId);
      await refreshData();
      showToast("Approved!", "success");
    } catch (err) {
      console.error("Failed to approve prize", err);
      showToast("Failed to approve prize", "error");
    }
  };

  const handleRejectPrize = async (assignmentId: string) => {
    const ok = await confirm({
      title: "Deny Claim?",
      message: "Are you sure you want to deny this claim. The reward will remain in the child's wallet.",
      confirmLabel: "Deny",
      cancelLabel: "Cancel",
      destructive: false,
    });

    if (!ok) return;

    try {
      await storageService.rejectClaim(assignmentId);
      await refreshData();
      showToast("Denied.", "success");
    } catch (err) {
      console.error("Failed to deny prize", err);
      showToast("Failed to deny prize", "error");
    }
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    const ok = await confirm({
      title: "Delete Reward Assignment?",
      message: "Permanently delete this reward from your child's wallet? This cannot be undone.",
      confirmLabel: "Delete Reward",
      cancelLabel: "Cancel",
      destructive: true,
    });

    if (!ok) return;

    try {
      await storageService.deleteAssignment(assignmentId);
      await refreshData();
      showToast("Deleted.", "success");
    } catch (err) {
      console.error("Failed to delete assignment", err);
      showToast("Failed to delete assignment", "error");
    }
  };

  const handleEditReward = (t: PrizeTemplate) => {
      resetForms();
      setCreateMode('reward');
      setEditingId(t.id);
      setPrizeTitle(t.title);
      setPrizeDesc(t.description);
      setPrizeEmoji(t.emoji);
      setPrizeColor(t.themeColor || PASTEL_COLORS[9]);
      setTab('create');
  };

  const handleEditBounty = (b: BountyTemplate) => {
      resetForms();
      setCreateMode('bounty');
      setEditingId(b.id);
      setBountyTitle(b.title);
      setBountyRewardValue(b.rewardValue);
      setBountyEmoji(b.emoji);
      setBountyFCFS(!!b.isFCFS);
      setBountyColor(b.themeColor || PASTEL_COLORS[9]);
      setTab('create');
  };

  const handleDeleteTemplate = async (id: string, isBounty: boolean) => {
      const ok = await confirm({
        title: "Delete Template?",
        message: "Permanently delete this template? This cannot be undone.",
        confirmLabel: "Delete Template",
        cancelLabel: "Cancel",
        destructive: true,
      });

      if (ok) {
          if(isBounty) await storageService.deleteBountyTemplate(id);
          else await storageService.deleteTemplate(id);
          await refreshData();
          showToast("Deleted.", 'success');

          setAssignSubTab(isBounty ? 'bounties' : 'rewards');
          setTab('assign');
          resetForms();
      }
  };

  const handleVerifyBounty = async (id: string) => {
      await storageService.verifyBounty(id);
      await refreshData();
      showToast("Task verified! Reward sent.", 'success');
  };

  // User Management Logic
  const handleOpenUserForm = (user?: User) => {
      if (user) {
          setEditingUser(user);
          setNewUserName(user.name);
          setNewUserUsername(user.username);
          setNewUserRole(user.role);
          setNewUserColor(user.avatarColor);
          setNewUserPassword(''); // Don't show old password
      } else {
          setEditingUser(null);
          setNewUserName('');
          setNewUserUsername('');
          setNewUserPassword('');
          setNewUserRole(UserRole.USER);
          setNewUserColor(AVATAR_COLORS[0]);
      }
      setUserFormView(true);
  };

  const handleCloseUserView = () => {
      setUserFormView(false);
      setEditingUser(null);
      setNewUserName('');
      setNewUserUsername('');
      setNewUserPassword('');
      setNewUserRole(UserRole.USER);
      setNewUserColor(AVATAR_COLORS[0]);
  };

  const handleSaveUser = async () => {
    try {
      if (!newUserName || !newUserUsername) {
        showToast("Name and username are required", "error");
        return;
      }

      if (editingUser) {
        await storageService.updateUser(currentUser.id, editingUser.id, {
          name: newUserName,
          username: newUserUsername,
          role: newUserRole,
          avatarColor: newUserColor,
          ...(newUserPassword ? { password: newUserPassword } : {}),
        } as any);
        showToast("User updated successfully", "success");
      } else {
        if (!newUserPassword) {
          showToast("Password is required for new users", "error");
          return;
        }
        await storageService.createUser(
          currentUser,
          newUserName,
          newUserUsername,
          newUserPassword,
          newUserRole,
          newUserColor
        );
        showToast("User created successfully", "success");
      }

      handleCloseUserView();
      await refreshData();
    } catch (e: any) {
      showToast(e.message || "Error saving user", "error");
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (id === currentUser.id) {
      showToast("You cannot delete yourself.", "error");
      return;
    }

    const ok = await confirm({
      title: "Delete user?",
      message: "Permanently delete this user? This cannot be undone.",
      confirmLabel: "Delete user",
      cancelLabel: "Cancel",
      destructive: true,
    });

    if (!ok) return;

    try {
      await storageService.deleteUser(currentUser.id, id);
      await refreshData();
      handleCloseUserView();
      showToast("User deleted.", "success");
    } catch (e: any) {
      showToast(e.message || "Error deleting user", "error");
    }
  };

  const handleDismissNotification = async (id: string) => {
    try {
      await storageService.markNotificationRead(id);
      await refreshData();
    } catch (err) {
      console.error("Failed to mark notification read", err);
      showToast("Failed to update notification", "error");
    }
  };

  const handleClearAllNotifications = async () => {
    try {
      await storageService.markAllNotificationsRead(currentUser.id);
      await refreshData();
      setShowNotifications(false);
    } catch (err) {
      console.error("Failed to clear notifications", err);
      showToast("Failed to clear notifications", "error");
    }
  };

  // Derived State
  const pendingApprovals = assignments.filter(a =>
    a.status === PrizeStatus.PENDING_APPROVAL &&
    a.userId !== currentUser.id
  );

  const pendingBounties = bountyAssignments.filter(b =>
    b.status === BountyStatus.COMPLETED &&
    b.userId !== currentUser.id
  );

  const totalPending = pendingApprovals.length + pendingBounties.length;
  const assignableUsers = users.filter(u => u.id !== currentUser.id);

  const filteredTemplates = templates.filter(t => t.title.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredBounties = bountyTemplates.filter(b => b.title.toLowerCase().includes(searchTerm.toLowerCase()));

  // IconPicker helper
  const IconPicker: React.FC<{
    value: string;
    onChange: (emoji: string) => void;
    target: "prize" | "bounty";
  }> = ({ value, onChange, target }) => {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Icon
        </label>

        <div className="flex flex-wrap gap-2">
          {QUICK_EMOJI_OPTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onChange(emoji)}
              title={emoji}
              className={`w-10 h-10 rounded-xl border text-lg flex items-center justify-center transition-all ${
                value === emoji
                  ? "bg-indigo-50 border-indigo-400 ring-2 ring-indigo-200"
                  : "bg-gray-50 border-gray-200 hover:border-gray-300"
              }`}
            >
              {emoji}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setEmojiPickerTarget(target)}
            className="h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 flex items-center gap-1 hover:bg-gray-50"
          >
            <Search size={14} />
            <span>More</span>
          </button>
        </div>
      </div>
    );
  };

  // Calculate viewing rewards once
  const rewardsForViewingUser = viewingRewardsForUser 
      ? assignments.filter(a => a.userId === viewingRewardsForUser && a.status === PrizeStatus.AVAILABLE)
      : [];

  return (
    <div className="pb-24 relative min-h-screen">
      {/* Toast */}
      {toast && (
          <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[60] w-[90%] max-w-sm animate-bounce-in">
              <div className={`px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 text-white ${toast.type === 'success' ? 'bg-gray-900' : 'bg-red-500'}`}>
                  {toast.type === 'success' ? <CheckCircle size={16} className="text-green-400"/> : <AlertCircle size={16}/>}
                  <p className="text-sm font-bold">{toast.message}</p>
              </div>
          </div>
      )}

      {emojiPickerTarget && (
        <div
          className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-4"
          onClick={() => setEmojiPickerTarget(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-700">
                Choose an icon
              </h4>
              <button
                type="button"
                onClick={() => setEmojiPickerTarget(null)}
                className="p-1 rounded-md hover:bg-gray-100"
              >
                <X size={16} />
              </button>
            </div>

            <EmojiPicker
              onEmojiClick={(emojiData: any) => {
                const chosen = emojiData?.emoji;
                if (!chosen) return;

                if (emojiPickerTarget === "prize") setPrizeEmoji(chosen);
                if (emojiPickerTarget === "bounty") setBountyEmoji(chosen);

                setEmojiPickerTarget(null);
              }}
            />
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

      {/* Viewing Rewards Modal */}
      {viewingRewardsForUser && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-6 animate-fade-in" onClick={() => setViewingRewardsForUser(null)}>
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                    <h3 className="font-bold text-gray-800">Rewards for {users.find(u => u.id === viewingRewardsForUser)?.name}</h3>
                    <button onClick={() => setViewingRewardsForUser(null)} className="text-gray-400 hover:text-gray-600"><X size={24}/></button>
                </div>
                <div className="p-4 overflow-y-auto space-y-3">
                    {rewardsForViewingUser.length === 0 ? (
                        <div className="text-center py-8 text-gray-400">
                            <Gift className="mx-auto mb-2 opacity-20" size={40} />
                            <p className="text-sm italic">No active rewards assigned.</p>
                        </div>
                    ) : (
                        rewardsForViewingUser.map((assignment) => {
                            // Optional: if a template still exists, we can reuse its theme,
                            // but the *content* should always come from the snapshot.
                            const template = assignment.templateId
                                ? templates.find((t) => t.id === assignment.templateId)
                                : null;

                            const title = assignment.title;
                            const emoji = assignment.emoji;
                            const description = assignment.description || "";

                            const themeColor =
                                assignment.themeColor ||
                                template?.themeColor ||
                                (assignment.type === PrizeType.FOOD
                                    ? "bg-pink-50 text-pink-800 border-pink-200"
                                    : assignment.type === PrizeType.ACTIVITY
                                    ? "bg-sky-50 text-sky-800 border-sky-200"
                                    : "bg-emerald-50 text-emerald-800 border-emerald-200");

                            return (
                                <div
                                    key={assignment.id}
                                    className={`bg-white p-3 rounded-2xl border border-gray-200 flex justify-between items-center shadow-sm`}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-2xl">{emoji}</span>
                                        <div>
                                            <p className="font-bold text-gray-800 text-sm">
                                                {title}
                                            </p>
                                            {description && (
                                                <p className="text-xs text-gray-500">
                                                    {description}
                                                </p>
                                            )}
                                            <p className="text-[11px] text-gray-400 mt-1">
                                                Assigned{" "}
                                                {new Date(
                                                    assignment.assignedAt
                                                ).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteAssignment(assignment.id);
                                            refreshData();
                                        }}
                                        className="text-red-400 p-2 hover:bg-red-50 rounded-full"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            );
                        })
                    )}

                </div>
            </div>
        </div>
      )}

      <header className="bg-white sticky top-0 z-50 shadow-sm px-6 py-4 flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Admin Dashboard</h2>
        <div className="flex items-center gap-3">
            {totalPending > 0 && (
            <span className="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1 rounded-full animate-pulse">{totalPending} Pending</span>
            )}
            
            <div className="relative">
                <button onClick={() => setShowNotifications(!showNotifications)} className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
                    <Bell size={24} />
                    {notifications.length > 0 && <span className="absolute top-1 right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></span>}
                </button>
                
                {showNotifications && (
                    <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50">
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
                                <p className="text-center text-gray-400 text-sm py-4">No new notifications</p>
                            ) : (
                                notifications.map(note => (
                                    <div key={note.id} className="p-3 mb-1 bg-white hover:bg-gray-50 rounded-xl border border-gray-100 transition-colors relative group">
                                        <p className="text-sm text-gray-800 pr-6">{note.message}</p>
                                        <p className="text-xs text-gray-400 mt-1">{new Date(note.timestamp).toLocaleTimeString()}</p>
                                        <button onClick={(e) => { e.stopPropagation(); handleDismissNotification(note.id); }} className="absolute top-2 right-2 text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"><X size={14}/></button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
      </header>

      {/* Main Tabs */}
      <div className="flex p-4 gap-2 overflow-x-auto no-scrollbar">
        {[
            { id: 'assign', label: 'Assign' },
            { id: 'approvals', label: `Approvals (${totalPending})` },
            { id: 'create', label: 'Create New' },
            { id: 'users', label: 'Family' }
        ].map(t => (
            <button 
                key={t.id}
                onClick={() => { setTab(t.id as any); resetForms(); }}
                className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${tab === t.id ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 border border-gray-100'}`}
            >
                {t.label}
            </button>
        ))}
      </div>

      <div className="px-4">
        {tab === 'assign' && (
          <>
            {/* Sub Tabs */}
            <div className="flex gap-4 mb-6 border-b border-gray-200">
                <button onClick={() => setAssignSubTab('rewards')} className={`pb-2 text-sm font-bold ${assignSubTab === 'rewards' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-400'}`}>Give Rewards</button>
                <button onClick={() => setAssignSubTab('bounties')} className={`pb-2 text-sm font-bold ${assignSubTab === 'bounties' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-400'}`}>Assign Tasks</button>
            </div>

            <div className="mb-6 overflow-x-auto no-scrollbar">
              <label className="block text-sm font-medium text-gray-500 mb-2">
                Select Family Members
              </label>
              <div className="flex gap-3">
                {assignableUsers.map((user) => {
                  const isSelected = selectedUsers.includes(user.id);

                  return (
                    <button
                      key={user.id}
                      onClick={() =>
                        setSelectedUsers((prev) =>
                          prev.includes(user.id)
                            ? prev.filter((id) => id !== user.id)
                            : [...prev, user.id]
                        )
                      }
                      className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-all shadow-sm ${
                        isSelected
                          ? "bg-indigo-50 ring-2 ring-indigo-200"
                          : "border-gray-200 bg-white"
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-full ${user.avatarColor} flex items-center justify-center`}
                      >
                        {isSelected && <Check size={16} className="text-white" />}
                      </div>
                      <span
                        className={`font-semibold ${
                          isSelected ? "text-indigo-700" : "text-gray-700"
                        }`}
                      >
                        {user.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Search Bar */}
            <div className="mb-4 relative">
                <input 
                    type="text" 
                    placeholder={assignSubTab === 'rewards' ? "Search rewards..." : "Search tasks..."}
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-all text-gray-900 placeholder-gray-400"
                />
                <Search className="absolute left-3 top-3.5 text-gray-400" size={20}/>
            </div>
            
            {assignSubTab === 'rewards' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-24">
                    {filteredTemplates.length === 0 && <div className="col-span-2 text-center py-8 text-gray-400">No rewards found.</div>}
                    {filteredTemplates.map(t => (
                        <PrizeCard 
                            key={t.id} 
                            {...t} 
                            variant="template"
                            highlight={selectedTemplateIds.includes(t.id)}
                            onClick={() => setSelectedTemplateIds(prev => prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id])}
                            onEdit={() => handleEditReward(t)}
                        />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-24">
                    {filteredBounties.length === 0 && <div className="col-span-2 text-center text-gray-400 py-8 italic">No task templates found.</div>}
                    {filteredBounties.map(b => {
                      const selected = selectedBountyTemplateIds.includes(b.id);
                      const baseColor =
                        b.themeColor || "bg-white border-gray-200 text-gray-900";

                      return (
                        <div
                          key={b.id}
                          onClick={() =>
                            setSelectedBountyTemplateIds(prev =>
                              prev.includes(b.id)
                                ? prev.filter(id => id !== b.id)
                                : [...prev, b.id]
                            )
                          }
                          className={`
                            p-4 rounded-2xl cursor-pointer transition-all flex flex-col shadow-sm relative overflow-hidden
                            ${baseColor}
                            ${selected ? "ring-2 ring-indigo-500 scale-[1.01]" : ""}
                          `}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-4xl">{b.emoji}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditBounty(b);
                              }}
                              className="p-2 bg-gray-100 rounded-full hover:bg-white"
                            >
                              <Edit2 size={14} />
                            </button>
                          </div>

                          <div className="mb-1">
                            <h3 className="font-bold text-gray-800">{b.title}</h3>
                            {b.isFCFS && (
                              <span className="text-[10px] font-bold bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">
                                First Come First Served
                              </span>
                            )}
                          </div>

                          <p className="text-sm text-gray-500 font-medium flex items-center gap-1 mt-1">
                            <Gift size={14} /> Reward: {b.rewardValue}
                          </p>

                          {selected && (
                            <div className="absolute top-2 right-10 bg-indigo-600 text-white p-1 rounded-full">
                              <Check size={12} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
            )}

            {(selectedTemplateIds.length > 0 || selectedBountyTemplateIds.length > 0) && (
                <div className="fixed bottom-24 left-0 right-0 px-6 z-30 flex justify-center animate-bounce-in">
                    <button onClick={handleBulkAssign} className="bg-gray-900 text-white w-full max-w-md py-4 rounded-2xl shadow-2xl flex items-center justify-center gap-3 font-bold text-lg">
                        {assignSubTab === 'rewards' ? <Gift size={24} className="text-indigo-400"/> : <ListTodo size={24} className="text-indigo-400"/>}
                        <span>{assignSubTab === 'rewards' ? 'Send Rewards' : 'Assign Tasks'}</span>
                    </button>
                </div>
            )}
          </>
        )}

        {tab === 'approvals' && (
          <div className="space-y-8">
            {/* Pending Bounties */}
            {pendingBounties.length > 0 && (
                <div>
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><ListTodo size={20}/> Tasks to Verify</h3>
                    <div className="space-y-3">
                        {pendingBounties.map(b => {
                            const template = bountyTemplates.find(t => t.id === b.bountyTemplateId);
                            const user = users.find(u => u.id === b.userId);
                            const isSelfVerification = b.userId === currentUser.id;

                            if(!template || isSelfVerification) return null;

                            return (
                                <div key={b.id} className="bg-white p-4 rounded-2xl shadow-sm border border-green-200">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-full ${user?.avatarColor} flex items-center justify-center text-white text-xs font-bold`}>{user?.name.charAt(0)}</div>
                                            <div>
                                                <p className="font-bold text-gray-800">{template.title}</p>
                                                <p className="text-xs text-gray-500">Marked complete by {user?.name}</p>
                                            </div>
                                        </div>
                                        <span className="text-2xl">{template.emoji}</span>
                                    </div>
                                    <div className="mt-3 pt-3 border-t border-green-50 flex justify-end">
                                        <button onClick={() => handleVerifyBounty(b.id)} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl font-bold text-sm shadow-md hover:bg-green-700">
                                            <CheckCircle size={16}/> Verify & Send Reward
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {pendingApprovals.map((assignment) => {
                const user = users.find((u) => u.id === assignment.userId);
                const isSelfClaim = assignment.userId === currentUser.id;

                if (isSelfClaim) {
                  // Do not show approval controls for your own claims
                  return null;
                }

                // derive a theme if the snapshot doesn't carry one
                const themeColor =
                    assignment.themeColor ||
                    (assignment.type === PrizeType.FOOD
                        ? "bg-pink-100 text-pink-800 border-pink-200"
                        : assignment.type === PrizeType.ACTIVITY
                        ? "bg-sky-100 text-sky-800 border-sky-200"
                        : "bg-emerald-50 text-emerald-800 border-emerald-200");

                return (
                    <div
                        key={assignment.id}
                        className="bg-white p-4 rounded-2xl shadow-sm border border-amber-200"
                    >
                        <div className="flex items-center gap-2 mb-3 text-sm text-gray-500">
                            <div
                                className={`w-6 h-6 rounded-full ${user?.avatarColor}`}
                            ></div>
                            <span className="font-semibold text-gray-800">
                                {user?.name}
                            </span>{" "}
                            wants to claim:
                        </div>

                        <PrizeCard
                            title={assignment.title}
                            description={assignment.description || ""}
                            emoji={assignment.emoji}
                            type={assignment.type}
                            themeColor={themeColor}
                            status={assignment.status}
                            disabled
                        />

                        <div className="flex gap-3 mt-4">
                            <button
                                onClick={() => {
                                    void handleRejectPrize(assignment.id);
                                }}
                                className="flex-1 py-3 rounded-xl font-bold bg-red-50 text-red-600"
                            >
                                Deny
                            </button>
                            <button
                                onClick={() => {
                                    void handleApprovePrize(assignment.id);
                                }}
                                className="flex-1 py-3 rounded-xl font-bold bg-green-600 text-white shadow-lg shadow-green-200"
                            >
                                Approve
                            </button>
                        </div>
                    </div>
                );
            })}

            
            <div className="pt-6 border-t border-gray-200">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><History size={18} /> Recent History</h3>
                <div className="space-y-2 opacity-70">
                    {history.slice(0, 5).map(event => (
                        <div key={event.id} className="bg-white p-3 rounded-xl border border-gray-100 flex items-center gap-3">
                            <span className="text-xl">{event.emoji}</span>
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-gray-800">{event.title}</p>
                                <p className="text-xs text-gray-500">
                                    <span className="font-medium">{event.userName}</span> • {new Date(event.timestamp).toLocaleDateString()}
                                    <span className="block text-[10px] text-indigo-500">{event.action.replace('_', ' ')} by {event.assignerName}</span>
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
          </div>
        )}

        {tab === "create" && (
          <div className="space-y-6">
            <div className="flex bg-gray-100 p-1 rounded-xl mb-4">
              <button
                type="button"
                onClick={() => setCreateMode("reward")}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                  createMode === "reward"
                    ? "bg-white shadow-sm text-indigo-600"
                    : "text-gray-500"
                }`}
              >
                Reward
              </button>
              <button
                type="button"
                onClick={() => setCreateMode("bounty")}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                  createMode === "bounty"
                    ? "bg-white shadow-sm text-indigo-600"
                    : "text-gray-500"
                }`}
              >
                Task/Bounty
              </button>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-800">
                  {editingId ? "Edit" : "Create"}{" "}
                  {createMode === "reward" ? "Reward" : "Task"}
                </h3>
                {editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      resetForms();
                      setTab("assign");
                    }}
                    className="text-gray-400"
                  >
                    Cancel
                  </button>
                )}
              </div>

              {createMode === "reward" ? (
                <div className="space-y-4">
                  {/* ---------------- Icon (Reward) ---------------- */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Icon
                    </label>

                    <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                      {QUICK_EMOJI_OPTIONS.map((emoji) => {
                        const isSelected = prizeEmoji === emoji;

                        return (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => setPrizeEmoji(emoji)}
                            aria-pressed={isSelected}
                            className={`min-w-[3rem] aspect-square flex items-center justify-center text-xl rounded-xl border transition-all ${
                              isSelected
                                ? "bg-indigo-100 border-indigo-500"
                                : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                            }`}
                            title={emoji}
                          >
                            {emoji}
                          </button>
                        );
                      })}

                      {/* Show a chip for a non-quick-picked chosen emoji */}
                      {!!prizeEmoji &&
                        !QUICK_EMOJI_OPTIONS.includes(prizeEmoji) && (
                          <button
                            type="button"
                            onClick={() => setShowPrizeEmojiPicker(true)}
                            className="min-w-[3rem] aspect-square flex items-center justify-center text-xl rounded-xl border bg-indigo-50 border-indigo-200"
                            title="Current icon (click to change)"
                          >
                            {prizeEmoji}
                          </button>
                        )}

                      {/* "More" button */}
                      <button
                        type="button"
                        onClick={() => setShowPrizeEmojiPicker(true)}
                        className="min-w-[3rem] aspect-square flex items-center justify-center text-lg rounded-xl border bg-white border-gray-200 hover:bg-gray-50 font-bold"
                        title="More icons"
                      >
                        +
                      </button>
                    </div>

                    {/* Full picker modal */}
                    {showPrizeEmojiPicker && (
                      <div
                        className="fixed inset-0 bg-black/40 z-[90] flex items-center justify-center p-4"
                        onClick={() => setShowPrizeEmojiPicker(false)}
                      >
                        <div
                          className="bg-white rounded-2xl shadow-2xl p-3 max-w-[95vw]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-between mb-2 px-1">
                            <span className="text-sm font-semibold text-gray-700">
                              Choose an icon
                            </span>
                            <button
                              type="button"
                              className="text-gray-400 hover:text-gray-600"
                              onClick={() => setShowPrizeEmojiPicker(false)}
                            >
                              ✕
                            </button>
                          </div>

                          <EmojiPicker
                            onEmojiClick={(emojiData) => {
                              setPrizeEmoji(emojiData.emoji);
                              setShowPrizeEmojiPicker(false);
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ---------------- Title ---------------- */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Title
                    </label>
                    <input
                      type="text"
                      value={prizeTitle}
                      onChange={(e) => setPrizeTitle(e.target.value)}
                      placeholder="e.g. Extra Screen Time"
                      className="w-full p-3 rounded-xl border border-gray-300 focus:border-indigo-500 outline-none"
                    />
                  </div>

                  {/* ---------------- Description ---------------- */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={prizeDesc}
                      onChange={(e) => setPrizeDesc(e.target.value)}
                      placeholder="Details..."
                      rows={2}
                      className="w-full p-3 rounded-xl border border-gray-300 focus:border-indigo-500 outline-none resize-none"
                    />
                  </div>

                  {/* ---------------- Card Color ---------------- */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Card Color
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {PASTEL_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setPrizeColor(c)}
                          className={`w-8 h-8 rounded-full border-2 ${c.split(" ")[0]} ${
                            prizeColor === c
                              ? "border-gray-600 scale-110"
                              : "border-transparent"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* ---------------- Icon (Bounty) ---------------- */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Icon
                    </label>

                    <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                      {QUICK_EMOJI_OPTIONS.map((emoji) => {
                        const isSelected = bountyEmoji === emoji;

                        return (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => setBountyEmoji(emoji)}
                            aria-pressed={isSelected}
                            className={`min-w-[3rem] aspect-square flex items-center justify-center text-xl rounded-xl border transition-all ${
                              isSelected
                                ? "bg-indigo-100 border-indigo-500"
                                : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                            }`}
                            title={emoji}
                          >
                            {emoji}
                          </button>
                        );
                      })}

                      {/* Show a chip for a non-quick-picked chosen emoji */}
                      {!!bountyEmoji &&
                        !QUICK_EMOJI_OPTIONS.includes(bountyEmoji) && (
                          <button
                            type="button"
                            onClick={() => setShowBountyEmojiPicker(true)}
                            className="min-w-[3rem] aspect-square flex items-center justify-center text-xl rounded-xl border bg-indigo-50 border-indigo-200"
                            title="Current icon (click to change)"
                          >
                            {bountyEmoji}
                          </button>
                        )}

                      <button
                        type="button"
                        onClick={() => setShowBountyEmojiPicker(true)}
                        className="min-w-[3rem] aspect-square flex items-center justify-center text-lg rounded-xl border bg-white border-gray-200 hover:bg-gray-50 font-bold"
                        title="More icons"
                      >
                        +
                      </button>
                    </div>

                    {showBountyEmojiPicker && (
                      <div
                        className="fixed inset-0 bg-black/40 z-[90] flex items-center justify-center p-4"
                        onClick={() => setShowBountyEmojiPicker(false)}
                      >
                        <div
                          className="bg-white rounded-2xl shadow-2xl p-3 max-w-[95vw]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-between mb-2 px-1">
                            <span className="text-sm font-semibold text-gray-700">
                              Choose an icon
                            </span>
                            <button
                              type="button"
                              className="text-gray-400 hover:text-gray-600"
                              onClick={() => setShowBountyEmojiPicker(false)}
                            >
                              ✕
                            </button>
                          </div>

                          <EmojiPicker
                            onEmojiClick={(emojiData) => {
                              setBountyEmoji(emojiData.emoji);
                              setShowBountyEmojiPicker(false);
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ---------------- Task Title ---------------- */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Task Title
                    </label>
                    <input
                      type="text"
                      value={bountyTitle}
                      onChange={(e) => setBountyTitle(e.target.value)}
                      placeholder="e.g. Wash Dishes"
                      className="w-full p-3 rounded-xl border border-gray-300 focus:border-indigo-500 outline-none"
                    />
                  </div>

                  {/* ---------------- Reward Value ---------------- */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Reward Value
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={bountyRewardValue}
                        onChange={(e) => setBountyRewardValue(e.target.value)}
                        placeholder="e.g. $5 or 30 mins TV"
                        className="w-full p-3 pl-10 rounded-xl border border-gray-300 focus:border-indigo-500 outline-none"
                      />
                      <CircleDollarSign
                        className="absolute left-3 top-3.5 text-gray-400"
                        size={18}
                      />
                    </div>
                  </div>

                  {/* ---------------- Card Color ---------------- */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Card Color
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {PASTEL_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setBountyColor(c)}
                          className={`w-8 h-8 rounded-full border-2 ${c.split(" ")[0]} ${
                            bountyColor === c
                              ? "border-gray-600 scale-110"
                              : "border-transparent"
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* ---------------- FCFS Toggle ---------------- */}
                  <div
                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200 cursor-pointer"
                    onClick={() => setBountyFCFS(!bountyFCFS)}
                  >
                    <div
                      className={`w-6 h-6 rounded-md flex items-center justify-center border transition-all ${
                        bountyFCFS
                          ? "bg-indigo-600 border-indigo-600"
                          : "bg-white border-gray-300"
                      }`}
                    >
                      {bountyFCFS && <Check size={16} className="text-white" />}
                    </div>
                    <div>
                      <p className="font-bold text-gray-800 text-sm">
                        First Come First Served
                      </p>
                      <p className="text-xs text-gray-500">
                        If one child claims this task, it disappears for others.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleSaveTemplate}
                className="w-full mt-6 bg-indigo-600 text-white font-bold py-3.5 rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200"
              >
                {editingId ? "Update" : "Save Template"}
              </button>

              {editingId && (
                <button
                  type="button"
                  onClick={() => handleDeleteTemplate(editingId, createMode === "bounty")}
                  className="w-full mt-2 text-red-500 font-semibold py-2"
                >
                  Delete Template
                </button>
              )}
            </div>
          </div>
        )}

        
        {/* Users Tab */}
        {tab === 'users' && (
            <div className="space-y-6">
                {!userFormView ? (
                    <>
                        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-lg text-gray-800">Family Members</h3>
                                <button onClick={() => handleOpenUserForm()} className="bg-indigo-600 text-white px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1"><UserPlus size={16}/> Add</button>
                            </div>
                            <div className="space-y-3">
                                {users.map(u => (
                                    <div key={u.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer" onClick={() => handleOpenUserForm(u)}>
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-full ${u.avatarColor} flex items-center justify-center text-white`}>
                                                {u.role === UserRole.ADMIN ? <Shield size={18}/> : <UserIcon size={18}/>}
                                            </div>
                                            <div>
                                                <p className="font-bold text-gray-800">{u.name}</p>
                                                <p className="text-xs text-gray-500">@{u.username}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            {u.role !== UserRole.ADMIN && (
                                                <button onClick={(e) => {e.stopPropagation(); setViewingRewardsForUser(u.id)}} className="text-indigo-500 p-2 hover:bg-indigo-100 rounded-lg"><Gift size={18}/></button>
                                            )}
                                            <button className="text-gray-400 p-2 rounded-lg"><Settings size={18}/></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold">{editingUser ? 'Edit Member' : 'Add Member'}</h3>
                            <button onClick={handleCloseUserView} className="text-gray-400 hover:text-gray-600"><X/></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                                <input type="text" value={newUserName} onChange={e => setNewUserName(e.target.value)} className="w-full p-3 rounded-xl border border-gray-300" placeholder="Display Name" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Username
                                </label>
                                <input
                                  type="text"
                                  value={newUserUsername}
                                  onChange={e => setNewUserUsername(e.target.value)}
                                  className="w-full p-3 rounded-xl border border-gray-300"
                                  placeholder="Username"
                                  autoCapitalize="none"
                                  autoCorrect="off"
                                  spellCheck={false}
                               />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Password {editingUser && <span className="text-xs font-normal text-gray-500">(Leave blank to keep current)</span>}</label>
                                <input type="password" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} className="w-full p-3 rounded-xl border border-gray-300" placeholder={editingUser ? "••••••" : "Password"} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                                <div className="flex gap-2">
                                    <button onClick={() => setNewUserRole(UserRole.USER)} className={`flex-1 py-2 rounded-lg border transition-colors ${newUserRole === UserRole.USER ? 'bg-indigo-100 border-indigo-500 text-indigo-700' : 'border-gray-300 text-gray-700 bg-white'}`}>Child</button>
                                    <button onClick={() => setNewUserRole(UserRole.ADMIN)} className={`flex-1 py-2 rounded-lg border transition-colors ${newUserRole === UserRole.ADMIN ? 'bg-indigo-100 border-indigo-500 text-indigo-700' : 'border-gray-300 text-gray-700 bg-white'}`}>Parent</button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Avatar Color</label>
                                <div className="flex flex-wrap gap-2">{AVATAR_COLORS.map(c => (<button key={c} onClick={() => setNewUserColor(c)} className={`w-8 h-8 rounded-full ${c} ${newUserColor === c ? 'ring-2 ring-gray-400 scale-110' : ''}`} />))}</div>
                            </div>
                            
                            <button onClick={handleSaveUser} className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl mt-4 shadow-lg hover:bg-indigo-700 transition-colors">
                                {editingUser ? 'Update Member' : 'Create Member'}
                            </button>
                            
                            {editingUser && editingUser.id !== currentUser.id && (
                                <button onClick={() => handleDeleteUser(editingUser.id)} className="w-full mt-2 text-red-500 font-semibold py-2 hover:bg-red-50 rounded-xl transition-colors">
                                    Delete User Account
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        )}
      </div>
    </div>
  );
};
