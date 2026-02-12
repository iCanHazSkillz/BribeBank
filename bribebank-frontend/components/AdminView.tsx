import React, { useState, useEffect, useRef } from 'react';
import { AssignedPrize, PrizeStatus, PrizeTemplate, User, PrizeType, UserRole, HistoryEvent, BountyTemplate, AssignedBounty, BountyStatus, AppNotification, StoreItem, WheelSegment, Family } from '../types';
import { storageService } from '../services/storageService';
import { API_BASE } from "../config";
import { PrizeCard } from './PrizeCard';
import { DeadlineDisplay } from './DeadlineDisplay';
import { Trash2, Check, X, Gift, Edit2, CheckCircle, AlertCircle, UserPlus, Shield, User as UserIcon, KeyRound, History, Plus, ListTodo, CircleDollarSign, Search, Zap, Bell, Settings, ShoppingBag, Link as Linkicon, Image as ImageIcon, Ticket, RotateCcw, Send, ArrowUp, Sun, Moon, ChevronDown, Download, Upload, HeartHandshake } from 'lucide-react';
import { SseEvent } from "../types/sseEvents";
import { useTheme } from '../contexts/ThemeContext';
import EmojiPicker from "emoji-picker-react";


interface AdminViewProps {
  currentUser: User;
  initialTab?: string;
  onUserUpdate?: () => void;
  desktopShowNotifications?: boolean;
  onDesktopNotificationsToggle?: () => void;
}

type ParsedTaskLifecycleMetadata = {
  version: 1;
  lifecycleType: "TASK";
  bountyAssignmentId: string;
  bountyId?: string;
  rewardAssignmentId?: string;
  rewardType?: "TICKETS" | "CUSTOM";
  rewardValue?: string;
  linkedAction?: string;
  denialMessage?: string;
};

const parseTaskLifecycleMetadata = (
  metadata: string | null | undefined
): ParsedTaskLifecycleMetadata | null => {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata);
    if (
      parsed &&
      parsed.version === 1 &&
      parsed.lifecycleType === "TASK" &&
      typeof parsed.bountyAssignmentId === "string"
    ) {
      return parsed as ParsedTaskLifecycleMetadata;
    }
  } catch {
    return null;
  }
  return null;
};

const TASK_LIFECYCLE_LIMIT = 8;

const TASK_ACTION_LABELS: Record<string, string> = {
  TASK_ASSIGNED: "Task assigned",
  TASK_ACCEPTED: "Task accepted",
  TASK_COMPLETED: "Marked complete",
  VERIFIED_TASK: "Task verified",
  DENIED_TASK: "Task denied",
  TASK_REFUSED: "Task refused",
  TASK_REJECTED_AFTER_DENIAL: "Denied task rejected",
  EARNED_TICKETS: "Tickets awarded",
  TASK_REWARD_GRANTED: "Reward granted",
};

const getTaskLifecycleStatus = (action: string): string => {
  switch (action) {
    case "VERIFIED_TASK":
    case "TASK_REWARD_GRANTED":
    case "EARNED_TICKETS":
      return "Verified";
    case "DENIED_TASK":
      return "Denied";
    case "TASK_COMPLETED":
      return "Awaiting review";
    case "TASK_ACCEPTED":
      return "In progress";
    case "TASK_REFUSED":
    case "TASK_REJECTED_AFTER_DENIAL":
      return "Cancelled";
    case "TASK_ASSIGNED":
    default:
      return "Assigned";
  }
};

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
];

export const AdminView: React.FC<AdminViewProps> = ({ currentUser, initialTab, onUserUpdate, desktopShowNotifications, onDesktopNotificationsToggle }) => {
  const [tab, setTab] = useState<'assign' | 'approvals' | 'create' | 'users' | 'store'>('assign');
  const [assignSubTab, setAssignSubTab] = useState<'rewards' | 'bounties' | 'tickets'>('rewards');

  // Data State
  const [users, setUsers] = useState<User[]>([]);
  const [assignments, setAssignments] = useState<AssignedPrize[]>([]);
  const [bountyAssignments, setBountyAssignments] = useState<AssignedBounty[]>([]);
  const [templates, setTemplates] = useState<PrizeTemplate[]>([]);
  const [bountyTemplates, setBountyTemplates] = useState<BountyTemplate[]>([]);
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [wheelSegments, setWheelSegments] = useState<WheelSegment[]>([]);
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [currentFamily, setCurrentFamily] = useState<Family | null>(null);
  const [tempConversionRate, setTempConversionRate] = useState<string>('10');
  const [recoveryKeyConfigured, setRecoveryKeyConfigured] = useState(false);
  const [recoveryKeyUpdatedAt, setRecoveryKeyUpdatedAt] = useState<string | null>(null);
  const [latestRecoveryKey, setLatestRecoveryKey] = useState<string | null>(null);
  const [isGeneratingRecoveryKey, setIsGeneratingRecoveryKey] = useState(false);
  const [recoveryKeyCopied, setRecoveryKeyCopied] = useState(false);
  
  // Selection & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [selectedBountyTemplateIds, setSelectedBountyTemplateIds] = useState<string[]>([]);
  const [ticketAmount, setTicketAmount] = useState('');
  
  // Store Item Form
  const [storeItemTitle, setStoreItemTitle] = useState('');
  const [storeItemCost, setStoreItemCost] = useState('');
  const [storeItemImage, setStoreItemImage] = useState('');
  const [storeItemLink, setStoreItemLink] = useState('');
  const [storeItemDescription, setStoreItemDescription] = useState('');
  const [storeItemNotifyUserIds, setStoreItemNotifyUserIds] = useState<string[]>([]);
  const [editingStoreItemId, setEditingStoreItemId] = useState<string | null>(null);
  const [showStoreItemModal, setShowStoreItemModal] = useState(false);
  
  // Create Template State
  const [createMode, setCreateMode] = useState<'reward' | 'bounty'>('reward');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createTab, setCreateTab] = useState<'rewards' | 'bounties' | 'import'>('rewards');
  
  // Import State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importType, setImportType] = useState<'rewards' | 'bounties'>('rewards');
  const [importPreview, setImportPreview] = useState<any[] | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importDuplicates, setImportDuplicates] = useState<Set<number>>(new Set()); // Track duplicate indices
  const [importSelected, setImportSelected] = useState<Set<number>>(new Set()); // Track which items are selected
  
  // Reward Form
  const [prizeTitle, setPrizeTitle] = useState('');
  const [prizeDesc, setPrizeDesc] = useState('');
  const [prizeEmoji, setPrizeEmoji] = useState('🎁');
  const [prizeColor, setPrizeColor] = useState(PASTEL_COLORS[6]);

  // Bounty Form
  const [bountyTitle, setBountyTitle] = useState('');
  const [bountyRewardType, setBountyRewardType] = useState<'CUSTOM' | 'TICKETS'>('TICKETS');
  const [bountyRewardValue, setBountyRewardValue] = useState('');
  const [bountyEmoji, setBountyEmoji] = useState('🧹');
  const [bountyFCFS, setBountyFCFS] = useState(false);
  const [bountyRequiresPhoto, setBountyRequiresPhoto] = useState(false);
  const [bountyColor, setBountyColor] = useState(PASTEL_COLORS[6]);
  const [bountyDeadlineEnabled, setBountyDeadlineEnabled] = useState(false);
  const [bountyDeadlineDays, setBountyDeadlineDays] = useState('');
  const [bountyDeadlineHours, setBountyDeadlineHours] = useState('');
  const [emojiPickerTarget, setEmojiPickerTarget] =
    useState<"prize" | "bounty" | null>(null);
  const [showPrizeEmojiPicker, setShowPrizeEmojiPicker] = useState(false);
  const [showBountyEmojiPicker, setShowBountyEmojiPicker] = useState(false);

  // Wheel Edit State
  const [showWheelEdit, setShowWheelEdit] = useState(false);
  const [wheelSpinCost, setWheelSpinCost] = useState(1);
  const [winningChance, setWinningChance] = useState(75);
  const [showAdvancedWinning, setShowAdvancedWinning] = useState(false);
  const [editWheelSegments, setEditWheelSegments] = useState<Array<{ label: string; color: string; prob: number }>>([]);

  // User Management State
  const [userFormView, setUserFormView] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [newUserName, setNewUserName] = useState('');
  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>(UserRole.USER);
  const [newUserColor, setNewUserColor] = useState(AVATAR_COLORS[0]);
  const [newUserAvatarUrl, setNewUserAvatarUrl] = useState('');

  // Image cropping state
  const [showImageCropper, setShowImageCropper] = useState(false);
  const [originalImage, setOriginalImage] = useState('');
  const [cropZoom, setCropZoom] = useState(1);
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);

  // View Rewards State
  const [viewingRewardsForUser, setViewingRewardsForUser] = useState<string | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);

  // UI State
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { theme, toggleTheme } = useTheme();

  type ConfirmOptions = {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
  };

  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const confirmResolveRef = useRef<(result: boolean) => void>();

  // Denial Modal State
  const [showDenialModal, setShowDenialModal] = useState(false);
  const [denialAssignmentId, setDenialAssignmentId] = useState<string | null>(null);
  const [selectedDenialReason, setSelectedDenialReason] = useState<'INSTRUCTIONS_NOT_FOLLOWED' | 'LOW_EFFORT' | 'NOT_COMPLETED' | 'COMPLETED_AFTER_DEADLINE'>('NOT_COMPLETED');
  const [denialNotes, setDenialNotes] = useState('');
  const [allowResubmit, setAllowResubmit] = useState(true);

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
        storeItemsFromApi,
        wheelSegmentsFromApi,
        wheelConfigFromApi,
        recoveryKeyStatus,
      ] = await Promise.all([
        storageService.getTemplates(familyId),         // Reward templates
        storageService.getAssignments(familyId),       // Assigned rewards
        storageService.getBountyTemplates(familyId),   // Bounty templates
        storageService.getBountyAssignments(familyId), // Assigned bounties
        storageService.getFamilyUsers(familyId),
        storageService.getFamilyHistory(familyId),
        storageService.getNotifications(currentUser.id),
        storageService.getStoreItems(familyId),        // Store items
        storageService.getWheelSegments(familyId),
        storageService.getWheelConfig(familyId),
        storageService.getRecoveryKeyStatus(),
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
      // Store Items
      //----------------------------------------------------
      setStoreItems(storeItemsFromApi);

      //----------------------------------------------------
      // Wheel
      //----------------------------------------------------
      setWheelSegments(wheelSegmentsFromApi);
      setWheelSpinCost(wheelConfigFromApi.spinCost);
      
      // Set current family with wheel config data
      setCurrentFamily({
        id: familyId,
        name: 'Family',
        createdAt: Date.now(),
        wheelSpinCost: wheelConfigFromApi.spinCost,
        ticketConversionRate: wheelConfigFromApi.ticketConversionRate || 10,
      });
      setTempConversionRate(String(wheelConfigFromApi.ticketConversionRate || 10));
      setRecoveryKeyConfigured(!!recoveryKeyStatus.configured);
      setRecoveryKeyUpdatedAt(recoveryKeyStatus.updatedAt ?? null);
      
      // Calculate winning chance from segments (exclude Try Again segments)
      const prizeSegments = wheelSegmentsFromApi.filter((s: any) => !s.label.toLowerCase().includes('try again'));
      const totalSegments = wheelSegmentsFromApi.length;
      if (totalSegments > 0) {
        const calculatedWinningChance = Math.round((prizeSegments.length / totalSegments) * 100);
        setWinningChance(calculatedWinningChance);
      }
      
      // Only show prize segments in edit modal (not Try Again)
      setEditWheelSegments(prizeSegments.map((s: any) => ({
        label: s.label,
        color: s.color,
        prob: s.prob
      })));

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

          case "TICKETS_GIVEN":
            refreshData();
            break;

          case "STORE_ITEM_ADDED":
          case "STORE_ITEM_UPDATED":
          case "STORE_ITEM_DELETED":
            refreshData();
            break;

          case "STORE_PURCHASE":
            refreshData();
            showToast("A child purchased a store item!", "success");
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

  // Scroll to top listener
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      // Show button after scrolling down 400px
      setShowScrollTop(container.scrollTop > 400);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    scrollContainerRef.current?.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

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

  const toggleBountyDeadline = () => {
    const nextEnabled = !bountyDeadlineEnabled;
    setBountyDeadlineEnabled(nextEnabled);

    if (nextEnabled) {
      setBountyDeadlineDays((prev) => prev || '1');
      setBountyDeadlineHours((prev) => prev || '0');
    } else {
      setBountyDeadlineDays('');
      setBountyDeadlineHours('');
    }
  };

  const resetForms = () => {
    setPrizeTitle(''); setPrizeDesc(''); setPrizeEmoji('🎁'); setPrizeColor(PASTEL_COLORS[6]);
    setBountyTitle(''); setBountyRewardType('TICKETS'); setBountyRewardValue(''); setBountyEmoji('🧹'); setBountyFCFS(false); setBountyRequiresPhoto(false); setBountyColor(PASTEL_COLORS[6]); setBountyDeadlineEnabled(false); setBountyDeadlineDays(''); setBountyDeadlineHours('');
    setStoreItemTitle(''); setStoreItemCost(''); setStoreItemImage(''); setStoreItemLink(''); setStoreItemDescription('');
    setStoreItemNotifyUserIds([]);
    setEditingId(null);
    setEditingStoreItemId(null);
    setTicketAmount('');
  };

  const handleRegenerateRecoveryKey = async () => {
    const ok = await confirm({
      title: "Rotate Family Recovery Key?",
      message:
        "This will invalidate the previous family recovery key immediately. Continue?",
      confirmLabel: "Rotate Key",
      destructive: true,
    });
    if (!ok) return;

    try {
      setIsGeneratingRecoveryKey(true);
      const result = await storageService.regenerateRecoveryKey();
      setLatestRecoveryKey(result.recoveryKey);
      setRecoveryKeyConfigured(true);
      setRecoveryKeyUpdatedAt(result.updatedAt);
      setRecoveryKeyCopied(false);
      showToast("Recovery key rotated. Save it now.", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to rotate recovery key", "error");
    } finally {
      setIsGeneratingRecoveryKey(false);
    }
  };

  const handleCopyRecoveryKey = async () => {
    if (!latestRecoveryKey) return;
    try {
      await navigator.clipboard.writeText(latestRecoveryKey);
      setRecoveryKeyCopied(true);
      setTimeout(() => setRecoveryKeyCopied(false), 2000);
    } catch {
      showToast("Failed to copy recovery key", "error");
    }
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
          await refreshData();
          resetForms();
          setEditingId(null);
          setTab("assign");
          setAssignSubTab("rewards");
          showToast("Reward template saved!", "success");
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
        if (!bountyTitle) {
          showToast("Please enter a bounty title", "error");
          return;
        }

        if (!bountyRewardValue || !bountyRewardValue.trim()) {
          if (bountyRewardType === 'TICKETS') {
            showToast("Please enter a ticket amount", "error");
          } else {
            showToast("Please enter a reward value", "error");
          }
          return;
        }

        // Validate ticket amount is a positive number
        if (bountyRewardType === 'TICKETS') {
          const ticketAmount = parseInt(bountyRewardValue);
          if (isNaN(ticketAmount)) {
            showToast("Ticket amount must be a number", "error");
            return;
          }
          if (ticketAmount <= 0) {
            showToast("Ticket amount must be a positive number", "error");
            return;
          }
        }

        // Validate and calculate deadline (days + hours)
        let deadlineHoursValue: number | null = null;

        if (bountyDeadlineEnabled) {
          const normalizedDays = bountyDeadlineDays || '1';
          const normalizedHours = bountyDeadlineHours || '0';
          const days = parseInt(normalizedDays);
          const hours = parseInt(normalizedHours);

          if (isNaN(days) || isNaN(hours)) {
            showToast("Days and hours must be valid numbers", "error");
            return;
          }
          if (days < 0 || hours < 0) {
            showToast("Days and hours cannot be negative", "error");
            return;
          }
          if (hours >= 24) {
            showToast("Hours must be less than 24 (use days instead)", "error");
            return;
          }

          deadlineHoursValue = days * 24 + hours;

          if (deadlineHoursValue < 1) {
            showToast("Deadline must be at least 1 hour", "error");
            return;
          }
        }

        const bounty: BountyTemplate = {
          id: editingId || Date.now().toString(), // numeric IDs = create
          familyId: currentUser.familyId,
          title: bountyTitle,
          emoji: bountyEmoji,
          rewardType: bountyRewardType,
          rewardValue: bountyRewardValue,
          rewardTemplateId: undefined, // not used yet
          isFCFS: bountyFCFS,
          requiresPhoto: bountyRequiresPhoto,
          themeColor: bountyColor,
          deadlineHours: deadlineHoursValue,
        };

        try {
          await storageService.saveBountyTemplate(bounty);
          await refreshData();
          resetForms();
          setEditingId(null);
          setTab("assign");
          setAssignSubTab("bounties");
          showToast("Bounty template saved!", "success");
        } catch (err) {
          console.error("Failed to save bounty template", err);
          showToast("Failed to save bounty", "error");
          return;
        }
      }
    } catch (err) {
      console.error("Save template error:", err);
      showToast("Failed to save template", "error");
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
      setCreateTab('rewards');
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
      setCreateTab('bounties');
      setEditingId(b.id);
      setBountyTitle(b.title);
      setBountyRewardType(b.rewardType || 'CUSTOM');
      setBountyRewardValue(b.rewardValue);
      setBountyEmoji(b.emoji);
      setBountyFCFS(!!b.isFCFS);
      setBountyRequiresPhoto(!!b.requiresPhoto);
      setBountyColor(b.themeColor || PASTEL_COLORS[9]);
      
      // Convert total hours to days and hours for display
      if (b.deadlineHours) {
        const totalHours = b.deadlineHours;
        const days = Math.floor(totalHours / 24);
        const hours = totalHours % 24;
        setBountyDeadlineEnabled(true);
        setBountyDeadlineDays(days > 0 ? String(days) : '');
        setBountyDeadlineHours(hours > 0 ? String(hours) : '');
      } else {
        setBountyDeadlineEnabled(false);
        setBountyDeadlineDays('');
        setBountyDeadlineHours('');
      }
      
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

  const handleOpenDenialModal = (assignmentId: string) => {
      setDenialAssignmentId(assignmentId);
      setSelectedDenialReason('NOT_COMPLETED');
      setDenialNotes('');
      setAllowResubmit(true);
      setShowDenialModal(true);
  };

  const handleDenyBounty = async () => {
      if (!denialAssignmentId) return;

      try {
          await storageService.denyBounty(denialAssignmentId, selectedDenialReason, denialNotes, allowResubmit);
          await refreshData();
          const message = allowResubmit 
            ? "Task denied. Child can resubmit." 
            : "Task cancelled. No reward assigned.";
          showToast(message, 'success');
          setShowDenialModal(false);
          setDenialAssignmentId(null);
      } catch (err) {
          console.error("Failed to deny bounty:", err);
          showToast("Failed to deny task", 'error');
      }
  };

  // User Management Logic
  const handleOpenUserForm = (user?: User) => {
      if (user) {
          setEditingUser(user);
          setNewUserName(user.name);
          setNewUserUsername(user.username);
          setNewUserRole(user.role);
          setNewUserColor(user.avatarColor);
          setNewUserAvatarUrl(user.avatarUrl || '');
          setNewUserPassword(''); // Don't show old password
      } else {
          setEditingUser(null);
          setNewUserName('');
          setNewUserUsername('');
          setNewUserPassword('');
          setNewUserRole(UserRole.USER);
          setNewUserColor(AVATAR_COLORS[0]);
          setNewUserAvatarUrl('');
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
      setNewUserAvatarUrl('');
  };

  // Image cropper functions
  const handleImageSelect = (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      showToast("Image must be less than 10MB", "error");
      return;
    }
    
    const reader = new FileReader();
    reader.onloadend = () => {
      setOriginalImage(reader.result as string);
      setCropZoom(1);
      setCropX(0);
      setCropY(0);
      setShowImageCropper(true);
    };
    reader.readAsDataURL(file);
  };

  const applyCrop = () => {
    const canvas = cropCanvasRef.current;
    if (!canvas || !originalImage) return;

    const img = new Image();
    img.onload = () => {
      const outputSize = 200;
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // The preview container is 400x400px
      const previewContainerSize = 400;
      const cropCircleRadius = 100;
      
      // Calculate how the image is displayed (object-contain behavior)
      const imgAspect = img.width / img.height;
      let renderedWidth, renderedHeight;
      
      if (imgAspect > 1) {
        renderedWidth = previewContainerSize;
        renderedHeight = previewContainerSize / imgAspect;
      } else {
        renderedHeight = previewContainerSize;
        renderedWidth = previewContainerSize * imgAspect;
      }
      
      // The image is centered in the container before transforms
      const imageLeft = (previewContainerSize - renderedWidth) / 2;
      const imageTop = (previewContainerSize - renderedHeight) / 2;
      
      // With transform: translate(X,Y) scale(Z):
      // 1. Image moves by cropX, cropY
      // 2. Image scales from its own center (after translation)
      const translatedLeft = imageLeft + cropX;
      const translatedTop = imageTop + cropY;
      
      // Calculate the zoomed (scaled) dimensions
      const zoomedWidth = renderedWidth * cropZoom;
      const zoomedHeight = renderedHeight * cropZoom;
      
      // When scaling from center, the top-left corner shifts
      // The center stays at: translatedLeft + renderedWidth/2, translatedTop + renderedHeight/2
      // After scaling, the top-left is: center - (zoomedWidth/2, zoomedHeight/2)
      const centerX = translatedLeft + renderedWidth / 2;
      const centerY = translatedTop + renderedHeight / 2;
      const finalLeft = centerX - zoomedWidth / 2;
      const finalTop = centerY - zoomedHeight / 2;
      
      // The crop circle is centered at (200, 200) in the container
      const circleCenterX = previewContainerSize / 2;
      const circleCenterY = previewContainerSize / 2;
      
      // Calculate what part of the source image corresponds to the crop circle
      const scale = img.width / zoomedWidth;
      
      // Map the circle bounds to source image coordinates
      const sourceCircleLeft = (circleCenterX - cropCircleRadius - finalLeft) * scale;
      const sourceCircleTop = (circleCenterY - cropCircleRadius - finalTop) * scale;
      const sourceCircleSize = (cropCircleRadius * 2) * scale;

      // Draw the cropped portion
      ctx.clearRect(0, 0, outputSize, outputSize);
      ctx.save();
      
      // Create circular clipping path
      ctx.beginPath();
      ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      
      ctx.drawImage(
        img,
        sourceCircleLeft, sourceCircleTop, sourceCircleSize, sourceCircleSize,
        0, 0, outputSize, outputSize
      );
      
      ctx.restore();

      // Convert to base64
      const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setNewUserAvatarUrl(croppedDataUrl);
      setShowImageCropper(false);
    };
    img.src = originalImage;
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
          avatarUrl: newUserAvatarUrl || null,
          ...(newUserPassword ? { password: newUserPassword } : {}),
        } as any);
        showToast("User updated successfully", "success");
        
        // If admin updated themselves, refresh their session
        if (editingUser.id === currentUser.id && onUserUpdate) {
          onUserUpdate();
        }
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
          newUserColor,
          newUserAvatarUrl || undefined
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

  // Template Export/Import
  const handleExportTemplate = async (type: 'rewards' | 'bounties', exportType: 'selected' | 'all' = 'selected') => {
    try {
      showToast(`Exporting ${type}...`, 'success');
      const blob = await storageService.exportTemplate(type);
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const dateTime = `${year}${month}${day}_${hours}${minutes}`;
      link.download = `bribebank-${type}-${dateTime}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      showToast(`${type} exported successfully`, 'success');
    } catch (error: any) {
      showToast(error.message || `Failed to export ${type}`, 'error');
    }
  };

  const handleImportFile = async (file: File) => {
    try {
      if (!file.name.endsWith('.json')) {
        showToast('Please select a JSON file', 'error');
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        showToast('File must be less than 5MB', 'error');
        return;
      }

      const text = await file.text();
      const importData = JSON.parse(text);
      console.log('[Import] Parsed file:', JSON.stringify(importData, null, 2));

      // Validate basic structure
      if (!importData.type || !importData.items || !Array.isArray(importData.items)) {
        showToast('Invalid template file format', 'error');
        return;
      }

      setImportType(importData.type);
      setImportPreview(importData.items);
      
      // Detect duplicates - match same criteria as backend
      const duplicates = new Set<number>();
      const existingItems = importData.type === 'rewards' ? templates : bountyTemplates;
      
      importData.items.forEach((item: any, idx: number) => {
        const isDuplicate = existingItems.some((existing: any) => {
          // For rewards: match on title, emoji, description, themeColor
          // For bounties: match on title, emoji, description (empty), themeColor
          return (
            existing.title === item.name &&
            existing.emoji === item.icon &&
            (existing.description || '') === (item.description || '') &&
            existing.themeColor === item.color
          );
        });
        if (isDuplicate) {
          duplicates.add(idx);
        }
      });
      
      setImportDuplicates(duplicates);
      
      // Initially select all non-duplicate items
      const selected = new Set<number>();
      importData.items.forEach((_: any, idx: number) => {
        if (!duplicates.has(idx)) {
          selected.add(idx);
        }
      });
      setImportSelected(selected);
      
      setImportErrors([]);
      setShowImportModal(true);
    } catch (error: any) {
      showToast(error.message || 'Failed to read file', 'error');
    }
  };

  const handleConfirmImport = async () => {
    if (!importPreview) return;

    setIsImporting(true);
    try {
      // Only send selected items
      const selectedItems = importPreview.filter((_, idx) => importSelected.has(idx));
      
      if (selectedItems.length === 0) {
        showToast('Please select at least one item to import', 'warning');
        setIsImporting(false);
        return;
      }
      
      const payload = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        type: importType,
        items: selectedItems,
      };
      console.log('[Import] Sending payload:', JSON.stringify(payload, null, 2));
      
      const result = await storageService.importTemplate(payload);

      if (result.errors && result.errors.length > 0) {
        setImportErrors(result.errors);
        showToast(`${result.imported} items imported with ${result.errors.length} errors`, 'success');
      } else {
        showToast(`Successfully imported ${result.imported} ${importType}`, 'success');
        setShowImportModal(false);
      }

      await refreshData();
    } catch (error: any) {
      showToast(error.message || `Failed to import ${importType}`, 'error');
    } finally {
      setIsImporting(false);
    }
  };

  // Wheel Management
  const handleOpenWheelEdit = () => {
    // Filter out Try Again and Not this time segments - only show actual prizes
    const prizeSegments = wheelSegments.filter(s => 
      !s.label.toLowerCase().includes('try again') && 
      !s.label.toLowerCase().includes('not this time')
    );
    setEditWheelSegments(prizeSegments.map(s => ({ label: s.label, color: '', prob: 0 })));
    setShowWheelEdit(true);
  };

  const handleSaveWheel = async () => {
    try {
      // Eye-catching alternating colors for teens
      const WHEEL_COLORS = [
        '#FF6B6B', // Coral Red
        '#4ECDC4', // Turquoise
        '#FFD93D', // Bright Yellow
        '#6BCB77', // Mint Green
        '#A78BFA', // Purple
        '#FB923C', // Orange
        '#F472B6', // Pink
        '#60A5FA', // Sky Blue
        '#FBBF24', // Amber
        '#34D399', // Emerald
      ];
      
      const TRY_AGAIN_COLOR = '#9CA3AF'; // Gray for Try Again
      
      // Calculate how many Try Again segments we need
      const prizeCount = editWheelSegments.length;
      const winningDecimal = winningChance / 100;
      
      // If winning chance is X%, then prize segments / total segments = X/100
      // So: total segments = prize segments / (X/100)
      const totalSegmentsNeeded = prizeCount / winningDecimal;
      const tryAgainCount = Math.round(totalSegmentsNeeded - prizeCount);
      const totalSegments = prizeCount + tryAgainCount;
      const MAX_TOTAL_SEGMENTS = 50;
      
      // Validate total segments
      if (totalSegments > MAX_TOTAL_SEGMENTS) {
        showToast(`Too many segments (${totalSegments})! Reduce prizes or increase winning chance. Max: ${MAX_TOTAL_SEGMENTS}`, 'error');
        return;
      }
      
      // Build final segments list with alternating pattern
      const finalSegments = [];
      
      // Interleave prizes and Try Again segments for better visual distribution
      if (tryAgainCount === 0) {
        // No Try Again segments, just add all prizes
        editWheelSegments.forEach((seg, i) => {
          finalSegments.push({
            label: seg.label,
            color: WHEEL_COLORS[i % WHEEL_COLORS.length],
            prob: 0
          });
        });
      } else if (prizeCount === 0) {
        // Only Try Again segments
        for (let i = 0; i < tryAgainCount; i++) {
          finalSegments.push({
            label: 'Try Again',
            color: TRY_AGAIN_COLOR,
            prob: 0
          });
        }
      } else {
        // Evenly space prizes with Try Again segments between them
        // Example: 8 prizes + 32 Try Again = 1 prize, 4 Try Again, 1 prize, 4 Try Again, etc.
        
        // Calculate base number of Try Again per prize and remainder
        const basePerPrize = Math.floor(tryAgainCount / prizeCount);
        const remainder = tryAgainCount % prizeCount;
        
        for (let i = 0; i < prizeCount; i++) {
          // Add prize
          finalSegments.push({
            label: editWheelSegments[i].label,
            color: WHEEL_COLORS[i % WHEEL_COLORS.length],
            prob: 0
          });
          
          // Distribute remainder evenly across prizes
          // First 'remainder' prizes get one extra Try Again segment
          const tryAgainToAdd = basePerPrize + (i < remainder ? 1 : 0);
          
          // Add Try Again segments
          for (let j = 0; j < tryAgainToAdd; j++) {
            finalSegments.push({
              label: 'Try Again',
              color: TRY_AGAIN_COLOR,
              prob: 0
            });
          }
        }
      }
      
      // Assign equal probabilities to all segments
      const equalProb = 1.0 / finalSegments.length;
      finalSegments.forEach(seg => seg.prob = equalProb);
      
      await storageService.updateWheelSegments(currentUser.familyId, finalSegments, wheelSpinCost);
      await refreshData();
      setShowWheelEdit(false);
      showToast("Wheel updated!", 'success');
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const handleResetWheel = async () => {
    if (window.confirm("Reset wheel to defaults?")) {
      try {
        await storageService.resetWheelSegments(currentUser.familyId);
        await refreshData();
        setShowWheelEdit(false);
        showToast("Wheel reset!", 'success');
      } catch (e: any) {
        showToast(e.message, 'error');
      }
    }
  };

  // Store Item Management
  const handleOpenStoreItemModal = (item?: StoreItem) => {
    if (item) {
      // Editing existing item
      setEditingStoreItemId(item.id);
      setStoreItemTitle(item.title);
      setStoreItemCost(item.cost.toString());
      setStoreItemImage(item.imageUrl || '');
      setStoreItemLink(item.productUrl || '');
      setStoreItemDescription(item.description || '');
      setStoreItemNotifyUserIds([]);
    } else {
      // Adding new item
      resetForms();
    }
    setShowStoreItemModal(true);
  };

  const handleSaveStoreItem = async () => {
    try {
      if (!storeItemTitle || !storeItemCost) {
        showToast("Title and Cost are required", "error");
        return;
      }

      const cost = parseInt(storeItemCost);
      if (isNaN(cost) || cost <= 0) {
        showToast("Cost must be a positive number", "error");
        return;
      }

      const item: StoreItem = {
        id: editingStoreItemId || Date.now().toString(),
        familyId: currentUser.familyId,
        title: storeItemTitle,
        cost,
        description: storeItemDescription || undefined,
        imageUrl: storeItemImage || undefined,
        productUrl: storeItemLink || undefined,
      };

      await storageService.saveStoreItem(
        item,
        editingStoreItemId ? [] : storeItemNotifyUserIds
      );
      showToast("Store item saved!", "success");
      setShowStoreItemModal(false);
      resetForms();
      await refreshData();
    } catch (err) {
      console.error("Failed to save store item", err);
      showToast("Failed to save store item", "error");
    }
  };

  const handleEditStoreItem = (item: StoreItem) => {
    handleOpenStoreItemModal(item);
  };

  const handleDeleteStoreItem = async (id: string) => {
    const ok = await confirm({
      title: "Delete Store Item?",
      message: "Remove this item from the store? This cannot be undone.",
      confirmLabel: "Delete Item",
      cancelLabel: "Cancel",
      destructive: true,
    });

    if (!ok) return;

    try {
      await storageService.deleteStoreItem(id);
      showToast("Store item deleted", "success");
      await refreshData();
    } catch (err) {
      console.error("Failed to delete store item", err);
      showToast("Failed to delete store item", "error");
    }
  };

  // Ticket Management
  const handleGiveTickets = async () => {
    try {
      if (selectedUsers.length === 0) {
        showToast("Select at least one child", "error");
        return;
      }

      const amount = parseInt(ticketAmount);
      if (isNaN(amount) || amount <= 0) {
        showToast("Enter a valid ticket amount", "error");
        return;
      }

      for (const userId of selectedUsers) {
        await storageService.giveTickets(userId, amount);
      }

      showToast(`Gave ${amount} tickets to ${selectedUsers.length} child(ren)!`, "success");
      setTicketAmount('');
      setSelectedUsers([]);
      await refreshData();
    } catch (err) {
      console.error("Failed to give tickets", err);
      showToast("Failed to give tickets", "error");
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
  const storeNotifyUsers = assignableUsers;

  const filteredTemplates = templates.filter(t => t.title.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredBounties = bountyTemplates.filter(b => b.title.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredStoreItems = storeItems.filter(item => 
    item.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (item.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
  );

  const taskLifecycleBuckets = new Map<
    string,
    {
      bountyAssignmentId: string;
      bountyId?: string;
      rewardAssignmentId?: string;
      events: Array<HistoryEvent & { parsedMetadata: ParsedTaskLifecycleMetadata }>;
    }
  >();
  const legacyHistoryEvents: HistoryEvent[] = [];

  history.forEach((event) => {
    const parsedMetadata = parseTaskLifecycleMetadata(event.metadata);
    if (!parsedMetadata) {
      legacyHistoryEvents.push(event);
      return;
    }

    const existing = taskLifecycleBuckets.get(parsedMetadata.bountyAssignmentId);
    if (!existing) {
      taskLifecycleBuckets.set(parsedMetadata.bountyAssignmentId, {
        bountyAssignmentId: parsedMetadata.bountyAssignmentId,
        bountyId: parsedMetadata.bountyId,
        rewardAssignmentId: parsedMetadata.rewardAssignmentId,
        events: [{ ...event, parsedMetadata }],
      });
      return;
    }

    existing.events.push({ ...event, parsedMetadata });
    if (!existing.rewardAssignmentId && parsedMetadata.rewardAssignmentId) {
      existing.rewardAssignmentId = parsedMetadata.rewardAssignmentId;
    }
  });

  const recentTaskLifecycles = Array.from(taskLifecycleBuckets.values())
    .map((bucket) => {
      const events = [...bucket.events].sort((a, b) => a.timestamp - b.timestamp);
      const latestEvent = events[events.length - 1];

      const rewardEvent =
        [...events]
          .reverse()
          .find(
            (event) =>
              event.action === "TASK_REWARD_GRANTED" ||
              event.action === "EARNED_TICKETS" ||
              (event.action === "VERIFIED_TASK" &&
                !!event.parsedMetadata.rewardType &&
                !!event.parsedMetadata.rewardValue)
          ) || null;

      let rewardSummary: string | null = null;
      if (rewardEvent?.parsedMetadata.rewardType === "TICKETS") {
        rewardSummary = `+${rewardEvent.parsedMetadata.rewardValue || "0"} tickets`;
      } else if (rewardEvent?.parsedMetadata.rewardType === "CUSTOM") {
        rewardSummary = `Reward granted: ${rewardEvent.parsedMetadata.rewardValue || rewardEvent.title}`;
      }

      const expectedRewardMeta = events.find((event) => !!event.parsedMetadata.rewardValue)?.parsedMetadata;
      const expectedReward =
        expectedRewardMeta?.rewardType === "TICKETS"
          ? `${expectedRewardMeta.rewardValue || "0"} tickets`
          : expectedRewardMeta?.rewardValue || null;

      return {
        ...bucket,
        events,
        latestTimestamp: latestEvent?.timestamp || 0,
        latestStatus: getTaskLifecycleStatus(latestEvent?.action || "TASK_ASSIGNED"),
        taskTitle:
          events.find((event) => event.action !== "EARNED_TICKETS" && event.action !== "TASK_REWARD_GRANTED")?.title ||
          latestEvent?.title ||
          "Task",
        taskEmoji:
          events.find((event) => event.action !== "EARNED_TICKETS" && event.action !== "TASK_REWARD_GRANTED")?.emoji ||
          latestEvent?.emoji ||
          "🧹",
        childName: latestEvent?.userName || "Child",
        rewardSummary,
        expectedReward,
      };
    })
    .sort((a, b) => b.latestTimestamp - a.latestTimestamp)
    .slice(0, TASK_LIFECYCLE_LIMIT);

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
    <div className="pb-24 lg:pb-0 relative min-h-screen lg:flex dark:bg-gray-900" ref={scrollContainerRef}>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:top-16 lg:bottom-0 lg:bg-white dark:lg:bg-gray-800 lg:border-r lg:border-gray-200 dark:lg:border-gray-700">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Admin</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Dashboard</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {[
            { id: 'assign', label: 'Assign', icon: Send },
            { id: 'approvals', label: 'Approvals', icon: CheckCircle, badge: totalPending },
            { id: 'create', label: 'Create', icon: Plus },
            { id: 'store', label: 'Store', icon: ShoppingBag },
            { id: 'users', label: 'Family', icon: UserIcon }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id as any); resetForms(); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${tab === t.id ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
            >
              <t.icon size={20} />
              <span className="font-semibold">{t.label}</span>
              {t.badge && t.badge > 0 && (
                <span className={`ml-auto min-w-[24px] h-6 flex items-center justify-center text-xs font-bold rounded-full px-2 ${tab === t.id ? 'bg-white text-indigo-600' : 'bg-red-500 text-white'}`}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="lg:ml-64 flex-1">
        {/* Toast */}
        {toast && (
            <div className="fixed top-4 left-1/2 lg:left-[calc(50%+8rem)] transform -translate-x-1/2 z-[60] w-[90%] max-w-sm animate-bounce-in">
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
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Choose an icon
              </h4>
              <button
                type="button"
                onClick={() => setEmojiPickerTarget(null)}
                className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
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

      {/* Wheel Edit Modal */}
      {showWheelEdit && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4" onClick={() => setShowWheelEdit(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-2xl font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
              <RotateCcw size={28} className="text-purple-600 dark:text-purple-400" />
              Manage Prize Wheel
            </h3>
            
            {/* Spin Cost */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Spin Cost (Tickets)</label>
              <input
                type="number"
                value={wheelSpinCost}
                onChange={e => setWheelSpinCost(parseInt(e.target.value) || 1)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-purple-500"
                min="0"
              />
            </div>

            {/* Winning Chance */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Winning Chance</label>
              
              {/* Preset Buttons */}
              <div className="grid grid-cols-3 gap-3 mb-3">
                <button
                  type="button"
                  onClick={() => { setWinningChance(75); setShowAdvancedWinning(false); }}
                  className={`py-3 px-4 rounded-lg border-2 transition-all ${
                    winningChance === 75 && !showAdvancedWinning
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 font-bold'
                      : 'border-gray-300 dark:border-gray-600 hover:border-green-400 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <div className="text-2xl mb-1">🎉</div>
                  <div className="text-sm font-medium">Easy</div>
                  <div className="text-xs text-gray-500">75%</div>
                </button>
                <button
                  type="button"
                  onClick={() => { setWinningChance(50); setShowAdvancedWinning(false); }}
                  className={`py-3 px-4 rounded-lg border-2 transition-all ${
                    winningChance === 50 && !showAdvancedWinning
                      ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 font-bold'
                      : 'border-gray-300 dark:border-gray-600 hover:border-yellow-400 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <div className="text-2xl mb-1">⚖️</div>
                  <div className="text-sm font-medium">Balanced</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">50%</div>
                </button>
                <button
                  type="button"
                  onClick={() => { setWinningChance(25); setShowAdvancedWinning(false); }}
                  className={`py-3 px-4 rounded-lg border-2 transition-all ${
                    winningChance === 25 && !showAdvancedWinning
                      ? 'border-red-500 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-bold'
                      : 'border-gray-300 dark:border-gray-600 hover:border-red-400 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <div className="text-2xl mb-1">🎲</div>
                  <div className="text-sm font-medium">Hard</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">25%</div>
                </button>
              </div>
              
              {/* Advanced Toggle */}
              <button
                type="button"
                onClick={() => setShowAdvancedWinning(!showAdvancedWinning)}
                className="text-sm text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-medium mb-2 flex items-center gap-1"
              >
                {showAdvancedWinning ? '▼' : '▶'} Advanced (Fine-tune percentage)
              </button>
              
              {/* Advanced Slider */}
              {showAdvancedWinning && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <input
                    type="range"
                    value={winningChance}
                    onChange={e => setWinningChance(parseInt(e.target.value))}
                    className="flex-1 h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-purple-600 dark:accent-purple-400"
                    min="1"
                    max="100"
                  />
                  <input
                    type="number"
                    value={winningChance}
                    onChange={e => {
                      const val = parseInt(e.target.value) || 50;
                      setWinningChance(Math.max(1, Math.min(100, val)));
                    }}
                    className="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg text-center font-bold text-purple-600 dark:text-purple-400"
                    min="1"
                    max="100"
                  />
                  <span className="text-sm text-gray-500 dark:text-gray-400">%</span>
                </div>
              )}
              
              <p className="text-xs text-purple-600 font-medium mt-1">
                {(() => {
                  const prizeCount = editWheelSegments.length;
                  if (prizeCount === 0) return 'Add prize segments to see calculation';
                  const winningDecimal = winningChance / 100;
                  const totalSegmentsNeeded = prizeCount / winningDecimal;
                  const tryAgainCount = Math.max(0, Math.round(totalSegmentsNeeded - prizeCount));
                  const totalSegments = prizeCount + tryAgainCount;
                  const maxSegments = 50;
                  
                  if (totalSegments > maxSegments) {
                    return (
                      <span className="text-red-600">
                        ⚠️ Too many segments ({totalSegments})! Reduce prizes or increase winning chance. Max: {maxSegments}
                      </span>
                    );
                  }
                  
                  const segmentText = `${tryAgainCount} "Try Again" segment${tryAgainCount !== 1 ? 's' : ''} will be added (${totalSegments} total segments)`;
                  
                  if (totalSegments > 40) {
                    return <span className="text-orange-600">⚠️ {segmentText} - Consider reducing for better UX</span>;
                  }
                  
                  return segmentText;
                })()}
              </p>
            </div>

            {/* Segments */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Prize Segments</label>
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                "Try Again" segments will be auto-added based on winning chance ({100 - winningChance}% chance)
              </div>
              <div className="space-y-2 mb-4">
                {editWheelSegments.map((seg, i) => (
                  <div key={i} className="flex gap-2 items-center bg-gray-50 dark:bg-gray-700 p-2 rounded-lg">
                    <span className="text-gray-500 dark:text-gray-400 font-mono text-xs sm:text-sm w-6 sm:w-8 flex-shrink-0">{i + 1}.</span>
                    <input
                      type="text"
                      value={seg.label}
                      onChange={e => {
                        const updated = [...editWheelSegments];
                        updated[i].label = e.target.value;
                        setEditWheelSegments(updated);
                      }}
                      className="flex-1 min-w-0 px-2 sm:px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg text-sm"
                      placeholder="Prize name"
                    />
                    <button
                      onClick={() => setEditWheelSegments(editWheelSegments.filter((_, idx) => idx !== i))}
                      className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors flex-shrink-0"
                      disabled={editWheelSegments.length <= 1}
                      title="Remove segment"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setEditWheelSegments([...editWheelSegments, { label: 'New Prize', color: '', prob: 0 }])}
                disabled={editWheelSegments.length >= 12}
                className={`w-full py-2 border-2 border-dashed rounded-lg flex items-center justify-center gap-2 font-medium transition-colors ${
                  editWheelSegments.length >= 12
                    ? 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                    : 'border-purple-300 dark:border-purple-600 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30'
                }`}
              >
                <Plus size={18} />
                {editWheelSegments.length >= 12 ? 'Maximum 12 prizes' : 'Add Prize'}
              </button>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={handleResetWheel} className="flex-1 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors font-medium">
                Reset to Defaults
              </button>
              <button onClick={() => setShowWheelEdit(false)} className="flex-1 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors font-medium">
                Cancel
              </button>
              <button onClick={handleSaveWheel} className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-xl font-bold hover:scale-[1.02] transition-transform">
                Save Wheel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Store Item Modal */}
      {showStoreItemModal && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => {
            setShowStoreItemModal(false);
            resetForms();
          }}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white p-6 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-3 rounded-2xl">
                  <ShoppingBag size={28} />
                </div>
                <h2 className="text-2xl font-bold">
                  {editingStoreItemId ? 'Edit Store Item' : 'Add Store Item'}
                </h2>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Item Title *</label>
                <input
                  type="text"
                  value={storeItemTitle}
                  onChange={(e) => setStoreItemTitle(e.target.value)}
                  placeholder="e.g. LEGO Star Wars Set"
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Ticket Cost *</label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    value={storeItemCost}
                    onChange={(e) => setStoreItemCost(e.target.value)}
                    placeholder="e.g. 50"
                    className="w-full p-3 pl-10 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  />
                  <Ticket size={20} className="absolute left-3 top-3.5 text-purple-400 dark:text-purple-300" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Description</label>
                <textarea
                  value={storeItemDescription}
                  onChange={(e) => setStoreItemDescription(e.target.value)}
                  placeholder="Optional description for the item..."
                  rows={3}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Item Image</label>
                
                {storeItemImage && (
                  <div className="mb-3 relative">
                    <img 
                      src={storeItemImage} 
                      alt="Preview" 
                      className="w-32 h-32 object-cover rounded-xl border-2 border-gray-200 dark:border-gray-600"
                    />
                    <button
                      onClick={() => setStoreItemImage('')}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1.5 hover:bg-red-600 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
                
                <div className="flex gap-2">
                  <input
                    type="file"
                    id="store-item-upload"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (file.size > 10 * 1024 * 1024) {
                          showToast("Image must be less than 10MB", "error");
                          return;
                        }
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          setStoreItemImage(reader.result as string);
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                  <label
                    htmlFor="store-item-upload"
                    className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer transition-colors"
                  >
                    <ImageIcon size={16} />
                    Upload Image
                  </label>
                  
                  <div className="flex-1 relative">
                    <input
                      type="url"
                      value={storeItemImage.startsWith('data:') ? '' : storeItemImage}
                      onChange={(e) => setStoreItemImage(e.target.value)}
                      placeholder="Or paste image URL..."
                      className="w-full p-2 pl-9 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                    />
                    <Linkicon size={16} className="absolute left-2.5 top-2.5 text-gray-400 dark:text-gray-500" />
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Upload an image or provide a URL</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Product Link</label>
                <div className="relative">
                  <input
                    type="url"
                    value={storeItemLink}
                    onChange={(e) => setStoreItemLink(e.target.value)}
                    placeholder="https://..."
                    className="w-full p-3 pl-10 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  />
                  <Linkicon size={20} className="absolute left-3 top-3.5 text-gray-400 dark:text-gray-500" />
                </div>
              </div>

              {!editingStoreItemId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                    Notify Family Members (Optional)
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    Selected users get a push notification when this item is created.
                  </p>
                  <div className="overflow-x-auto no-scrollbar">
                    <div className="flex gap-3 px-1 py-1">
                      {storeNotifyUsers.map((user) => {
                        const isSelected = storeItemNotifyUserIds.includes(user.id);

                        return (
                          <button
                            key={user.id}
                            onClick={() =>
                              setStoreItemNotifyUserIds((prev) =>
                                prev.includes(user.id)
                                  ? prev.filter((id) => id !== user.id)
                                  : [...prev, user.id]
                              )
                            }
                            className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-all shadow-sm ${
                              isSelected
                                ? "bg-indigo-50 dark:bg-indigo-900/30 ring-2 ring-indigo-200 dark:ring-indigo-700"
                                : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                            }`}
                          >
                            {user.avatarUrl ? (
                              <div className="relative w-8 h-8">
                                <img
                                  src={user.avatarUrl}
                                  alt={user.name}
                                  className="w-8 h-8 rounded-full object-cover"
                                />
                                {isSelected && (
                                  <div className="absolute inset-0 bg-indigo-600/80 rounded-full flex items-center justify-center">
                                    <Check size={16} className="text-white" />
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div
                                className={`w-8 h-8 rounded-full ${user.avatarColor} flex items-center justify-center`}
                              >
                                {isSelected && <Check size={16} className="text-white" />}
                              </div>
                            )}
                            <span
                              className={`font-semibold ${
                                isSelected ? "text-indigo-700 dark:text-indigo-300" : "text-gray-700 dark:text-gray-300"
                              }`}
                            >
                              {user.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowStoreItemModal(false);
                    resetForms();
                  }}
                  className="flex-1 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveStoreItem}
                  className="flex-1 py-3 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white rounded-xl font-bold hover:scale-[1.02] transition-transform shadow-lg"
                >
                  {editingStoreItemId ? 'Update Item' : 'Add to Store'}
                </button>
              </div>
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
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
              {confirmState.title}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              {confirmState.message}
            </p>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
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
                    ? "bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700"
                    : "bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700")
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
            <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-between items-center">
                    <h3 className="font-bold text-gray-800 dark:text-white">Rewards for {users.find(u => u.id === viewingRewardsForUser)?.name}</h3>
                    <button onClick={() => setViewingRewardsForUser(null)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"><X size={24}/></button>
                </div>
                <div className="p-4 overflow-y-auto space-y-3">
                    {rewardsForViewingUser.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 dark:text-gray-500">
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
                                    className={`bg-white dark:bg-gray-700 p-3 rounded-2xl border border-gray-200 dark:border-gray-600 flex justify-between items-center shadow-sm`}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-2xl">{emoji}</span>
                                        <div>
                                            <p className="font-bold text-gray-800 dark:text-white text-sm">
                                                {title}
                                            </p>
                                            {description && (
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    {description}
                                                </p>
                                            )}
                                            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
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
                                        className="text-red-400 dark:text-red-500 p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full"
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

      {/* Notification Panel - Global */}
      {(showNotifications || desktopShowNotifications) && (
        <div className="fixed inset-0 bg-black/20 z-[60] lg:bg-transparent" onClick={() => {
          if (window.innerWidth < 1024) {
            setShowNotifications(false);
          } else {
            onDesktopNotificationsToggle?.();
          }
        }}>
          <div 
            className="absolute right-4 top-20 lg:right-8 lg:top-24 w-80 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
              <h3 className="font-bold text-sm text-gray-700 dark:text-gray-200">Notifications</h3>
              <div className="flex gap-2">
                {notifications.length > 0 && (
                  <button onClick={handleClearAllNotifications} className="text-xs text-indigo-600 font-semibold hover:text-indigo-800">Clear All</button>
                )}
                <button onClick={() => {
                  if (window.innerWidth < 1024) {
                    setShowNotifications(false);
                  } else {
                    onDesktopNotificationsToggle?.();
                  }
                }} className="text-gray-400 hover:text-gray-600"><X size={16}/></button>
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto p-2">
              {notifications.length === 0 ? (
                <p className="text-center text-gray-400 dark:text-gray-500 text-sm py-4">No new notifications</p>
              ) : (
                notifications.map(note => (
                  <div key={note.id} className="p-3 mb-1 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 rounded-xl border border-gray-100 dark:border-gray-600 transition-colors relative group">
                    <p className="text-sm text-gray-800 dark:text-gray-200 pr-6">{note.message}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{new Date(note.timestamp).toLocaleTimeString()}</p>
                    <button onClick={(e) => { e.stopPropagation(); handleDismissNotification(note.id); }} className="absolute top-2 right-2 text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"><X size={14}/></button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <header className="bg-white dark:bg-gray-800 sticky top-0 z-50 shadow-sm px-6 py-4 flex justify-between items-center lg:hidden">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Admin Dashboard</h2>
        <div className="flex items-center gap-3">
            {totalPending > 0 && (
            <span className="bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 text-xs font-bold px-3 py-1 rounded-full animate-pulse">{totalPending} Pending</span>
            )}
            
            <button
              onClick={toggleTheme}
              className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            
            <button onClick={() => setShowNotifications(!showNotifications)} className="relative p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
              <Bell size={24} />
              {notifications.length > 0 && <span className="absolute top-1 right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></span>}
            </button>
        </div>
      </header>

      {/* Mobile Tabs */}
      <div className="flex p-4 gap-2 justify-around lg:hidden bg-gray-50 dark:bg-gray-900">
        {[
            { id: 'assign', label: 'Assign', icon: Send },
            { id: 'approvals', label: `${totalPending}`, fullLabel: 'Approvals', icon: CheckCircle },
            { id: 'create', label: 'Create', icon: Plus },
            { id: 'store', label: 'Store', icon: ShoppingBag },
            { id: 'users', label: 'Family', icon: UserIcon }
        ].map(t => (
            <button 
                key={t.id}
                onClick={() => { setTab(t.id as any); resetForms(); }}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl flex-1 transition-colors ${tab === t.id ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}
                title={t.fullLabel || t.label}
            >
                <div className="relative">
                    <t.icon size={20} />
                    {t.id === 'approvals' && totalPending > 0 && (
                        <span className={`absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center text-[10px] font-bold rounded-full px-1 ${tab === t.id ? 'bg-white text-indigo-600' : 'bg-red-500 text-white'}`}>
                            {totalPending}
                        </span>
                    )}
                </div>
                <span className="text-xs font-semibold">{t.id === 'approvals' ? 'Approvals' : t.label}</span>
            </button>
        ))}
      </div>

      {/* Desktop Header */}
      <div className="hidden lg:block bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
              {tab === 'assign' && 'Assign Rewards & Tasks'}
              {tab === 'approvals' && 'Pending Approvals'}
              {tab === 'create' && 'Create Templates'}
              {tab === 'store' && 'Store Management'}
              {tab === 'users' && 'Family Members'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {tab === 'assign' && 'Distribute rewards, tasks, and tickets to family members'}
              {tab === 'approvals' && 'Review and approve pending requests'}
              {tab === 'create' && 'Build reward and task templates'}
              {tab === 'store' && 'Manage store items and prize wheel'}
              {tab === 'users' && 'Manage family members and settings'}
            </p>
          </div>
          {totalPending > 0 && tab !== 'approvals' && (
            <span className="bg-amber-100 text-amber-800 text-sm font-bold px-4 py-2 rounded-full">
              {totalPending} Pending
            </span>
          )}
        </div>
      </div>

      <div className="px-4 lg:px-8 lg:py-6 lg:max-w-7xl lg:mx-auto">
        {tab === 'assign' && (
          <>
            {/* Sub Tabs */}
            <div className="flex gap-2 mb-6 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                <button 
                  onClick={() => setAssignSubTab('rewards')} 
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                    assignSubTab === 'rewards' 
                      ? 'bg-white dark:bg-gray-600 shadow-sm text-indigo-600 dark:text-indigo-400' 
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  Give Rewards
                </button>
                <button 
                  onClick={() => setAssignSubTab('bounties')} 
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                    assignSubTab === 'bounties' 
                      ? 'bg-white dark:bg-gray-600 shadow-sm text-indigo-600 dark:text-indigo-400' 
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  Assign Tasks
                </button>
                <button 
                  onClick={() => setAssignSubTab('tickets')} 
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                    assignSubTab === 'tickets' 
                      ? 'bg-white dark:bg-gray-600 shadow-sm text-indigo-600 dark:text-indigo-400' 
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  Give Tickets
                </button>
            </div>

            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
              Select Family Members
            </label>
            <div className="mb-6 overflow-x-auto no-scrollbar">
              <div className="flex gap-4 px-1 py-1">
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
                          ? "bg-indigo-50 dark:bg-indigo-900/30 ring-2 ring-indigo-200 dark:ring-indigo-700"
                          : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                      }`}
                    >
                      {user.avatarUrl ? (
                        <div className="relative w-8 h-8">
                          <img 
                            src={user.avatarUrl} 
                            alt={user.name}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                          {isSelected && (
                            <div className="absolute inset-0 bg-indigo-600/80 rounded-full flex items-center justify-center">
                              <Check size={16} className="text-white" />
                            </div>
                          )}
                        </div>
                      ) : (
                        <div
                          className={`w-8 h-8 rounded-full ${user.avatarColor} flex items-center justify-center`}
                        >
                          {isSelected && <Check size={16} className="text-white" />}
                        </div>
                      )}
                      <span
                        className={`font-semibold ${
                          isSelected ? "text-indigo-700 dark:text-indigo-300" : "text-gray-700 dark:text-gray-300"
                        }`}
                      >
                        {user.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Conditional rendering based on subtab */}
            {assignSubTab === 'rewards' ? (
                <>
                    {/* Search Bar */}
                    <div className="mb-4 relative">
                        <input 
                            type="text" 
                            placeholder="Search rewards..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-10 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-all text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                        />
                        <Search className="absolute left-3 top-3.5 text-gray-400 dark:text-gray-500" size={20}/>
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        )}
                    </div>
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
                </>
            ) : assignSubTab === 'bounties' ? (
                <>
                    {/* Search Bar */}
                    <div className="mb-4 relative">
                        <input 
                            type="text" 
                            placeholder="Search tasks..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-10 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-700 focus:border-indigo-500 dark:focus:border-indigo-400 outline-none transition-all text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                        />
                        <Search className="absolute left-3 top-3.5 text-gray-400 dark:text-gray-500" size={20}/>
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="absolute right-3 top-3.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        )}
                    </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-24">
                    {filteredBounties.length === 0 && <div className="col-span-2 text-center text-gray-400 dark:text-gray-500 py-8 italic">No task templates found.</div>}
                    {filteredBounties.map(b => {
                        // Format deadline for display
                        let deadlineText = '';
                        if (b.deadlineHours) {
                            const days = Math.floor(b.deadlineHours / 24);
                            const hours = b.deadlineHours % 24;
                            if (days > 0 && hours > 0) {
                                deadlineText = `${days}d ${hours}h deadline`;
                            } else if (days > 0) {
                                deadlineText = `${days}d deadline`;
                            } else {
                                deadlineText = `${hours}h deadline`;
                            }
                        }

                        const description = b.deadlineHours 
                            ? `Reward: ${b.rewardValue}${b.rewardType === 'TICKETS' ? ' Tickets' : ''} • ${deadlineText}`
                            : `Reward: ${b.rewardValue}${b.rewardType === 'TICKETS' ? ' Tickets' : ''}`;

                        return (
                            <PrizeCard
                                key={b.id}
                                title={b.title}
                                description={description}
                                emoji={b.emoji}
                                themeColor={b.themeColor || undefined}
                                variant="bounty"
                                isFCFS={b.isFCFS}
                                hasDeadline={!!b.deadlineHours}
                                requiresPhoto={b.requiresPhoto}
                                highlight={selectedBountyTemplateIds.includes(b.id)}
                                onClick={() =>
                                    setSelectedBountyTemplateIds(prev =>
                                        prev.includes(b.id)
                                            ? prev.filter(id => id !== b.id)
                                            : [...prev, b.id]
                                    )
                                }
                                onEdit={() => handleEditBounty(b)}
                            />
                        );
                    })}
                </div>
                </>
            ) : (
                <>
                    {/* Tickets Section */}
                    <div className="flex flex-col items-center justify-center py-10 px-4">
                        <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 w-full max-w-sm text-center">
                            <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Ticket size={32} className="text-white" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">Give Tickets</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                                Children can use tickets to spin the prize wheel or purchase items from the store
                            </p>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 text-left">
                                        Number of Tickets
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={ticketAmount}
                                        onChange={(e) => setTicketAmount(e.target.value)}
                                        placeholder="Enter amount..."
                                        className="w-full p-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl text-center text-2xl font-bold text-indigo-600 dark:text-indigo-400 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none"
                                    />
                                </div>

                                {ticketAmount && parseInt(ticketAmount) > 0 && (
                                    <div className="bg-gradient-to-r from-purple-100 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-900/30 border border-purple-200 dark:border-purple-700 p-4 rounded-xl">
                                        <p className="text-sm font-medium text-purple-900 dark:text-purple-100">
                                            💡 <span className="font-bold">{ticketAmount} tickets</span> = <span className="font-semibold">${((parseInt(ticketAmount) / (currentFamily?.ticketConversionRate || 10)) || 0).toFixed(2)}</span>
                                        </p>
                                    </div>
                                )}

                                {ticketAmount && parseInt(ticketAmount) > 0 && (
                                    <button onClick={handleGiveTickets} className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 dark:from-purple-500 dark:to-indigo-500 text-white py-3 rounded-xl shadow-lg flex items-center justify-center gap-2 font-bold hover:from-purple-700 hover:to-indigo-700 dark:hover:from-purple-600 dark:hover:to-indigo-600 transition-all">
                                        <Send size={20} className="text-purple-200"/>
                                        <span>Give Tickets</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Action Buttons */}
            {assignSubTab === 'rewards' && selectedTemplateIds.length > 0 && (
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 px-6 z-30 flex justify-center animate-bounce-in">
                    <div className="relative w-full max-w-full flex">
                        <button onClick={handleBulkAssign} className="bg-gradient-to-r from-indigo-600 to-indigo-700 dark:from-indigo-500 dark:to-indigo-600 text-white flex-1 py-4 px-6 rounded-l-2xl shadow-2xl flex items-center justify-center gap-4 font-bold text-lg hover:from-indigo-700 hover:to-indigo-800 dark:hover:from-indigo-600 dark:hover:to-indigo-700 transition-all">
                            <Gift size={24} className="text-indigo-200"/>
                            <span className="whitespace-nowrap">Send Rewards</span>
                        </button>
                        <button 
                            onClick={() => {
                                const menu = document.getElementById('rewards-export-menu');
                                if (menu) menu.classList.toggle('hidden');
                            }}
                            className="bg-indigo-600 dark:bg-indigo-500 text-white px-8 rounded-r-2xl border-l border-indigo-700 dark:border-indigo-600 hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors shadow-2xl flex items-center justify-center"
                        >
                            <ChevronDown size={20} />
                        </button>
                        <div id="rewards-export-menu" className="hidden absolute bottom-full mb-2 left-0 bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden w-full z-50">
                            <button 
                                onClick={() => {
                                    handleExportTemplate('rewards', 'selected');
                                    document.getElementById('rewards-export-menu')?.classList.add('hidden');
                                }}
                                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-white transition-colors border-b border-gray-100 dark:border-gray-700"
                            >
                                Export Selected as Template
                            </button>
                            <button 
                                onClick={() => {
                                    handleExportTemplate('rewards', 'all');
                                    document.getElementById('rewards-export-menu')?.classList.add('hidden');
                                }}
                                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-white transition-colors"
                            >
                                Export All as Template
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {assignSubTab === 'bounties' && selectedBountyTemplateIds.length > 0 && (
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 px-6 z-30 flex justify-center animate-bounce-in">
                    <div className="relative w-full max-w-full flex">
                        <button onClick={handleBulkAssign} className="bg-gradient-to-r from-purple-600 to-indigo-600 dark:from-purple-500 dark:to-indigo-500 text-white flex-1 py-4 px-6 rounded-l-2xl shadow-2xl flex items-center justify-center gap-3 font-bold text-lg hover:from-purple-700 hover:to-indigo-700 dark:hover:from-purple-600 dark:hover:to-indigo-600 transition-all">
                            <ListTodo size={24} className="text-amber-200"/>
                            <span className="whitespace-nowrap">Assign Tasks</span>
                        </button>
                        <button 
                            onClick={() => {
                                const menu = document.getElementById('bounties-export-menu');
                                if (menu) menu.classList.toggle('hidden');
                            }}
                            className="bg-purple-600 dark:bg-purple-500 text-white px-8 rounded-r-2xl border-l border-purple-700 dark:border-purple-600 hover:bg-purple-700 dark:hover:bg-purple-600 transition-colors shadow-2xl flex items-center justify-center"
                        >
                            <ChevronDown size={20} />
                        </button>
                        <div id="bounties-export-menu" className="hidden absolute bottom-full mb-2 left-0 bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden w-full z-50">
                            <button 
                                onClick={() => {
                                    handleExportTemplate('bounties', 'selected');
                                    document.getElementById('bounties-export-menu')?.classList.add('hidden');
                                }}
                                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-white transition-colors border-b border-gray-100 dark:border-gray-700"
                            >
                                Export Selected as Template
                            </button>
                            <button 
                                onClick={() => {
                                    handleExportTemplate('bounties', 'all');
                                    document.getElementById('bounties-export-menu')?.classList.add('hidden');
                                }}
                                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-white transition-colors"
                            >
                                Export All as Template
                            </button>
                        </div>
                    </div>
                </div>
            )}

          </>
        )}

        {tab === 'approvals' && (
          <div className="space-y-8">
            {/* Pending Bounties */}
            {pendingBounties.length > 0 && (
                <div>
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2"><ListTodo size={20}/> Tasks to Verify</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {pendingBounties.map(b => {
                            const template = bountyTemplates.find(t => t.id === b.bountyTemplateId);
                            const user = users.find(u => u.id === b.userId);
                            const isSelfVerification = b.userId === currentUser.id;

                            if(!template || isSelfVerification) return null;

                            return (
                                <div key={b.id} className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-green-200 dark:border-green-700">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-3">
                                            {user?.avatarUrl ? (
                                                <img 
                                                    src={user.avatarUrl} 
                                                    alt={user.name}
                                                    className="w-8 h-8 rounded-full object-cover border-2 border-white dark:border-gray-700"
                                                />
                                            ) : (
                                                <div className={`w-8 h-8 rounded-full ${user?.avatarColor} flex items-center justify-center text-white text-xs font-bold`}>{user?.name.charAt(0)}</div>
                                            )}
                                            <div>
                                                <p className="font-bold text-gray-800 dark:text-white">{template.title}</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">Marked complete by {user?.name}</p>
                                            </div>
                                        </div>
                                        <span className="text-2xl">{template.emoji}</span>
                                    </div>
                                    
                                    {/* Deadline Status */}
                                    {b.deadlineExpiresAt && (
                                      <div className="mt-3">
                                        <DeadlineDisplay 
                                          deadlineExpiresAt={b.deadlineExpiresAt} 
                                          completedAt={b.completedAt}
                                          compact 
                                        />
                                      </div>
                                    )}
                                    
                                    {/* Photo Proof */}
                                    {b.photoUrl && (
                                      <div className="mt-3">
                                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Photo Proof:</p>
                                        <img 
                                          src={b.photoUrl} 
                                          alt="Task completion proof" 
                                          className="w-full h-48 object-cover rounded-xl border-2 border-green-200 dark:border-green-700 cursor-pointer hover:opacity-90 transition-opacity"
                                          onClick={() => window.open(b.photoUrl!, '_blank')}
                                        />
                                      </div>
                                    )}
                                    
                                    <div className="mt-3 pt-3 border-t border-green-50 dark:border-green-900 flex gap-3 justify-end">
                                        <button onClick={() => handleOpenDenialModal(b.id)} className="flex-1 py-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-bold rounded-xl hover:bg-red-100 dark:hover:bg-red-900/50 flex items-center justify-center gap-1 text-sm border border-red-200 dark:border-red-700">
                                            <X size={16}/> Deny
                                        </button>
                                        <button onClick={() => handleVerifyBounty(b.id)} className="flex-1 py-2 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 font-bold rounded-xl hover:bg-green-100 dark:hover:bg-green-900/50 flex items-center justify-center gap-1 text-sm border border-green-200 dark:border-green-700">
                                            <CheckCircle size={16}/> Verify & Send Reward
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {pendingApprovals.length > 0 && (
                <div>
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2"><CheckCircle size={20}/> Claims to Approve</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                        className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-amber-200 dark:border-amber-700"
                    >
                        <div className="flex items-center gap-2 mb-3 text-sm text-gray-500 dark:text-gray-400">
                            {user?.avatarUrl ? (
                                <img 
                                    src={user.avatarUrl} 
                                    alt={user.name}
                                    className="w-6 h-6 rounded-full object-cover"
                                />
                            ) : (
                                <div
                                    className={`w-6 h-6 rounded-full ${user?.avatarColor}`}
                                ></div>
                            )}
                            <span className="font-semibold text-gray-800 dark:text-white">
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
                                className="flex-1 py-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-bold rounded-xl hover:bg-red-100 dark:hover:bg-red-900/50 flex items-center justify-center gap-1 text-sm border border-red-200 dark:border-red-700"
                            >
                                <X size={16}/>Deny
                            </button>
                            <button
                                onClick={() => {
                                    void handleApprovePrize(assignment.id);
                                }}
                                className="flex-1 py-2 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 font-bold rounded-xl hover:bg-green-100 dark:hover:bg-green-900/50 flex items-center justify-center gap-1 text-sm border border-green-200 dark:border-green-700"
                            >
                                <CheckCircle size={16}/>Approve
                            </button>
                        </div>
                    </div>
                );
            })}
                    </div>
                </div>
            )}

            <div className="pt-6 border-t border-gray-200 dark:border-gray-700 space-y-6">
              <div>
                <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                  <History size={18} /> Recent Task Lifecycles
                </h3>
                {recentTaskLifecycles.length === 0 ? (
                  <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
                    No task lifecycle history yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentTaskLifecycles.map((lifecycle) => (
                      <div
                        key={lifecycle.bountyAssignmentId}
                        className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700"
                      >
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-start gap-3">
                            <span className="text-2xl">{lifecycle.taskEmoji}</span>
                            <div>
                              <p className="text-sm font-bold text-gray-800 dark:text-white">{lifecycle.taskTitle}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                Child: <span className="font-semibold">{lifecycle.childName}</span>
                              </p>
                              {lifecycle.expectedReward && (
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  Reward target: <span className="font-semibold">{lifecycle.expectedReward}</span>
                                </p>
                              )}
                            </div>
                          </div>
                          <span className="px-2 py-1 rounded-full text-[11px] font-bold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
                            {lifecycle.latestStatus}
                          </span>
                        </div>

                        <div className="space-y-2 mb-3">
                          {lifecycle.events.map((event) => (
                            <div
                              key={event.id}
                              className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-300"
                            >
                              <span className="mt-1 w-2 h-2 rounded-full bg-indigo-300 dark:bg-indigo-600 shrink-0"></span>
                              <div className="flex-1">
                                <p className="font-semibold text-gray-800 dark:text-gray-100">
                                  {TASK_ACTION_LABELS[event.action] || event.action.replaceAll("_", " ")}
                                </p>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                  {new Date(event.timestamp).toLocaleString()} by {event.assignerName}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>

                        {lifecycle.rewardSummary && (
                          <div className="mb-3 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 text-xs font-semibold text-green-700 dark:text-green-300">
                            {lifecycle.rewardSummary}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                          <span
                            title={lifecycle.bountyAssignmentId}
                            className="px-2 py-1 rounded-full text-[11px] bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                          >
                            Task Ref: {lifecycle.bountyAssignmentId.slice(0, 8)}
                          </span>
                          {lifecycle.rewardAssignmentId && (
                            <span
                              title={lifecycle.rewardAssignmentId}
                              className="px-2 py-1 rounded-full text-[11px] bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                            >
                              Reward Ref: {lifecycle.rewardAssignmentId.slice(0, 8)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Legacy Events</h4>
                {legacyHistoryEvents.length === 0 ? (
                  <div className="text-xs text-gray-500 dark:text-gray-400">No legacy events.</div>
                ) : (
                  <div className="space-y-2 opacity-80">
                    {legacyHistoryEvents.slice(0, 5).map((event) => (
                      <div
                        key={event.id}
                        className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-100 dark:border-gray-700 flex items-center gap-3"
                      >
                        <span className="text-xl">{event.emoji}</span>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-gray-800 dark:text-white">{event.title}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            <span className="font-medium">{event.userName}</span> • {new Date(event.timestamp).toLocaleDateString()}
                            <span className="block text-[10px] text-indigo-500">
                              {(TASK_ACTION_LABELS[event.action] || event.action.replaceAll("_", " "))} by {event.assignerName}
                            </span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "create" && (
          <div className="space-y-6">
            <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl mb-4">
              <button
                type="button"
                onClick={() => { setCreateTab('rewards'); setCreateMode("reward"); }}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                  createTab === "rewards"
                    ? "bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-indigo-400"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                Rewards
              </button>
              <button
                type="button"
                onClick={() => { setCreateTab('bounties'); setCreateMode("bounty"); }}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                  createTab === "bounties"
                    ? "bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-indigo-400"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                Tasks
              </button>
              <button
                type="button"
                onClick={() => setCreateTab('import')}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                  createTab === "import"
                    ? "bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-indigo-400"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                <Upload size={16} />
                Import
              </button>
            </div>

            {createTab === 'import' ? (
              // Import Tab Content
              <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
                <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4">Import Templates</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                      What would you like to import?
                    </label>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setImportType('rewards')}
                        className={`flex-1 py-2 px-4 rounded-lg border transition-colors ${
                          importType === 'rewards'
                            ? 'bg-indigo-100 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-600 text-indigo-700 dark:text-indigo-300'
                            : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700'
                        }`}
                      >
                        Rewards
                      </button>
                      <button
                        onClick={() => setImportType('bounties')}
                        className={`flex-1 py-2 px-4 rounded-lg border transition-colors ${
                          importType === 'bounties'
                            ? 'bg-indigo-100 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-600 text-indigo-700 dark:text-indigo-300'
                            : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700'
                        }`}
                      >
                        Tasks
                      </button>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                      Select JSON Template File
                    </label>
                    <input
                      type="file"
                      id="template-import"
                      accept=".json"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleImportFile(file);
                        }
                      }}
                    />
                    <label
                      htmlFor="template-import"
                      className="block w-full px-6 py-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-center cursor-pointer hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <Upload size={24} className="text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Click to upload</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">JSON files only, max 5MB</p>
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            ) : (
              // Create/Edit Reward or Task Tab Content
              <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-gray-800 dark:text-white">
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
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
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
                                ? "bg-indigo-100 dark:bg-indigo-900/30 border-indigo-500 dark:border-indigo-600"
                                : "bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600"
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
                            className="min-w-[3rem] aspect-square flex items-center justify-center text-xl rounded-xl border bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-600"
                            title="Current icon (click to change)"
                          >
                            {prizeEmoji}
                          </button>
                        )}

                      {/* "More" button */}
                      <button
                        type="button"
                        onClick={() => setShowPrizeEmojiPicker(true)}
                        className="min-w-[3rem] aspect-square flex items-center justify-center text-lg rounded-xl border bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 font-bold"
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
                          className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-3 max-w-[95vw]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-between mb-2 px-1">
                            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                              Choose an icon
                            </span>
                            <button
                              type="button"
                              className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
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
                            theme={theme as 'light' | 'dark'}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ---------------- Title ---------------- */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                      Title
                    </label>
                    <input
                      type="text"
                      value={prizeTitle}
                      onChange={(e) => setPrizeTitle(e.target.value)}
                      placeholder="e.g. Extra Screen Time"
                      className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-indigo-500 outline-none"
                    />
                  </div>

                  {/* ---------------- Description ---------------- */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                      Description
                    </label>
                    <textarea
                      value={prizeDesc}
                      onChange={(e) => setPrizeDesc(e.target.value)}
                      placeholder="Details..."
                      rows={2}
                      className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-indigo-500 outline-none resize-none"
                    />
                  </div>

                  {/* ---------------- Card Color ---------------- */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                      Card Color
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {PASTEL_COLORS.map((c, index) => {
                        // Map pastel colors to darker swatch colors for visibility
                        const swatchColors = [
                          'bg-red-400',
                          'bg-orange-400',
                          'bg-amber-400',
                          'bg-green-400',
                          'bg-teal-400',
                          'bg-blue-400',
                          'bg-indigo-400',
                          'bg-purple-400',
                          'bg-pink-400',
                          'bg-gray-400',
                        ];
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setPrizeColor(c)}
                            className={`w-8 h-8 rounded-full border-2 ${swatchColors[index]} ${
                              prizeColor === c
                                ? "border-gray-600 dark:border-gray-300 scale-110"
                                : "border-transparent"
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* ---------------- Icon (Bounty) ---------------- */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
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
                                ? "bg-indigo-100 dark:bg-indigo-900/30 border-indigo-500 dark:border-indigo-600"
                                : "bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600"
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
                            className="min-w-[3rem] aspect-square flex items-center justify-center text-xl rounded-xl border bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-600"
                            title="Current icon (click to change)"
                          >
                            {bountyEmoji}
                          </button>
                        )}

                      <button
                        type="button"
                        onClick={() => setShowBountyEmojiPicker(true)}
                        className="min-w-[3rem] aspect-square flex items-center justify-center text-lg rounded-xl border bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 font-bold"
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
                          className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-3 max-w-[95vw]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-between mb-2 px-1">
                            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                              Choose an icon
                            </span>
                            <button
                              type="button"
                              className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
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
                            theme={theme as 'light' | 'dark'}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ---------------- Task Title ---------------- */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                      Task Title
                    </label>
                    <input
                      type="text"
                      value={bountyTitle}
                      onChange={(e) => setBountyTitle(e.target.value)}
                      placeholder="e.g. Wash Dishes"
                      className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-indigo-500 outline-none"
                    />
                  </div>

                  {/* ---------------- Reward Type Toggle ---------------- */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                      Reward Type
                    </label>
                    <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                      <button 
                        type="button"
                        onClick={() => setBountyRewardType('TICKETS')} 
                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${bountyRewardType === 'TICKETS' ? 'bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'}`}
                      >
                        Tickets
                      </button>
                      <button 
                        type="button"
                        onClick={() => setBountyRewardType('CUSTOM')} 
                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${bountyRewardType === 'CUSTOM' ? 'bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'}`}
                      >
                        Custom
                      </button>
                    </div>
                  </div>

                  {/* ---------------- Reward Value ---------------- */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                      {bountyRewardType === 'TICKETS' ? 'Ticket Amount' : 'Reward Value'}
                    </label>
                    <div className="flex items-center gap-3">
                      <div className="relative flex-1">
                        <input
                          type={bountyRewardType === 'TICKETS' ? "number" : "text"}
                          value={bountyRewardValue}
                          onChange={(e) => setBountyRewardValue(e.target.value)}
                          placeholder={bountyRewardType === 'TICKETS' ? "e.g. 5" : "e.g. $5 or 30 mins TV"}
                          className="w-full p-3 pl-10 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-indigo-500 outline-none"
                          min={bountyRewardType === 'TICKETS' ? "1" : undefined}
                          step={bountyRewardType === 'TICKETS' ? "1" : undefined}
                        />
                        {bountyRewardType === 'TICKETS' ? (
                          <Ticket className="absolute left-3 top-3.5 text-gray-400 dark:text-gray-500" size={18}/>
                        ) : (
                          <CircleDollarSign
                            className="absolute left-3 top-3.5 text-gray-400 dark:text-gray-500"
                            size={18}
                          />
                        )}
                      </div>
                      {bountyRewardType === 'TICKETS' && bountyRewardValue && parseInt(bountyRewardValue) > 0 && (
                        <div className="text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          = ${((parseInt(bountyRewardValue) / (currentFamily?.ticketConversionRate || 10)) || 0).toFixed(2)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ---------------- Card Color ---------------- */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                      Card Color
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {PASTEL_COLORS.map((c, index) => {
                        // Map pastel colors to darker swatch colors for visibility
                        const swatchColors = [
                          'bg-red-400',
                          'bg-orange-400',
                          'bg-amber-400',
                          'bg-green-400',
                          'bg-teal-400',
                          'bg-blue-400',
                          'bg-indigo-400',
                          'bg-purple-400',
                          'bg-pink-400',
                          'bg-gray-400',
                        ];
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setBountyColor(c)}
                            className={`w-8 h-8 rounded-full border-2 ${swatchColors[index]} ${
                              bountyColor === c
                                ? "border-gray-600 dark:border-gray-300 scale-110"
                                : "border-transparent"
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* ---------------- FCFS Toggle ---------------- */}
                  <div
                    className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 cursor-pointer"
                    onClick={() => setBountyFCFS(!bountyFCFS)}
                  >
                    <div
                      className={`w-6 h-6 rounded-md flex items-center justify-center border transition-all ${
                        bountyFCFS
                          ? "bg-indigo-600 dark:bg-indigo-500 border-indigo-600 dark:border-indigo-500"
                          : "bg-white dark:bg-gray-600 border-gray-300 dark:border-gray-500"
                      }`}
                    >
                      {bountyFCFS && <Check size={16} className="text-white" />}
                    </div>
                    <div>
                      <p className="font-bold text-gray-800 dark:text-white text-sm">
                        First Come First Served
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        If one child claims this task, it disappears for others.
                      </p>
                    </div>
                  </div>

                  {/* ---------------- Requires Photo Toggle ---------------- */}
                  <div
                    className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 cursor-pointer"
                    onClick={() => setBountyRequiresPhoto(!bountyRequiresPhoto)}
                  >
                    <div
                      className={`w-6 h-6 rounded-md flex items-center justify-center border transition-all ${
                        bountyRequiresPhoto
                          ? "bg-indigo-600 dark:bg-indigo-500 border-indigo-600 dark:border-indigo-500"
                          : "bg-white dark:bg-gray-600 border-gray-300 dark:border-gray-500"
                      }`}
                    >
                      {bountyRequiresPhoto && <Check size={16} className="text-white" />}
                    </div>
                    <div>
                      <p className="font-bold text-gray-800 dark:text-white text-sm">
                        📸 Requires Photo Proof
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Child must upload a photo before completing the task.
                      </p>
                    </div>
                  </div>

                  {/* ---------------- Deadline Input ---------------- */}
                  <div className="space-y-3">
                    <div
                      className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 cursor-pointer"
                      onClick={toggleBountyDeadline}
                    >
                      <div
                        className={`w-6 h-6 rounded-md flex items-center justify-center border transition-all ${
                          bountyDeadlineEnabled
                            ? "bg-indigo-600 dark:bg-indigo-500 border-indigo-600 dark:border-indigo-500"
                            : "bg-white dark:bg-gray-600 border-gray-300 dark:border-gray-500"
                        }`}
                      >
                        {bountyDeadlineEnabled && <Check size={16} className="text-white" />}
                      </div>
                      <div>
                        <p className="font-bold text-gray-800 dark:text-white text-sm">
                          Enable deadline
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Adds a countdown once the child accepts the task.
                        </p>
                      </div>
                    </div>

                    {bountyDeadlineEnabled && (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <input
                              type="number"
                              placeholder="Days"
                              value={bountyDeadlineDays}
                              onChange={(e) => setBountyDeadlineDays(e.target.value)}
                              min="0"
                              className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 dark:bg-gray-700 dark:text-white"
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Days (0-365)</p>
                          </div>
                          <div>
                            <input
                              type="number"
                              placeholder="Hours"
                              value={bountyDeadlineHours}
                              onChange={(e) => setBountyDeadlineHours(e.target.value)}
                              min="0"
                              max="23"
                              className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 dark:bg-gray-700 dark:text-white"
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Hours (0-23)</p>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Timer starts when child accepts the task.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleSaveTemplate}
                className="w-full mt-6 bg-indigo-600 dark:bg-indigo-500 text-white font-bold py-3.5 rounded-xl hover:bg-indigo-700 dark:hover:bg-indigo-600 shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20"
              >
                {editingId ? "Update" : "Save Template"}
              </button>

              {editingId && (
                <button
                  type="button"
                  onClick={() => handleDeleteTemplate(editingId, createMode === "bounty")}
                  className="w-full mt-2 text-red-500 dark:text-red-400 font-semibold py-2"
                >
                  Delete Template
                </button>
              )}
              </div>
            )}
          </div>
        )}

        
        {/* Store Tab */}
        {tab === 'store' && (
            <div className="space-y-6">
                {/* Manage Prize Wheel Banner */}
                <button
                  onClick={handleOpenWheelEdit}
                  className="w-full bg-gradient-to-r from-purple-500 to-pink-600 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between hover:scale-[1.02] transition-transform"
                >
                  <div className="flex items-center gap-4">
                    <RotateCcw size={32} />
                    <div className="text-left">
                      <h3 className="text-xl font-bold">Manage Prize Wheel</h3>
                      <p className="text-sm opacity-90">Edit segments & spin cost ({wheelSpinCost} ticket{wheelSpinCost !== 1 ? 's' : ''})</p>
                    </div>
                  </div>
                  <Settings size={24} />
                </button>
                
                {/* Add Store Item Banner */}
                <button
                  onClick={() => handleOpenStoreItemModal()}
                  className="w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between hover:scale-[1.02] transition-transform"
                >
                  <div className="flex items-center gap-4">
                    <div className="bg-white/20 p-3 rounded-2xl">
                      <ShoppingBag size={32} />
                    </div>
                    <div className="text-left">
                      <h3 className="text-xl font-bold">Add Store Item</h3>
                      <p className="text-sm text-white/90">Create rewards kids can buy with tickets</p>
                    </div>
                  </div>
                  <div className="bg-white/20 px-4 py-2 rounded-xl font-bold">
                    <Plus size={20} className="inline" /> New Item
                  </div>
                </button>

                {/* Ticket Conversion Rate Settings */}
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-200 dark:border-emerald-700 rounded-2xl p-6">
                    <div className="flex items-start justify-between mb-4">
                        <div>
                            <h3 className="text-lg font-bold text-emerald-900 dark:text-emerald-100 flex items-center gap-2">
                                <CircleDollarSign size={20}/>
                                Ticket Conversion Rate
                            </h3>
                            <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">
                                Set how many tickets equal $1 for reference
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 bg-white dark:bg-gray-700 p-4 rounded-xl border border-emerald-200 dark:border-emerald-700 w-fit">
                                <input 
                                    type="number" 
                                    min="1"
                                    value={tempConversionRate}
                                    onChange={(e) => setTempConversionRate(e.target.value)}
                                    placeholder="10"
                                    className="w-20 text-2xl font-bold text-emerald-600 dark:text-emerald-400 bg-transparent outline-none text-center"
                                />
                                <span className="text-lg font-semibold text-gray-700 dark:text-gray-300">tickets = $1</span>
                            </div>
                            <div className="text-sm text-emerald-700 dark:text-emerald-300 font-medium space-y-1">
                                <div>1 ticket = ${(1 / (parseInt(tempConversionRate) || 10)).toFixed(2)}</div>
                                <div>10 tickets = ${(10 / (parseInt(tempConversionRate) || 10)).toFixed(2)}</div>
                                <div>100 tickets = ${(100 / (parseInt(tempConversionRate) || 10)).toFixed(2)}</div>
                            </div>
                        </div>
                        {tempConversionRate !== String(currentFamily?.ticketConversionRate || 10) && (
                            <button
                                onClick={() => {
                                    const val = parseInt(tempConversionRate);
                                    if (val > 0 && currentFamily?.id) {
                                        storageService.updateTicketConversionRate(currentFamily.id, val)
                                            .then(() => {
                                                setCurrentFamily({...currentFamily, ticketConversionRate: val} as Family);
                                                showToast('Conversion rate updated', 'success');
                                            })
                                            .catch(err => showToast(err.message, 'error'));
                                    }
                                }}
                                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 text-white font-bold rounded-xl transition-all max-w-xs w-fit"
                            >
                                Save
                            </button>
                        )}
                    </div>
                </div>

                <div>
                    <h3 className="text-lg font-bold text-gray-400 dark:text-gray-300 mb-4 flex items-center gap-2">
                        <ShoppingBag size={20}/>
                        Store Inventory ({storeItems.length} items)
                    </h3>
                    
                    {/* Search Bar */}
                    <div className="mb-4 relative">
                        <input 
                            type="text" 
                            placeholder="Search store items..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-10 py-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                        />
                        <Search className="absolute left-3 top-3.5 text-gray-400 dark:text-gray-500" size={20}/>
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="absolute right-3 top-3.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        )}
                    </div>
                    
                    {filteredStoreItems.length === 0 ? (
                        <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl text-center text-gray-400 dark:text-gray-500">
                            <ShoppingBag size={48} className="mx-auto mb-3 opacity-20" />
                            <p className="font-medium">{searchTerm ? 'No matching items found' : 'No items in store yet'}</p>
                            <p className="text-sm">{searchTerm ? 'Try a different search term' : 'Click "Add Store Item" above to get started'}</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {filteredStoreItems.map((item) => (
                                <div
                                    key={item.id}
                                    className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow"
                                >
                                    {item.imageUrl && (
                                        <div className="mb-3 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 aspect-video">
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
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex-1">
                                            <h4 className="font-bold text-gray-800 dark:text-white">{item.title}</h4>
                                            {item.description && (
                                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{item.description}</p>
                                            )}
                                            <div className="flex items-center gap-1 mt-1">
                                                <Ticket size={16} className="text-purple-500 dark:text-purple-400" />
                                                <span className="text-lg font-bold text-purple-600 dark:text-purple-400">{item.cost}</span>
                                            </div>
                                        </div>
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => handleEditStoreItem(item)}
                                                className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteStoreItem(item.id)}
                                                className="p-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                    {item.productUrl && (
                                        <a
                                            href={item.productUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 mt-2"
                                        >
                                            <Linkicon size={12} />
                                            View Product
                                        </a>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* Users Tab */}
        {tab === 'users' && (
            <div className="space-y-6">
                {!userFormView ? (
                    <>
                        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h3 className="font-bold text-lg text-gray-800 dark:text-white flex items-center gap-2">
                                        <KeyRound size={18} />
                                        Family Recovery Key
                                    </h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                        Used for parent forgot-password recovery.
                                    </p>
                                    <p className={`text-xs mt-2 font-semibold ${recoveryKeyConfigured ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                        {recoveryKeyConfigured ? 'Configured' : 'Not configured'}
                                    </p>
                                    {recoveryKeyUpdatedAt && (
                                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        Last rotated: {new Date(recoveryKeyUpdatedAt).toLocaleString()}
                                      </p>
                                    )}
                                </div>
                                <button
                                  onClick={handleRegenerateRecoveryKey}
                                  disabled={isGeneratingRecoveryKey}
                                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                  {isGeneratingRecoveryKey
                                    ? "Generating..."
                                    : recoveryKeyConfigured
                                    ? "Rotate Key"
                                    : "Generate Key"}
                                </button>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                                If no key is available, recovery must be done by your BribeBank self-hoster administrator.
                            </p>
                            {latestRecoveryKey && (
                              <div className="mt-4 p-4 rounded-xl border border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20">
                                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                                  New recovery key (shown once):
                                </p>
                                <p className="mt-2 p-3 rounded-lg font-mono text-xs bg-white dark:bg-gray-900 text-emerald-700 dark:text-emerald-300 break-all">
                                  {latestRecoveryKey}
                                </p>
                                <button
                                  onClick={handleCopyRecoveryKey}
                                  className="mt-3 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
                                >
                                  {recoveryKeyCopied ? "Copied" : "Copy Recovery Key"}
                                </button>
                                <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-2">
                                  Store this securely. It cannot be retrieved later.
                                </p>
                              </div>
                            )}
                        </div>

                        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-lg text-gray-800 dark:text-white">Family Members</h3>
                                <button onClick={() => handleOpenUserForm()} className="bg-indigo-600 text-white px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1"><UserPlus size={16}/> Add</button>
                            </div>
                            <div className="space-y-3">
                                {users.map(u => (
                                    <div key={u.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors cursor-pointer" onClick={() => handleOpenUserForm(u)}>
                                        <div className="flex items-center gap-3">
                                            {u.avatarUrl ? (
                                                <img 
                                                    src={u.avatarUrl} 
                                                    alt={u.name}
                                                    className="w-10 h-10 rounded-full object-cover border-2 border-white dark:border-gray-600"
                                                />
                                            ) : (
                                                <div className={`w-10 h-10 rounded-full ${u.avatarColor} flex items-center justify-center text-white`}>
                                                    {u.role === UserRole.ADMIN ? <Shield size={18}/> : <UserIcon size={18}/>}
                                                </div>
                                            )}
                                            <div>
                                                <p className="font-bold text-gray-800 dark:text-white">{u.name}</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">@{u.username}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {u.role !== UserRole.ADMIN && (
                                                <>
                                                    <div className="flex items-center gap-1 px-2 py-1 bg-amber-50 dark:bg-amber-900/30 rounded-lg">
                                                        <Ticket size={16} className="text-amber-500 dark:text-amber-400" />
                                                        <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">{u.ticketBalance || 0}</span>
                                                    </div>
                                                    <button onClick={(e) => {e.stopPropagation(); setViewingRewardsForUser(u.id)}} className="text-indigo-500 dark:text-indigo-400 p-2 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded-lg"><Gift size={18}/></button>
                                                </>
                                            )}
                                            <button className="text-gray-400 dark:text-gray-500 p-2 rounded-lg"><Settings size={18}/></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold text-gray-800 dark:text-white">{editingUser ? 'Edit Member' : 'Add Member'}</h3>
                            <button onClick={handleCloseUserView} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"><X/></button>
                        </div>
                        <div className="space-y-4">
                            {/* Profile Picture */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Profile Picture</label>
                                <div className="flex items-center gap-4">
                                    {/* Avatar Preview */}
                                    <div className="relative">
                                        {newUserAvatarUrl ? (
                                            <img 
                                                src={newUserAvatarUrl} 
                                                alt="Avatar" 
                                                className="w-16 h-16 rounded-full object-cover border-2 border-gray-200 dark:border-gray-600"
                                            />
                                        ) : (
                                            <div className={`w-16 h-16 rounded-full ${newUserColor} flex items-center justify-center text-white text-2xl font-bold border-2 border-gray-200 dark:border-gray-600`}>
                                                {newUserName ? newUserName.charAt(0).toUpperCase() : '?'}
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Upload Button */}
                                    <div className="flex-1">
                                        <input
                                            type="file"
                                            id="admin-avatar-upload"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    handleImageSelect(file);
                                                    e.target.value = ''; // Reset input
                                                }
                                            }}
                                        />
                                        <label
                                            htmlFor="admin-avatar-upload"
                                            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer transition-colors"
                                        >
                                            <ImageIcon size={16} />
                                            Upload Photo
                                        </label>
                                        {newUserAvatarUrl && (
                                            <button
                                                type="button"
                                                onClick={() => setNewUserAvatarUrl('')}
                                                className="ml-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                            >
                                                Remove
                                            </button>
                                        )}
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            {newUserAvatarUrl ? 'Using custom photo' : 'Using color avatar - upload a photo to customize'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Avatar Color - Only show if no custom image */}
                            {!newUserAvatarUrl && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Avatar Color</label>
                                    <div className="flex flex-wrap gap-6">
                                        {AVATAR_COLORS.map((c) => (
                                            <button
                                                key={c}
                                                type="button"
                                                onClick={() => setNewUserColor(c)}
                                                className={`w-10 h-10 rounded-full ${c} ${
                                                    newUserColor === c
                                                        ? 'ring-4 ring-blue-500 ring-offset-2'
                                                        : 'hover:scale-110'
                                                } transition-all`}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Name</label>
                                <input type="text" value={newUserName} onChange={e => setNewUserName(e.target.value)} className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="Display Name" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                                  Username
                                </label>
                                <input
                                  type="text"
                                  value={newUserUsername}
                                  onChange={e => setNewUserUsername(e.target.value)}
                                  className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                  placeholder="Username"
                                  autoCapitalize="none"
                                  autoCorrect="off"
                                  spellCheck={false}
                               />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Password {editingUser && <span className="text-xs font-normal text-gray-500 dark:text-gray-400">(Leave blank to keep current)</span>}</label>
                                <input type="password" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder={editingUser ? "••••••" : "Password"} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Role</label>
                                <div className="flex gap-2">
                                    <button onClick={() => setNewUserRole(UserRole.USER)} className={`flex-1 py-2 rounded-lg border transition-colors ${newUserRole === UserRole.USER ? 'bg-indigo-100 dark:bg-indigo-900/30 border-indigo-500 dark:border-indigo-600 text-indigo-700 dark:text-indigo-300' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700'}`}>Child</button>
                                    <button onClick={() => setNewUserRole(UserRole.ADMIN)} className={`flex-1 py-2 rounded-lg border transition-colors ${newUserRole === UserRole.ADMIN ? 'bg-indigo-100 dark:bg-indigo-900/30 border-indigo-500 dark:border-indigo-600 text-indigo-700 dark:text-indigo-300' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700'}`}>Parent</button>
                                </div>
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

      {/* Scroll to Top Button */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-24 right-6 lg:bottom-8 lg:right-8 bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-full shadow-lg transition-all duration-300 z-50 hover:scale-110"
          aria-label="Scroll to top"
        >
          <ArrowUp size={24} />
        </button>
      )}

      {/* Image Cropper Modal */}
      {showImageCropper && (
        <div
          className="fixed inset-0 bg-black/80 z-[90] flex items-center justify-center p-4"
          onClick={() => setShowImageCropper(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Adjust Photo</h3>
            
            {/* Preview Canvas */}
            <div className="relative bg-gray-100 dark:bg-gray-700 rounded-xl overflow-hidden mb-4" style={{ height: '400px' }}>
              {originalImage && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <img
                    src={originalImage}
                    alt="Crop preview"
                    className="max-w-full max-h-full object-contain"
                    style={{
                      transform: `translate(${cropX}px, ${cropY}px) scale(${cropZoom})`,
                      transition: 'transform 0.1s ease-out'
                    }}
                  />
                  {/* Circular crop overlay */}
                  <div className="absolute inset-0 pointer-events-none">
                    <svg width="100%" height="100%" className="absolute inset-0">
                      <defs>
                        <mask id="circleMask">
                          <rect width="100%" height="100%" fill="white" opacity="0.5"/>
                          <circle cx="50%" cy="50%" r="100" fill="black"/>
                        </mask>
                      </defs>
                      <rect width="100%" height="100%" fill="black" opacity="0.5" mask="url(#circleMask)"/>
                      <circle cx="50%" cy="50%" r="100" fill="none" stroke="white" strokeWidth="2" strokeDasharray="5,5"/>
                    </svg>
                  </div>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="space-y-4">
              {/* Zoom Control */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Zoom: {cropZoom.toFixed(1)}x
                </label>
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.1"
                  value={cropZoom}
                  onChange={(e) => setCropZoom(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>

              {/* Position Controls */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Horizontal
                  </label>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    step="1"
                    value={cropX}
                    onChange={(e) => setCropX(parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Vertical
                  </label>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    step="1"
                    value={cropY}
                    onChange={(e) => setCropY(parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowImageCropper(false)}
                  className="flex-1 px-4 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={applyCrop}
                  className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>

            {/* Hidden canvas for cropping */}
            <canvas ref={cropCanvasRef} className="hidden" />
          </div>
        </div>
      )}

      {/* Import Template Modal */}
      {/* Denial Modal */}
      {showDenialModal && denialAssignmentId && (
        <div
          className="fixed inset-0 z-[95] bg-black/50 flex items-center justify-center p-4"
          onClick={() => setShowDenialModal(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <X size={24} className="text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Deny Task</h3>
            </div>

            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Why are you denying this task?
            </p>

            <div className="space-y-3 mb-6">
              <label className="flex items-center p-3 border-2 border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <input
                  type="radio"
                  name="denialReason"
                  value="INSTRUCTIONS_NOT_FOLLOWED"
                  checked={selectedDenialReason === 'INSTRUCTIONS_NOT_FOLLOWED'}
                  onChange={() => setSelectedDenialReason('INSTRUCTIONS_NOT_FOLLOWED')}
                  className="w-4 h-4"
                />
                <span className="ml-3 text-sm font-medium text-gray-800 dark:text-white">
                  Didn't follow the instructions
                </span>
              </label>

              <label className="flex items-center p-3 border-2 border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <input
                  type="radio"
                  name="denialReason"
                  value="LOW_EFFORT"
                  checked={selectedDenialReason === 'LOW_EFFORT'}
                  onChange={() => setSelectedDenialReason('LOW_EFFORT')}
                  className="w-4 h-4"
                />
                <span className="ml-3 text-sm font-medium text-gray-800 dark:text-white">
                  Not enough effort / rushed
                </span>
              </label>

              <label className="flex items-center p-3 border-2 border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <input
                  type="radio"
                  name="denialReason"
                  value="NOT_COMPLETED"
                  checked={selectedDenialReason === 'NOT_COMPLETED'}
                  onChange={() => setSelectedDenialReason('NOT_COMPLETED')}
                  className="w-4 h-4"
                />
                <span className="ml-3 text-sm font-medium text-gray-800 dark:text-white">
                  Task not completed
                </span>
              </label>

              <label className="flex items-center p-3 border-2 border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <input
                  type="radio"
                  name="denialReason"
                  value="COMPLETED_AFTER_DEADLINE"
                  checked={selectedDenialReason === 'COMPLETED_AFTER_DEADLINE'}
                  onChange={() => setSelectedDenialReason('COMPLETED_AFTER_DEADLINE')}
                  className="w-4 h-4"
                />
                <span className="ml-3 text-sm font-medium text-gray-800 dark:text-white">
                  Completed after the deadline
                </span>
              </label>
            </div>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">
                Can child resubmit this task?
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setAllowResubmit(true)}
                  className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-all ${
                    allowResubmit
                      ? 'bg-green-50 dark:bg-green-900/30 border-green-500 dark:border-green-600 text-green-700 dark:text-green-300'
                      : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  ✓ Yes, allow resubmit
                </button>
                <button
                  type="button"
                  onClick={() => setAllowResubmit(false)}
                  className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-all ${
                    !allowResubmit
                      ? 'bg-red-50 dark:bg-red-900/30 border-red-500 dark:border-red-600 text-red-700 dark:text-red-300'
                      : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  ✗ No, cancel task
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                {allowResubmit 
                  ? 'Child can fix issues and resubmit for verification' 
                  : 'Task will be removed, no reward will be given'}
              </p>
            </div>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                Optional Notes
              </label>
              <textarea
                value={denialNotes}
                onChange={(e) => setDenialNotes(e.target.value)}
                placeholder="e.g., 'Please re-sweep under the table and corners.'"
                className="w-full px-4 py-2 border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                rows={3}
                maxLength={200}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {denialNotes.length}/200 characters
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDenialModal(false)}
                className="flex-1 px-4 py-3 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-bold hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDenyBounty}
                className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
              >
                <X size={18} />
                Deny Task
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && importPreview && (
        <div
          className="fixed inset-0 bg-black/80 z-[90] flex items-center justify-center p-4"
          onClick={() => setShowImportModal(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Import Preview</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {importSelected.size} items ready to import
                {importDuplicates.size > 0 && (
                  <span className="ml-2 inline-block bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 px-3 py-1 rounded-full text-xs">
                    {importDuplicates.size} {importDuplicates.size === 1 ? 'duplicate' : 'duplicates'} found
                  </span>
                )}
              </p>
            </div>

            {/* Preview Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 max-h-96 overflow-y-auto p-4 -m-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {importPreview.map((item, idx) => {
                const isDuplicate = importDuplicates.has(idx);
                const isSelected = importSelected.has(idx);
                
                // Parse color to gradient - extract color name from Tailwind class
                // e.g., "bg-orange-100..." -> create orange gradient
                const colorMatch = item.color?.match(/(orange|blue|red|green|pink|purple|yellow|teal|indigo)/i);
                const colorName = colorMatch ? colorMatch[1].toLowerCase() : 'blue';
                
                // Map color names to gradient colors
                const gradientMap: Record<string, { from: string; to: string; light: string; dark: string }> = {
                  orange: { from: 'from-orange-400', to: 'to-orange-500', light: 'bg-orange-400', dark: 'dark:from-orange-500 dark:to-orange-600' },
                  blue: { from: 'from-blue-400', to: 'to-blue-500', light: 'bg-blue-400', dark: 'dark:from-blue-500 dark:to-blue-600' },
                  red: { from: 'from-red-400', to: 'to-red-500', light: 'bg-red-400', dark: 'dark:from-red-500 dark:to-red-600' },
                  green: { from: 'from-green-400', to: 'to-green-500', light: 'bg-green-400', dark: 'dark:from-green-500 dark:to-green-600' },
                  pink: { from: 'from-pink-400', to: 'to-pink-500', light: 'bg-pink-400', dark: 'dark:from-pink-500 dark:to-pink-600' },
                  purple: { from: 'from-purple-400', to: 'to-purple-500', light: 'bg-purple-400', dark: 'dark:from-purple-500 dark:to-purple-600' },
                  yellow: { from: 'from-yellow-400', to: 'to-yellow-500', light: 'bg-yellow-400', dark: 'dark:from-yellow-500 dark:to-yellow-600' },
                  teal: { from: 'from-teal-400', to: 'to-teal-500', light: 'bg-teal-400', dark: 'dark:from-teal-500 dark:to-teal-600' },
                  indigo: { from: 'from-indigo-400', to: 'to-indigo-500', light: 'bg-indigo-400', dark: 'dark:from-indigo-500 dark:to-indigo-600' },
                };
                
                const gradient = gradientMap[colorName] || gradientMap.blue;
                
                return (
                  <div
                    key={idx}
                    className={`relative cursor-pointer transition-all ${isDuplicate ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={() => {
                      if (!isDuplicate) {
                        const newSelected = new Set(importSelected);
                        if (isSelected) {
                          newSelected.delete(idx);
                        } else {
                          newSelected.add(idx);
                        }
                        setImportSelected(newSelected);
                      }
                    }}
                  >
                    {/* Card Background Gradient */}
                    <div className={`relative flex flex-col p-4 rounded-2xl border-2 transition-all duration-200 shadow-sm overflow-hidden text-white bg-gradient-to-br ${gradient.from} ${gradient.to} ${isDuplicate ? 'border-gray-400 dark:border-gray-600' : isSelected ? 'border-white ring-2 ring-white ring-offset-2 ring-offset-indigo-500' : 'border-opacity-30 border-white'}`}>
                      
                      {/* Fast Grab Badge */}
                      {item.isFCFS && (
                        <div className="absolute -top-1 -left-1 px-2 py-1 bg-yellow-500 dark:bg-yellow-600 text-white rounded-br-xl rounded-tl-xl flex items-center gap-1 font-bold text-[10px] shadow-sm border-b border-r border-white dark:border-gray-800 z-20">
                          <Zap size={10} />
                          <span>FAST GRAB</span>
                        </div>
                      )}
                      
                      {/* Duplicate Badge */}
                      {isDuplicate && (
                        <div className="absolute -top-1 -right-1 px-2 py-1 bg-amber-500 text-white rounded-bl-xl rounded-tr-xl font-bold text-[10px] shadow-sm border-b border-l border-white z-20">
                          DUPLICATE
                        </div>
                      )}
                      
                      {/* Selection Indicator */}
                      {!isDuplicate && (
                        <div className={`absolute top-2 right-2 w-6 h-6 rounded-full border-2 border-white flex items-center justify-center z-10 transition-all ${isSelected ? 'bg-indigo-500 shadow-lg' : 'bg-white/20 backdrop-blur-sm'}`}>
                          {isSelected && <Check size={16} className="text-white font-bold" />}
                        </div>
                      )}
                      
                      {/* Header: Emoji + Spacing */}
                      <div className="flex justify-between items-start mb-2 z-10 mt-1">
                        <span className="text-4xl shadow-sm filter drop-shadow-md">{item.icon || '🎁'}</span>
                      </div>
                      
                      {/* Title */}
                      <h3 className="text-lg font-bold leading-tight mb-1 z-10 break-words">
                        {item.name}
                      </h3>
                      
                      {/* Reward Info */}
                      {item.rewardType ? (
                        <p className="text-sm leading-snug mb-4 flex-grow z-10 font-semibold opacity-90">
                          {item.rewardType === 'CUSTOM' && item.rewardValue
                            ? `Reward: ${item.rewardValue}`
                            : item.rewardType === 'TICKETS' && item.cost
                            ? `${item.cost} ${item.cost === 1 ? 'Ticket' : 'Tickets'}`
                            : 'Reward'}
                        </p>
                      ) : (
                        <p className="text-sm leading-snug mb-4 flex-grow z-10 font-semibold opacity-90">
                          Reward
                        </p>
                      )}
                      
                      {/* Decorative Icon - Bottom Right */}
                      <div className="absolute -bottom-4 -right-4 opacity-20 transform rotate-12 text-white">
                        <HeartHandshake size={220} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Errors (if any) */}
            {importErrors.length > 0 && (
              <div className="mb-6 bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                <p className="text-sm font-medium text-red-700 dark:text-red-400 mb-2">Import Errors:</p>
                <ul className="space-y-1">
                  {importErrors.map((error, idx) => (
                    <li key={idx} className="text-xs text-red-600 dark:text-red-300">{error}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowImportModal(false)}
                className="flex-1 px-4 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                disabled={isImporting}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmImport}
                className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                disabled={isImporting || importSelected.size === 0}
              >
                {isImporting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Importing...
                  </>
                ) : (
                  <>
                    <Download size={18} />
                    Import {importSelected.size > 0 && `(${importSelected.size})`}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
