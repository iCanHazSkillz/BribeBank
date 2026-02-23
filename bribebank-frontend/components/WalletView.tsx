import React, { useState, useEffect, useRef } from 'react';
import { AssignedPrize, PrizeStatus, PrizeTemplate, User, PrizeType, HistoryEvent, AppNotification, AssignedBounty, BountyTemplate, BountyStatus, StoreItem } from '../types';
import { storageService } from '../services/storageService';
import { API_BASE } from "../config";
import { PrizeCard } from './PrizeCard';
import { DeadlineDisplay } from './DeadlineDisplay';
import { History, Ticket, Bell, X, CheckCircle, XCircle, ListTodo, Play, Trash2, ThumbsUp, ThumbsDown, ShoppingBag, Link as LinkIcon, Image as ImageIcon, Settings, User as UserIcon, Search, ArrowUp, Sun, Moon, Clock } from 'lucide-react';
import { SseEvent } from "../types/sseEvents";
import { useTheme } from '../contexts/ThemeContext';

interface WalletViewProps {
  currentUser: User;
  initialTab?: "wallet" | "tasks" | "store" | "history";
  desktopShowNotifications?: boolean;
  onDesktopNotificationsToggle?: () => void;
  onUserUpdate?: () => Promise<void>;
  onCurrentUserDeleted?: () => void;
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
  allowResubmit?: boolean;
  cancelledByUserId?: string;
  cancelledByName?: string;
  fcfsClaimedByUserId?: string;
  fcfsClaimedByName?: string;
};

type ParsedRewardLifecycleMetadata = {
  version: 1;
  lifecycleType: "REWARD";
  rewardAssignmentId: string;
  rewardOrigin: "STANDARD" | "STORE_PURCHASE";
  linkedAction?: string;
  ticketCost?: number;
  refundedTickets?: number;
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

const parseRewardLifecycleMetadata = (
  metadata: string | null | undefined
): ParsedRewardLifecycleMetadata | null => {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata);
    if (
      parsed &&
      parsed.version === 1 &&
      parsed.lifecycleType === "REWARD" &&
      typeof parsed.rewardAssignmentId === "string" &&
      (parsed.rewardOrigin === "STANDARD" || parsed.rewardOrigin === "STORE_PURCHASE")
    ) {
      return parsed as ParsedRewardLifecycleMetadata;
    }
  } catch {
    return null;
  }
  return null;
};

const TASK_LIFECYCLE_LIMIT = 8;

const TASK_ACTION_LABELS: Record<string, string> = {
  TASK_ASSIGNED: "Task assigned",
  TASK_ACCEPTED: "You accepted",
  TASK_COMPLETED: "You marked complete",
  VERIFIED_TASK: "Parent verified task",
  DENIED_TASK: "Parent denied task",
  TASK_CANCELLED: "Task cancelled",
  TASK_MISSED_FCFS: "Missed (claimed by another child)",
  TASK_EXPIRED_RECURRING: "Missed recurring occurrence",
  TASK_RECURRING_PAUSED: "Series paused",
  TASK_RECURRING_RESUMED: "Series resumed",
  TASK_RECURRING_STOPPED: "Series stopped",
  TASK_REFUSED: "Task refused",
  TASK_REJECTED_AFTER_DENIAL: "Denied task rejected",
  EARNED_TICKETS: "Tickets awarded",
  TASK_REWARD_GRANTED: "Reward granted",
  EARNED_STREAK_TICKETS: "Streak tickets awarded",
  STREAK_REWARD_GRANTED: "Streak reward granted",
};

const REWARD_ACTION_LABELS: Record<string, string> = {
  ASSIGNED_REWARD: "Reward assigned",
  REWARD_CLAIMED: "Reward claimed",
  REWARD_CLAIM_CANCELLED: "Claim cancelled",
  REWARD_APPROVED: "Reward approved",
  REWARD_REJECTED: "Reward rejected",
  STORE_PURCHASE_REQUESTED: "Store purchase requested",
  RECEIVED_TICKETS: "Tickets received",
};

const ACTION_LABELS: Record<string, string> = {
  ...TASK_ACTION_LABELS,
  ...REWARD_ACTION_LABELS,
};

const getFeedActionLabel = (action: string): string => {
  if (action === "RECEIVED_TICKETS") {
    return "Tickets sent";
  }
  return ACTION_LABELS[action] || action.replaceAll("_", " ");
};

const getTaskLifecycleStatus = (
  action: string,
  metadata?: ParsedTaskLifecycleMetadata
): string => {
  switch (action) {
    case "VERIFIED_TASK":
    case "TASK_REWARD_GRANTED":
    case "EARNED_TICKETS":
      return "Verified";
    case "DENIED_TASK":
      return metadata?.allowResubmit === false ? "Cancelled" : "Needs rework";
    case "TASK_CANCELLED":
      return "Cancelled";
    case "TASK_MISSED_FCFS":
    case "TASK_EXPIRED_RECURRING":
      return "Missed";
    case "TASK_RECURRING_PAUSED":
      return "Paused";
    case "TASK_RECURRING_RESUMED":
      return "Assigned";
    case "TASK_RECURRING_STOPPED":
      return "Stopped";
    case "TASK_COMPLETED":
      return "Awaiting parent";
    case "TASK_ACCEPTED":
      return "In progress";
    case "EARNED_STREAK_TICKETS":
    case "STREAK_REWARD_GRANTED":
      return "Verified";
    case "TASK_REFUSED":
    case "TASK_REJECTED_AFTER_DENIAL":
      return "Cancelled";
    case "TASK_ASSIGNED":
    default:
      return "Assigned";
  }
};

const getRewardLifecycleStatus = (
  action: string,
  metadata?: ParsedRewardLifecycleMetadata
): string => {
  switch (action) {
    case "ASSIGNED_REWARD":
      return "Assigned";
    case "REWARD_CLAIMED":
    case "STORE_PURCHASE_REQUESTED":
      return "Awaiting approval";
    case "REWARD_CLAIM_CANCELLED":
      return "Cancelled";
    case "REWARD_APPROVED":
      return "Approved";
    case "REWARD_REJECTED":
      return "Rejected";
    case "RECEIVED_TICKETS":
      return metadata?.refundedTickets ? "Refunded" : "Updated";
    default:
      return "Updated";
  }
};

export const WalletView: React.FC<WalletViewProps> = ({ currentUser, initialTab, desktopShowNotifications, onDesktopNotificationsToggle, onUserUpdate, onCurrentUserDeleted }) => {
  const [tab, setTab] = useState<WalletTab>(() => {
    return initialTab ?? getWalletTabFromUrl() ?? "wallet";
  }); 
  // Data State
  const [myPrizes, setMyPrizes] = useState<AssignedPrize[]>([]);
  const [myBounties, setMyBounties] = useState<AssignedBounty[]>([]);
  const [templates, setTemplates] = useState<PrizeTemplate[]>([]);
  const [bountyTemplates, setBountyTemplates] = useState<BountyTemplate[]>([]);
  const [historyEvents, setHistoryEvents] = useState<HistoryEvent[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [familyUsers, setFamilyUsers] = useState<User[]>([]);
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [ticketBalance, setTicketBalance] = useState(currentUser.ticketBalance);
  const [toast, setToast] = useState<{message: string, type: 'info' | 'success' | 'error' } | null>(null);

  // Photo upload state
  const [photoUploadModal, setPhotoUploadModal] = useState<{assignmentId: string, templateTitle: string} | null>(null);
  const [uploadedPhoto, setUploadedPhoto] = useState<string | null>(null);

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
  const [searchTerm, setSearchTerm] = useState('');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [rewardActionInFlightIds, setRewardActionInFlightIds] = useState<Set<string>>(new Set());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { theme, toggleTheme } = useTheme();

  // Account Settings State
  const [settingsName, setSettingsName] = useState(currentUser.name);
  const [settingsUsername, setSettingsUsername] = useState(currentUser.username);
  const [settingsPassword, setSettingsPassword] = useState('');
  const [settingsAvatarColor, setSettingsAvatarColor] = useState(currentUser.avatarColor);
  const [settingsAvatarUrl, setSettingsAvatarUrl] = useState(currentUser.avatarUrl || '');
  const [securityStatus, setSecurityStatus] = useState<{
    hasPasskey: boolean;
    hasDeviceTokenMethod: boolean;
    setupPromptSeen: boolean;
    needsInitialSetupPrompt: boolean;
  } | null>(null);
  const [passkeyList, setPasskeyList] = useState<Array<{ id: string; createdAt: string; lastUsedAt?: string | null; transports: string[] }>>([]);
  const [devicePinEnabled, setDevicePinEnabled] = useState(false);
  const [pinHealth, setPinHealth] = useState<{
    localConfigured: boolean;
    locked: boolean;
    failedAttempts: number;
    serverLinked: boolean | null;
    needsRelink: boolean;
  } | null>(null);
  const [settingsPin, setSettingsPin] = useState('');
  const [settingsPinConfirm, setSettingsPinConfirm] = useState('');
  const [settingsRelinkPin, setSettingsRelinkPin] = useState('');
  const [securityError, setSecurityError] = useState('');
  const [isSecurityLoading, setIsSecurityLoading] = useState(false);
  const [isSecuritySaving, setIsSecuritySaving] = useState(false);
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [deleteAccountConfirmInput, setDeleteAccountConfirmInput] = useState('');
  const [deleteAccountError, setDeleteAccountError] = useState('');
  const [isDeletingCurrentAccount, setIsDeletingCurrentAccount] = useState(false);
  
  // Image cropping state
  const [showImageCropper, setShowImageCropper] = useState(false);
  const [originalImage, setOriginalImage] = useState('');
  const [cropZoom, setCropZoom] = useState(1);
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);

  const AVATAR_COLORS = ['bg-pink-400', 'bg-teal-400', 'bg-blue-500', 'bg-purple-500', 'bg-orange-400', 'bg-green-500', 'bg-red-400', 'bg-indigo-500'];
  const passkeySupported = storageService.isPasskeySupported();

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

  const setRewardActionInFlight = (assignmentId: string, inFlight: boolean) => {
    setRewardActionInFlightIds((prev) => {
      const next = new Set(prev);
      if (inFlight) {
        next.add(assignmentId);
      } else {
        next.delete(assignmentId);
      }
      return next;
    });
  };

  // Actions
  const handleClaim = async (assignmentId: string) => {
    if (rewardActionInFlightIds.has(assignmentId)) {
      return;
    }
    setRewardActionInFlight(assignmentId, true);
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
    } finally {
      setRewardActionInFlight(assignmentId, false);
    }
  };


  const handleBountyAction = async (
    assignmentId: string,
    action: 'start' | 'finish' | 'reject',
    isDenied: boolean = false,
    requiresPhoto: boolean = false
  ) => {
    const assignment = myBounties.find((item) => item.id === assignmentId);
    if (assignment?.seriesPaused) {
      setToast({ message: "This recurring task is paused by parent.", type: "info" });
      return;
    }

    try {
      if (action === 'start') {
        await storageService.updateBountyStatus(
          assignmentId,
          BountyStatus.IN_PROGRESS
        );
        setToast({ message: "Task started!", type: 'info' });
      } else if (action === 'finish') {
        // If photo is required, open photo upload modal
        if (requiresPhoto) {
          const template = bountyTemplates.find(t => {
            const assignment = myBounties.find(b => b.id === assignmentId);
            return assignment && t.id === assignment.bountyTemplateId;
          });
          setPhotoUploadModal({
            assignmentId,
            templateTitle: template?.title || 'Task'
          });
          return; // Don't complete yet, wait for photo
        }
        
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
          title: "Cancel This Task?",
          message: isDenied 
            ? "Cancel this task and close its lifecycle? No reward will be assigned."
            : "Cancel this task and close its lifecycle? No reward will be assigned.",
          confirmLabel: "Cancel Task",
          cancelLabel: "Cancel",
          destructive: true,
        });

        if (ok) {
          await storageService.cancelBountyAssignment(assignmentId);
          setToast({ message: "Task cancelled.", type: 'info' });
        }
      }

      await refreshData();
      if (onUserUpdate) {
        await onUserUpdate();
      }
    } catch (err) {
      console.error("handleBountyAction error:", err);
      const message =
        err instanceof Error && err.message === "SERIES_PAUSED"
          ? "This recurring task is paused by parent."
          : "Something went wrong with this task.";
      setToast({ message, type: err instanceof Error && err.message === "SERIES_PAUSED" ? "info" : "error" });
    }
  };

  const handlePhotoSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setToast({ message: "Please select an image file", type: 'error' });
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onloadend = () => {
      setUploadedPhoto(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitWithPhoto = async () => {
    if (!photoUploadModal || !uploadedPhoto) return;

    const assignment = myBounties.find((item) => item.id === photoUploadModal.assignmentId);
    if (assignment?.seriesPaused) {
      setToast({ message: "This recurring task is paused by parent.", type: "info" });
      return;
    }

    try {
      await storageService.updateBountyStatus(
        photoUploadModal.assignmentId,
        BountyStatus.COMPLETED,
        uploadedPhoto
      );
      
      setToast({
        message: "Task completed with photo! Waiting for verification.",
        type: 'success',
      });
      
      setPhotoUploadModal(null);
      setUploadedPhoto(null);
      
      await refreshData();
      if (onUserUpdate) {
        await onUserUpdate();
      }
    } catch (err) {
      console.error("handleSubmitWithPhoto error:", err);
      const message =
        err instanceof Error && err.message === "SERIES_PAUSED"
          ? "This recurring task is paused by parent."
          : "Failed to submit task";
      setToast({ message, type: err instanceof Error && err.message === "SERIES_PAUSED" ? "info" : "error" });
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
      
      // Use the segment index from the backend response
      const winIndex = result.segmentIndex ?? 0;
      
      if (winIndex < 0 || winIndex >= wheelSegments.length) {
        console.error('Invalid segment index from backend!');
        setIsSpinning(false);
        setToast({ message: 'Error: Invalid segment index', type: 'error' });
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
    setSettingsAvatarUrl(currentUser.avatarUrl || '');
    setShowDeleteAccountConfirm(false);
    setDeleteAccountConfirmInput('');
    setDeleteAccountError('');
    setSettingsPin('');
    setSettingsPinConfirm('');
    setSettingsRelinkPin('');
    setPinHealth(null);
    setSecurityError('');
    setShowAccountSettings(true);
    void loadSecuritySettings();
  };

  const loadSecuritySettings = async () => {
    try {
      setIsSecurityLoading(true);
      const [status, passkeys, pinStatus] = await Promise.all([
        storageService.getQuickLoginStatus(),
        storageService.listPasskeys(),
        storageService.getPinQuickLoginHealth(currentUser.username),
      ]);
      setSecurityStatus(status);
      setPasskeyList(passkeys);
      setPinHealth(pinStatus);
      setDevicePinEnabled(!!pinStatus.localConfigured);
    } catch (err: any) {
      setSecurityError(err?.message || "Failed to load security settings.");
    } finally {
      setIsSecurityLoading(false);
    }
  };

  const handleAddPasskey = async () => {
    try {
      setIsSecuritySaving(true);
      setSecurityError('');
      await storageService.registerPasskey();
      await loadSecuritySettings();
      setToast({ message: "Passkey added.", type: "success" });
    } catch (err: any) {
      setSecurityError(err?.message || "Failed to add passkey.");
    } finally {
      setIsSecuritySaving(false);
    }
  };

  const handleRemovePasskey = async (passkeyId: string) => {
    const ok = await confirm({
      title: "Remove passkey?",
      message: "You will no longer be able to use this passkey for login.",
      confirmLabel: "Remove",
      cancelLabel: "Keep",
      destructive: true,
    });
    if (!ok) return;

    try {
      setIsSecuritySaving(true);
      setSecurityError('');
      await storageService.removePasskey(passkeyId);
      await loadSecuritySettings();
      setToast({ message: "Passkey removed.", type: "success" });
    } catch (err: any) {
      setSecurityError(err?.message || "Failed to remove passkey.");
    } finally {
      setIsSecuritySaving(false);
    }
  };

  const handleSavePinQuickLogin = async () => {
    if (!/^\d{4}$/.test(settingsPin)) {
      setSecurityError("PIN must be exactly 4 digits.");
      return;
    }
    if (settingsPin !== settingsPinConfirm) {
      setSecurityError("PIN confirmation does not match.");
      return;
    }

    try {
      setIsSecuritySaving(true);
      setSecurityError('');
      await storageService.enablePinQuickLogin(settingsPin);
      setSettingsPin('');
      setSettingsPinConfirm('');
      setSettingsRelinkPin('');
      await loadSecuritySettings();
      setToast({ message: devicePinEnabled ? "PIN updated." : "PIN enabled.", type: "success" });
    } catch (err: any) {
      setSecurityError(err?.message || "Failed to save PIN.");
    } finally {
      setIsSecuritySaving(false);
    }
  };

  const handleDisablePinQuickLogin = async () => {
    try {
      setIsSecuritySaving(true);
      setSecurityError('');
      await storageService.disablePinQuickLogin();
      setSettingsPin('');
      setSettingsPinConfirm('');
      setSettingsRelinkPin('');
      await loadSecuritySettings();
      setToast({ message: "PIN disabled.", type: "info" });
    } catch (err: any) {
      setSecurityError(err?.message || "Failed to disable PIN.");
    } finally {
      setIsSecuritySaving(false);
    }
  };

  const handleRelinkPinQuickLogin = async () => {
    if (!/^\d{4}$/.test(settingsRelinkPin)) {
      setSecurityError("PIN must be exactly 4 digits.");
      return;
    }

    try {
      setIsSecuritySaving(true);
      setSecurityError('');
      await storageService.repairPinQuickLogin(settingsRelinkPin);
      setSettingsRelinkPin('');
      await loadSecuritySettings();
      setToast({ message: "PIN relinked.", type: "success" });
    } catch (err: any) {
      if (err?.message === "INVALID_PIN") {
        setSecurityError("Invalid PIN.");
      } else {
        setSecurityError(err?.message || "Failed to relink PIN.");
      }
    } finally {
      setIsSecuritySaving(false);
    }
  };

  const handleCancelClaim = async (assignmentId: string) => {
    if (rewardActionInFlightIds.has(assignmentId)) {
      return;
    }

    const ok = await confirm({
      title: "Cancel Card Use?",
      message:
        "This cancels your pending request. For regular rewards the card will return to available, and for store purchases your tickets are refunded and the request is removed.",
      confirmLabel: "Cancel Use",
      cancelLabel: "Keep Waiting",
      destructive: true,
    });

    if (!ok) return;

    setRewardActionInFlight(assignmentId, true);
    try {
      await storageService.cancelPrizeClaim(assignmentId);
      setToast({
        message: "Card use cancelled.",
        type: "info",
      });
      await refreshData();
      if (onUserUpdate) {
        await onUserUpdate();
      }
    } catch (err) {
      console.error("Failed to cancel prize claim", err);
      setToast({
        message: "Failed to cancel card use. Please try again.",
        type: "error",
      });
    } finally {
      setRewardActionInFlight(assignmentId, false);
    }
  };

  const handleCloseAccountSettings = () => {
    if (isDeletingCurrentAccount) return;
    setShowAccountSettings(false);
    setShowDeleteAccountConfirm(false);
    setDeleteAccountConfirmInput('');
    setDeleteAccountError('');
  };

  const handleSaveAccountSettings = async () => {
    try {
      if (!settingsName || !settingsUsername) {
        setToast({ message: "Name and username are required", type: "error" });
        return;
      }

      // Log original size before sending
      if (settingsAvatarUrl && settingsAvatarUrl.startsWith('data:image/')) {
        const originalSize = new Blob([settingsAvatarUrl]).size;
        console.log(`📸 Avatar Upload - Original size: ${(originalSize / 1024).toFixed(2)} KB (${(originalSize / (1024 * 1024)).toFixed(2)} MB)`);
      }

      const updateResult = await storageService.updateUser(currentUser.id, currentUser.id, {
        name: settingsName,
        username: settingsUsername,
        avatarColor: settingsAvatarColor,
        avatarUrl: settingsAvatarUrl || null,
        ...(settingsPassword ? { password: settingsPassword } : {}),
      } as any);

      // Log compressed size if avatar was updated
      if (updateResult?.avatarSizeBytes && settingsAvatarUrl) {
        const originalSize = new Blob([settingsAvatarUrl]).size;
        const savedSize = updateResult.avatarSizeBytes;
        const reduction = ((1 - savedSize / originalSize) * 100).toFixed(1);
        console.log(`✅ Avatar Saved - Compressed size: ${updateResult.avatarSizeKB} KB (${updateResult.avatarSizeMB} MB)`);
        console.log(`💾 Space saved: ${reduction}% reduction`);
      }

      setToast({ message: "Account updated successfully!", type: "success" });
      setShowAccountSettings(false);
      
      // Refresh session and update parent component
      if (onUserUpdate) {
        await onUserUpdate();
      } else {
        // Fallback if no callback provided
        await storageService.refreshSession();
        window.location.reload();
      }
    } catch (err: any) {
      console.error("Failed to update account", err);
      setToast({ message: err.message || "Failed to update account", type: "error" });
    }
  };

  const handleDeleteCurrentAccount = async () => {
    if (deleteAccountConfirmInput !== "DELETE") {
      setDeleteAccountError("Type DELETE to confirm.");
      return;
    }

    let shouldResetDeletingState = true;
    try {
      setIsDeletingCurrentAccount(true);
      setDeleteAccountError("");
      await storageService.deleteCurrentUser(currentUser.id);
      handleCloseAccountSettings();
      if (onCurrentUserDeleted) {
        shouldResetDeletingState = false;
        onCurrentUserDeleted();
      } else {
        storageService.logout();
        window.location.reload();
      }
    } catch (err: any) {
      setDeleteAccountError(err?.message || "Failed to delete account.");
      setToast({ message: err?.message || "Failed to delete account.", type: "error" });
    } finally {
      if (shouldResetDeletingState) {
        setIsDeletingCurrentAccount(false);
      }
    }
  };

  // Image cropper functions
  const handleImageSelect = (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      setToast({ message: "Image must be less than 10MB", type: "error" });
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
      const cropCircleRadius = 100; // The circle radius in pixels
      
      // Calculate how the image is displayed (object-contain behavior)
      const imgAspect = img.width / img.height;
      let renderedWidth, renderedHeight;
      
      if (imgAspect > 1) {
        // Wide image - constrained by width
        renderedWidth = previewContainerSize;
        renderedHeight = previewContainerSize / imgAspect;
      } else {
        // Tall image - constrained by height
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
      const scale = img.width / zoomedWidth; // ratio of source to displayed
      
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
      setSettingsAvatarUrl(croppedDataUrl);
      setShowImageCropper(false);
    };
    img.src = originalImage;
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

  // Filter rewards by search term
  const filteredGroupedPrizes = searchTerm.trim()
    ? groupedPrizes.filter(group => 
        group.template.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        group.template.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        group.assignedBy.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : groupedPrizes;


  // Show non-recurring tasks until verified; recurring tasks show only the current occurrence.
  const activeBounties = myBounties.filter((b) => {
    if (b.isRecurring) {
      return !!b.isCurrentOccurrence;
    }
    return b.status !== BountyStatus.VERIFIED;
  });

  // Badge count - only tasks requiring user action
  const actionRequiredBounties = myBounties.filter(
    b => !b.seriesPaused && (b.status === BountyStatus.OFFERED || b.status === BountyStatus.DENIED)
  );

  // Filter tasks by search term
  const filteredActiveBounties = searchTerm.trim()
    ? activeBounties.filter(b => {
        const template = bountyTemplates.find(t => t.id === b.bountyTemplateId);
        if (!template) return false;
        return template.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
               template.description?.toLowerCase().includes(searchTerm.toLowerCase());
      })
    : activeBounties;

  // Filter store items by search term
  const filteredStoreItems = searchTerm.trim()
    ? storeItems.filter(item =>
        item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : storeItems;

  const taskLifecycleBuckets = new Map<
    string,
    {
      bountyAssignmentId: string;
      bountyId?: string;
      rewardAssignmentId?: string;
      events: Array<HistoryEvent & { parsedMetadata: ParsedTaskLifecycleMetadata }>;
    }
  >();
  const rewardLifecycleBuckets = new Map<
    string,
    {
      rewardAssignmentId: string;
      rewardOrigin: "STANDARD" | "STORE_PURCHASE";
      events: Array<HistoryEvent & { parsedMetadata: ParsedRewardLifecycleMetadata }>;
    }
  >();
  const legacyHistoryEvents: HistoryEvent[] = [];

  historyEvents.forEach((event) => {
    const parsedTaskMetadata = parseTaskLifecycleMetadata(event.metadata);
    if (parsedTaskMetadata) {
      const existing = taskLifecycleBuckets.get(parsedTaskMetadata.bountyAssignmentId);
      if (!existing) {
        taskLifecycleBuckets.set(parsedTaskMetadata.bountyAssignmentId, {
          bountyAssignmentId: parsedTaskMetadata.bountyAssignmentId,
          bountyId: parsedTaskMetadata.bountyId,
          rewardAssignmentId: parsedTaskMetadata.rewardAssignmentId,
          events: [{ ...event, parsedMetadata: parsedTaskMetadata }],
        });
        return;
      }

      existing.events.push({ ...event, parsedMetadata: parsedTaskMetadata });
      if (!existing.rewardAssignmentId && parsedTaskMetadata.rewardAssignmentId) {
        existing.rewardAssignmentId = parsedTaskMetadata.rewardAssignmentId;
      }
      return;
    }

    const parsedRewardMetadata = parseRewardLifecycleMetadata(event.metadata);
    if (parsedRewardMetadata) {
      const existing = rewardLifecycleBuckets.get(parsedRewardMetadata.rewardAssignmentId);
      if (!existing) {
        rewardLifecycleBuckets.set(parsedRewardMetadata.rewardAssignmentId, {
          rewardAssignmentId: parsedRewardMetadata.rewardAssignmentId,
          rewardOrigin: parsedRewardMetadata.rewardOrigin,
          events: [{ ...event, parsedMetadata: parsedRewardMetadata }],
        });
        return;
      }

      existing.events.push({ ...event, parsedMetadata: parsedRewardMetadata });
      if (
        existing.rewardOrigin !== "STORE_PURCHASE" &&
        parsedRewardMetadata.rewardOrigin === "STORE_PURCHASE"
      ) {
        existing.rewardOrigin = "STORE_PURCHASE";
      }
      return;
    }

    if (!parsedTaskMetadata && !parsedRewardMetadata) {
      legacyHistoryEvents.push(event);
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
        latestStatus: getTaskLifecycleStatus(
          latestEvent?.action || "TASK_ASSIGNED",
          latestEvent?.parsedMetadata
        ),
        taskTitle:
          events.find((event) => event.action !== "EARNED_TICKETS" && event.action !== "TASK_REWARD_GRANTED")?.title ||
          latestEvent?.title ||
          "Task",
        taskEmoji:
          events.find((event) => event.action !== "EARNED_TICKETS" && event.action !== "TASK_REWARD_GRANTED")?.emoji ||
          latestEvent?.emoji ||
          "🧹",
        rewardSummary,
        expectedReward,
      };
    })
    .sort((a, b) => b.latestTimestamp - a.latestTimestamp);

  const recentRewardLifecycles = Array.from(rewardLifecycleBuckets.values())
    .map((bucket) => {
      const events = [...bucket.events].sort((a, b) => a.timestamp - b.timestamp);
      const latestEvent = events[events.length - 1];
      const baseRewardEvent =
        events.find((event) => event.action !== "RECEIVED_TICKETS") || latestEvent;
      const rewardTitleRaw = baseRewardEvent?.title || latestEvent?.title || "Reward";
      const rewardTitle = rewardTitleRaw.startsWith("STORE:")
        ? rewardTitleRaw.replace(/^STORE:\s*/, "")
        : rewardTitleRaw;
      const rewardEmoji = baseRewardEvent?.emoji || latestEvent?.emoji || "🎁";

      const ticketCost =
        events.find((event) => typeof event.parsedMetadata.ticketCost === "number")
          ?.parsedMetadata.ticketCost ?? null;
      const refundedTickets =
        events.find((event) => typeof event.parsedMetadata.refundedTickets === "number")
          ?.parsedMetadata.refundedTickets ?? null;

      return {
        ...bucket,
        events,
        latestTimestamp: latestEvent?.timestamp || 0,
        latestStatus: getRewardLifecycleStatus(
          latestEvent?.action || "ASSIGNED_REWARD",
          latestEvent?.parsedMetadata
        ),
        rewardTitle,
        rewardEmoji,
        childName: baseRewardEvent?.userName || latestEvent?.userName || "Child",
        ticketCost,
        refundedTickets,
      };
    })
    .sort((a, b) => b.latestTimestamp - a.latestTimestamp);

  const unifiedHistoryFeed = [
    ...recentTaskLifecycles.map((lifecycle) => ({
      kind: "taskLifecycle" as const,
      timestamp: lifecycle.latestTimestamp,
      lifecycle,
    })),
    ...recentRewardLifecycles.map((lifecycle) => ({
      kind: "rewardLifecycle" as const,
      timestamp: lifecycle.latestTimestamp,
      lifecycle,
    })),
    ...legacyHistoryEvents.map((event) => ({
      kind: "event" as const,
      timestamp: event.timestamp,
      event,
    })),
  ]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, TASK_LIFECYCLE_LIMIT * 2);

  return (
    <div className="pb-24 lg:pb-0 relative lg:flex lg:min-h-screen" ref={scrollContainerRef}>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-80 lg:fixed lg:top-16 lg:bottom-0 lg:bg-gradient-to-b lg:from-indigo-600 lg:to-purple-700">
        <div className="p-6 border-b border-white/20">
          <div className="flex items-center gap-4 mb-6">
            {currentUser.avatarUrl ? (
              <img 
                src={currentUser.avatarUrl} 
                alt={currentUser.name}
                className="w-16 h-16 rounded-full shadow-lg border-4 border-white/30 object-cover cursor-pointer hover:scale-110 transition-transform"
                onClick={handleOpenAccountSettings}
                title="Account Settings"
              />
            ) : (
              <div className={`w-16 h-16 rounded-full ${currentUser.avatarColor} shadow-lg border-4 border-white/30 flex items-center justify-center text-white text-2xl font-bold cursor-pointer hover:scale-110 transition-transform`}
                onClick={handleOpenAccountSettings}
                title="Account Settings"
              >
                {currentUser.name.charAt(0)}
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold text-white">Hi, {currentUser.name}!</h1>
              <p className="text-indigo-100 text-sm">My Wallet</p>
            </div>
          </div>
          
          {/* Ticket Balance */}
          <div className="bg-white/20 backdrop-blur-sm px-4 py-3 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Ticket size={20} className="text-white" />
              <span className="text-white font-medium">Tickets</span>
            </div>
            <span className="text-white text-2xl font-bold">{ticketBalance}</span>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          {[
            { id: 'wallet', label: 'Rewards', icon: Ticket },
            { id: 'tasks', label: 'Tasks', icon: ListTodo, badge: actionRequiredBounties.length },
            { id: 'store', label: 'Store', icon: ShoppingBag },
            { id: 'history', label: 'History', icon: History }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as WalletTab)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${tab === t.id ? 'bg-white text-indigo-600 shadow-lg' : 'text-white hover:bg-white/10'}`}
            >
              <t.icon size={20} />
              <span className="font-semibold">{t.label}</span>
              {t.badge && t.badge > 0 && (
                <span className={`ml-auto min-w-[24px] h-6 flex items-center justify-center text-xs font-bold rounded-full px-2 ${tab === t.id ? 'bg-indigo-600 text-white' : 'bg-white/20 text-white'}`}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
        
        <div className="p-4 border-t border-white/20">
          <button onClick={handleOpenAccountSettings} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white hover:bg-white/10 transition-colors">
            <Settings size={20} />
            <span className="font-semibold">Settings</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="lg:ml-80 flex-1 lg:bg-gray-50 lg:dark:bg-gray-900">
        {/* Toast */}
        {toast && (
            <div className="fixed top-4 left-1/2 lg:left-[calc(50%+10rem)] transform -translate-x-1/2 z-[60] w-[90%] max-w-sm">
                <div className="bg-gray-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 animate-fade-in-down">
                    <div className="bg-indigo-500 p-1 rounded-full"><CheckCircle size={16}/></div>
                    <p className="text-sm font-medium">{toast.message}</p>
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
            className="absolute right-4 top-20 lg:right-8 lg:top-24 w-80 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden animate-fade-in"
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
                <div className="text-center py-8 text-gray-400 dark:text-gray-500">
                  <Bell className="mx-auto mb-2 opacity-20" size={24} />
                  <p className="text-sm italic">No new alerts</p>
                </div>
              ) : (
                notifications.map(note => (
                  <div key={note.id} className="p-3 mb-1 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 rounded-xl border border-gray-100 dark:border-gray-600 transition-colors relative group">
                    <p className="text-sm text-gray-800 dark:text-gray-200 pr-6">{note.message}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{new Date(note.timestamp).toLocaleString()}</p>
                    <button onClick={(e) => { e.stopPropagation(); handleDismissNotification(note.id); }} className="absolute top-2 right-2 text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"><X size={14}/></button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <header className="bg-white dark:bg-gray-800 sticky top-0 z-50 px-6 py-4 shadow-sm mb-4 lg:hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
             {currentUser.avatarUrl ? (
               <img 
                 src={currentUser.avatarUrl} 
                 alt={currentUser.name}
                 className="w-10 h-10 rounded-full shadow-md border-2 border-white dark:border-gray-700 object-cover cursor-pointer hover:scale-110 transition-transform"
                 onClick={handleOpenAccountSettings}
                 title="Account Settings"
               />
             ) : (
               <div 
                 className={`w-10 h-10 rounded-full ${currentUser.avatarColor} shadow-md border-2 border-white flex items-center justify-center text-white font-bold cursor-pointer hover:scale-110 transition-transform`}
                 onClick={handleOpenAccountSettings}
                 title="Account Settings"
               >
                   {currentUser.name.charAt(0)}
               </div>
             )}
             <div>
                <h1 className="text-lg font-extrabold text-gray-900 dark:text-white leading-tight">My Wallet</h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">Hi, {currentUser.name}!</p>
             </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Ticket Balance */}
            <div className="bg-gradient-to-r from-purple-500 to-indigo-600 px-3 py-2 rounded-full flex items-center gap-2 shadow-md">
              <Ticket size={16} className="text-white" />
              <span className="text-white font-bold text-sm">{ticketBalance}</span>
            </div>

            <button
              onClick={toggleTheme}
              className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            <button 
              onClick={() => setShowNotifications(!showNotifications)} 
              className="relative p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
            >
              <Bell size={24} />
              {notifications.length > 0 && (
                <span className="absolute top-1 right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white flex items-center justify-center">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <div className="flex px-4 mb-6 gap-2 lg:hidden">
        <button onClick={() => setTab('wallet')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold transition-colors ${tab === 'wallet' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}><Ticket size={16} /> Rewards</button>
        <button onClick={() => setTab('tasks')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold transition-colors relative ${tab === 'tasks' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
            <ListTodo size={16} /> Tasks
            {actionRequiredBounties.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center text-white border border-white dark:border-gray-800">{actionRequiredBounties.length}</span>}
        </button>
        <button onClick={() => setTab('store')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold transition-colors ${tab === 'store' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}><ShoppingBag size={16} /> Store</button>
        <button onClick={() => setTab('history')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold transition-colors ${tab === 'history' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}><History size={16} /> History</button>
      </div>

      {/* Desktop Header */}
      <div className="hidden lg:block bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-8 py-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
          {tab === 'wallet' && 'My Rewards'}
          {tab === 'tasks' && 'My Tasks'}
          {tab === 'store' && 'Store & Prizes'}
          {tab === 'history' && 'Activity History'}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {tab === 'wallet' && 'View and redeem your available rewards'}
          {tab === 'tasks' && 'Manage your assigned tasks and bounties'}
          {tab === 'store' && 'Shop for items and spin the prize wheel'}
          {tab === 'history' && 'Review your past activities and rewards'}
        </p>
        
        {/* Search Bar - Desktop - Show only on wallet, tasks, and store tabs */}
        {(tab === 'wallet' || tab === 'tasks' || tab === 'store') && (
          <div className="mt-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={tab === 'wallet' ? 'Search rewards...' : tab === 'tasks' ? 'Search tasks...' : 'Search store items...'}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={18} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Search Bar - Mobile - Show only on wallet, tasks, and store tabs */}
      {(tab === 'wallet' || tab === 'tasks' || tab === 'store') && (
        <div className="px-4 mb-4 lg:hidden">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={tab === 'wallet' ? 'Search rewards...' : tab === 'tasks' ? 'Search tasks...' : 'Search store items...'}
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="px-4 lg:px-8 lg:py-6 lg:max-w-6xl lg:mx-auto">
        {tab === 'wallet' && (
          <>
            {filteredGroupedPrizes.length === 0 ? (
              <div className="text-center py-16 opacity-60">
                <span className="text-6xl mb-4 block">😕</span>
                <h3 className="text-lg font-bold text-gray-800 dark:text-white">{searchTerm ? 'No matching rewards' : 'No rewards yet'}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{searchTerm ? 'Try a different search term' : 'Ask for more tasks!'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredGroupedPrizes.map((group) => {
                  const assignmentId = group.ids[0];
                  const isRewardActionInFlight =
                    rewardActionInFlightIds.has(assignmentId);

                  return (
                    <div key={`${group.templateId}-${group.status}`} className="relative">
                      <PrizeCard
                        {...group.template}
                        status={group.status}
                        count={group.count}
                        assignedBy={group.assignedBy}
                        actionLabel={
                          isRewardActionInFlight
                            ? "Working..."
                            : group.status === PrizeStatus.AVAILABLE
                            ? "Use Card"
                            : group.status === PrizeStatus.PENDING_APPROVAL
                            ? "Cancel Use"
                            : "Waiting..."
                        }
                        onClick={
                          isRewardActionInFlight
                            ? undefined
                            : group.status === PrizeStatus.AVAILABLE
                            ? () => handleClaim(assignmentId)
                            : group.status === PrizeStatus.PENDING_APPROVAL
                            ? () => void handleCancelClaim(assignmentId)
                            : undefined
                        }
                        disabled={
                          isRewardActionInFlight ||
                          (group.status !== PrizeStatus.AVAILABLE &&
                            group.status !== PrizeStatus.PENDING_APPROVAL)
                        }
                      />
                      {group.status === PrizeStatus.AVAILABLE && (
                        <div className="text-xs text-gray-400 dark:text-gray-500 text-center mt-1 mb-2">Assigned by {group.assignedBy}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Wheel Spin Modal */}
        {showWheel && (
          <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4" onClick={() => !isSpinning && setShowWheel(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-3xl p-4 sm:p-8 max-w-md w-full" onClick={e => e.stopPropagation()}>
              <h3 className="text-2xl font-bold text-center mb-6 flex items-center justify-center gap-2 dark:text-white">
                <span className="text-3xl">🎡</span>
                Prize Wheel
              </h3>
              
              {/* Wheel Container */}
              <div className="relative w-full aspect-square max-w-sm mx-auto mb-6">
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
                  className="flex-1 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium disabled:opacity-50"
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

        {/* Photo Upload Modal */}
        {photoUploadModal && (
          <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4" onClick={() => setPhotoUploadModal(null)}>
            <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
              <h3 className="text-xl font-bold text-center mb-4 dark:text-white">
                📸 Photo Required
              </h3>
              <p className="text-center text-gray-600 dark:text-gray-300 mb-6">
                Please upload a photo of your completed task: <span className="font-semibold">{photoUploadModal.templateTitle}</span>
              </p>
              
              {/* Photo Preview */}
              {uploadedPhoto && (
                <div className="mb-4 relative">
                  <img 
                    src={uploadedPhoto} 
                    alt="Task proof" 
                    className="w-full h-64 object-cover rounded-xl border-2 border-gray-200 dark:border-gray-600"
                  />
                  <button
                    onClick={() => setUploadedPhoto(null)}
                    className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* File Input */}
              <div className="mb-6">
                <label className="block w-full">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoSelect}
                    className="hidden"
                    id="photo-upload"
                  />
                  <div className="w-full py-3 px-4 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl border-2 border-dashed border-indigo-300 dark:border-indigo-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 cursor-pointer text-center font-medium transition-colors">
                    {uploadedPhoto ? 'Change Photo' : 'Choose Photo'}
                  </div>
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
                  JPG, PNG, or other image formats • Images are automatically optimized
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setPhotoUploadModal(null);
                    setUploadedPhoto(null);
                  }}
                  className="flex-1 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitWithPhoto}
                  disabled={!uploadedPhoto}
                  className="flex-[2] py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Submit Task
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
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                {confirmState.title}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
                {confirmState.message}
              </p>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  className="px-4 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
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
            className="fixed inset-0 bg-black/60 z-[80] flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto"
            onClick={handleCloseAccountSettings}
          >
            <div
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] p-4 sm:p-6 mx-auto my-2 flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 mb-4 shrink-0">
                <Settings size={24} className="text-gray-700 dark:text-gray-200" />
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  Account Settings
                </h3>
              </div>

              <div className="space-y-4 overflow-y-auto pr-1">
                {/* Profile Picture */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                    Profile Picture
                  </label>
                  <div className="flex items-center gap-4">
                    {/* Avatar Preview */}
                    <div className="relative">
                      {settingsAvatarUrl ? (
                        <img 
                          src={settingsAvatarUrl} 
                          alt="Avatar" 
                          className="w-16 h-16 rounded-full object-cover border-2 border-gray-200 dark:border-gray-600"
                        />
                      ) : (
                        <div className={`w-16 h-16 rounded-full ${settingsAvatarColor} flex items-center justify-center text-white text-2xl font-bold border-2 border-gray-200 dark:border-gray-600`}>
                          {settingsName.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    
                    {/* Upload Button */}
                    <div className="flex-1">
                      <input
                        type="file"
                        id="avatar-upload"
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
                        htmlFor="avatar-upload"
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer transition-colors"
                      >
                        <ImageIcon size={16} />
                        Upload Photo
                      </label>
                      {settingsAvatarUrl && (
                        <button
                          type="button"
                          onClick={() => setSettingsAvatarUrl('')}
                          className="ml-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                          Remove
                        </button>
                      )}
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {settingsAvatarUrl ? 'Using custom photo' : 'Using color avatar - upload a photo to customize'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Avatar Color - Only show if no custom image */}
                {!settingsAvatarUrl && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
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
                )}

                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={settingsName}
                    onChange={(e) => setSettingsName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Your name"
                  />
                </div>

                {/* Username */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    value={settingsUsername}
                    onChange={(e) => setSettingsUsername(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Your username"
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    value={settingsPassword}
                    onChange={(e) => setSettingsPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Leave blank to keep current"
                  />
                </div>

                <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                  <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Security</h4>

                  {isSecurityLoading ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400">Loading security settings...</p>
                  ) : (
                    <>
                      <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Passkeys</p>
                          <button
                            type="button"
                            onClick={handleAddPasskey}
                            disabled={!passkeySupported || isSecuritySaving}
                            className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                          >
                            Add Passkey
                          </button>
                        </div>
                        {!passkeySupported && (
                          <p className="text-xs text-amber-600 dark:text-amber-300">
                            Passkeys unavailable on this device/browser.
                          </p>
                        )}
                        {passkeyList.length === 0 ? (
                          <p className="text-xs text-gray-500 dark:text-gray-400">No passkeys configured.</p>
                        ) : (
                          <div className="space-y-2">
                            {passkeyList.map((passkey) => (
                              <div key={passkey.id} className="flex items-center justify-between gap-2 text-xs">
                                <div className="text-gray-700 dark:text-gray-300">
                                  Added {new Date(passkey.createdAt).toLocaleDateString()}
                                  {passkey.lastUsedAt ? ` • Last used ${new Date(passkey.lastUsedAt).toLocaleString()}` : ""}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => void handleRemovePasskey(passkey.id)}
                                  disabled={isSecuritySaving}
                                  className="px-2 py-1 rounded-md border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-60"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">PIN Quick Login (this device)</p>
                          {pinHealth?.localConfigured && (
                            <button
                              type="button"
                              onClick={handleDisablePinQuickLogin}
                              disabled={isSecuritySaving}
                              className="px-3 py-1.5 text-xs rounded-lg border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-60"
                            >
                              Disable PIN
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Status: {!pinHealth?.localConfigured ? "Disabled" : pinHealth.needsRelink ? "Needs relink" : "Enabled"}.
                        </p>
                        {pinHealth?.needsRelink ? (
                          <>
                            <input
                              type="password"
                              inputMode="numeric"
                              maxLength={4}
                              value={settingsRelinkPin}
                              onChange={(e) => setSettingsRelinkPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                              placeholder="Current PIN"
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg"
                            />
                            <button
                              type="button"
                              onClick={handleRelinkPinQuickLogin}
                              disabled={isSecuritySaving}
                              className="w-full py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-60"
                            >
                              Relink PIN
                            </button>
                          </>
                        ) : (
                          <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <input
                                type="password"
                                inputMode="numeric"
                                maxLength={4}
                                value={settingsPin}
                                onChange={(e) => setSettingsPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                                placeholder={devicePinEnabled ? "New PIN" : "Set PIN"}
                                className="px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg"
                              />
                              <input
                                type="password"
                                inputMode="numeric"
                                maxLength={4}
                                value={settingsPinConfirm}
                                onChange={(e) => setSettingsPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 4))}
                                placeholder="Confirm PIN"
                                className="px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={handleSavePinQuickLogin}
                              disabled={isSecuritySaving}
                              className="w-full py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
                            >
                              {devicePinEnabled ? "Update PIN" : "Enable PIN"}
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}

                  {securityError && (
                    <p className="text-xs text-red-600 dark:text-red-400">{securityError}</p>
                  )}
                </div>

                <div className="pt-4 border-t border-red-200 dark:border-red-900/40">
                  {!showDeleteAccountConfirm ? (
                    <button
                      type="button"
                      onClick={() => {
                        setShowDeleteAccountConfirm(true);
                        setDeleteAccountConfirmInput('');
                        setDeleteAccountError('');
                      }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm rounded-xl text-white bg-red-600 hover:bg-red-700"
                    >
                      <Trash2 size={16} />
                      Delete My Account
                    </button>
                  ) : (
                    <>
                      <h4 className="text-sm font-semibold text-red-700 dark:text-red-300">Delete Account</h4>
                      <p className="mt-1 text-xs text-red-600 dark:text-red-300">
                        This action is permanent. If no parent remains, your family and all data may also be deleted.
                      </p>
                      <label className="block mt-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Type DELETE to confirm
                      </label>
                      <input
                        type="text"
                        value={deleteAccountConfirmInput}
                        onChange={(e) => {
                          setDeleteAccountConfirmInput(e.target.value);
                          if (deleteAccountError) setDeleteAccountError("");
                        }}
                        className="w-full mt-1 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg"
                        placeholder="DELETE"
                      />
                      {deleteAccountError && (
                        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{deleteAccountError}</p>
                      )}
                      <div className="flex gap-2 mt-3">
                        <button
                          type="button"
                          onClick={() => {
                            if (isDeletingCurrentAccount) return;
                            setShowDeleteAccountConfirm(false);
                            setDeleteAccountConfirmInput('');
                            setDeleteAccountError('');
                          }}
                          disabled={isDeletingCurrentAccount}
                          className="flex-1 px-4 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleDeleteCurrentAccount}
                          disabled={isDeletingCurrentAccount || deleteAccountConfirmInput !== "DELETE"}
                          className="flex-1 px-4 py-2 text-sm rounded-xl text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {isDeletingCurrentAccount ? "Deleting..." : "Delete Account"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 shrink-0">
                <button
                  type="button"
                  className="px-4 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                  onClick={handleCloseAccountSettings}
                  disabled={isDeletingCurrentAccount}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="px-4 py-2 text-sm rounded-xl text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
                  onClick={handleSaveAccountSettings}
                  disabled={isDeletingCurrentAccount}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === 'tasks' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredActiveBounties.length === 0 && <div className="text-center py-10 text-gray-400 italic col-span-full">{searchTerm ? 'No matching tasks found' : 'No active tasks. Good job!'}</div>}
                {filteredActiveBounties.map(b => {
                    const t = bountyTemplates.find(temp => temp.id === b.bountyTemplateId);
                    if(!t) return null;
                    
                    // Format deadline for description
                    let deadlineText = '';
                    if (t.deadlineHours) {
                        const days = Math.floor(t.deadlineHours / 24);
                        const hours = t.deadlineHours % 24;
                        if (days > 0 && hours > 0) {
                            deadlineText = ` • ${days}d ${hours}h deadline`;
                        } else if (days > 0) {
                            deadlineText = ` • ${days}d deadline`;
                        } else {
                            deadlineText = ` • ${hours}h deadline`;
                        }
                    }
                    
                    const rewardDescription = t.rewardType === 'TICKETS' 
                      ? `Reward: ${t.rewardValue} Tickets${deadlineText}`
                      : `Reward: ${t.rewardValue}${deadlineText}`;

                    // Get just the reason text without notes for the card display
                    const getDenialReasonText = (): string | undefined => {
                      if (b.denialReason) {
                        const reasonMessages: Record<string, string> = {
                          'NOT_COMPLETED_ADEQUATELY': 'Task not completed to adequate standard',
                          'TOO_OLD_NO_LONGER_REQUIRED': 'Task too old and no longer required',
                          'NOT_COMPLETED': 'Task not completed',
                          'INSTRUCTIONS_NOT_FOLLOWED': 'Didn\'t follow the instructions',
                          'LOW_EFFORT': 'Not enough effort / rushed',
                          'COMPLETED_AFTER_DEADLINE': 'Completed after the deadline',
                        };
                        return reasonMessages[b.denialReason] || 'Task was denied';
                      }
                      return undefined;
                    };

                    const denialReasonText = getDenialReasonText();
                    const isSeriesPaused = !!b.seriesPaused;
                    const isRecurringCycleClosed =
                      !!b.isRecurring &&
                      (b.status === BountyStatus.COMPLETED || b.status === BountyStatus.VERIFIED);
                    const nextOccurrenceLabel =
                      b.nextOccurrenceAt && b.nextOccurrenceAt > Date.now()
                        ? new Date(b.nextOccurrenceAt).toLocaleString()
                        : null;
                    
                    // Get the parent's name from the assignment
                    const parentName = b.assignerName || 'Parent';
                    
                    return (
                        <div key={b.id} className="relative">
                            <PrizeCard 
                                title={t.title}
                                description={rewardDescription}
                                emoji={t.emoji}
                                variant="bounty"
                                status={b.status}
                                isFCFS={t.isFCFS}
                                hasDeadline={!!t.deadlineHours}
                                requiresPhoto={t.requiresPhoto}
                                actionLabel={null} // We render custom buttons below
                                onClick={undefined} // Remove click handler from card body
                                disabled={b.status === BountyStatus.DENIED || isSeriesPaused || isRecurringCycleClosed}
                                themeColor={
                                  b.status === BountyStatus.DENIED
                                    ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-gray-900 dark:text-white"
                                    : t.themeColor || "bg-white border-indigo-200 text-gray-900"
                                }
                                isRecurring={!!b.isRecurring}
                                streakEnabled={!!b.streakEnabled}
                                currentStreak={b.currentStreak || 0}
                                seriesPaused={isSeriesPaused}
                                customActions={
                                    <div className="flex flex-col gap-2 mt-2">
                                        {/* Deadline Display - Show countdown for active tasks */}
                                        {b.deadlineExpiresAt && b.status !== BountyStatus.VERIFIED && b.status !== BountyStatus.DENIED && b.status !== BountyStatus.OFFERED && (
                                          <DeadlineDisplay 
                                            deadlineExpiresAt={b.deadlineExpiresAt} 
                                            completedAt={b.status === BountyStatus.COMPLETED ? b.completedAt : undefined}
                                          />
                                        )}
                                        
                                        {(denialReasonText || b.denialNotes) && (
                                          <div className="text-sm text-red-600 dark:text-red-400 font-medium bg-red-50 dark:bg-red-900/20 p-2 rounded-lg">
                                            {denialReasonText && <div>❌ {denialReasonText}</div>}
                                            {b.denialNotes && <div><span className="font-semibold">Note from {parentName}:</span> {b.denialNotes}</div>}
                                          </div>
                                        )}
                                        {isSeriesPaused && (
                                          <div className="text-sm font-medium bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 p-2 rounded-lg border border-amber-200 dark:border-amber-700">
                                            Paused by parent. This recurring task is temporarily unavailable.
                                            {b.seriesPausedAt ? ` Paused at ${new Date(b.seriesPausedAt).toLocaleString()}.` : ""}
                                            {b.seriesAutoResumeSkipAt
                                              ? ` It will auto-resume after skipping ${new Date(
                                                  b.seriesAutoResumeSkipAt
                                                ).toLocaleString()}.`
                                              : ""}
                                          </div>
                                        )}
                                        {isRecurringCycleClosed && (
                                          <div className="text-sm font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300 p-2 rounded-lg border border-indigo-200 dark:border-indigo-700">
                                            This recurring task is completed for the current cycle.
                                            {nextOccurrenceLabel
                                              ? ` It will be available again at ${nextOccurrenceLabel}.`
                                              : " It will be available again on the next scheduled occurrence."}
                                          </div>
                                        )}
                                        <div className="flex gap-2 mt-4">
                                            {isSeriesPaused ? (
                                                <button
                                                    disabled
                                                    className="w-full py-2 bg-gray-100 dark:bg-gray-700 text-gray-400 font-bold rounded-xl border border-gray-200 dark:border-gray-600 cursor-not-allowed text-sm"
                                                >
                                                    Paused by parent
                                                </button>
                                            ) : isRecurringCycleClosed ? (
                                                <button
                                                    disabled
                                                    className="w-full py-2 bg-gray-100 dark:bg-gray-700 text-gray-400 font-bold rounded-xl border border-gray-200 dark:border-gray-600 cursor-not-allowed text-sm"
                                                >
                                                    {nextOccurrenceLabel ? `Returns ${nextOccurrenceLabel}` : "Waiting for next occurrence"}
                                                </button>
                                            ) : b.status === BountyStatus.OFFERED ? (
                                                <>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleBountyAction(b.id, 'reject'); }} 
                                                        className="flex-1 py-2 bg-red-50 dark:bg-red-900/70 text-red-600 dark:text-red-400 font-bold rounded-xl hover:bg-red-100 dark:hover:bg-red-900/50 flex items-center justify-center gap-1 text-sm border border-red-200 dark:border-red-700"
                                                    >
                                                        <X size={16}/> Cancel
                                                    </button>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleBountyAction(b.id, 'start'); }} 
                                                        className="flex-[2] py-2 bg-green-50 dark:bg-green-900/70 text-green-600 dark:text-green-400 font-bold rounded-xl hover:bg-green-100 dark:hover:bg-green-900/50 flex items-center justify-center gap-1 text-sm border border-green-200 dark:border-green-700"
                                                    >
                                                        <ThumbsUp size={16}/> Accept
                                                    </button>
                                                </>
                                            ) : b.status === BountyStatus.IN_PROGRESS ? (
                                                <>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleBountyAction(b.id, 'reject'); }} 
                                                        className="flex-1 py-2 bg-red-50 dark:bg-red-900/70 text-red-600 dark:text-red-400 font-bold rounded-xl hover:bg-red-100 dark:hover:bg-red-900/50 flex items-center justify-center gap-1 text-sm border border-red-200 dark:border-red-700"
                                                    >
                                                        <X size={16}/> Cancel
                                                    </button>
                                                    <button 
                                                        onClick={(e) => { 
                                                            e.stopPropagation(); 
                                                            const template = bountyTemplates.find(t => t.id === b.bountyTemplateId);
                                                            handleBountyAction(b.id, 'finish', false, !!template?.requiresPhoto); 
                                                        }} 
                                                        className="flex-[2] py-2 bg-indigo-600 text-white font-bold rounded-xl shadow-md hover:bg-indigo-700 flex items-center justify-center gap-1 text-sm"
                                                    >
                                                        <CheckCircle size={16}/> Mark Complete
                                                    </button>
                                                </>
                                            ) : b.status === BountyStatus.DENIED ? (
                                                <>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleBountyAction(b.id, 'reject', true); }} 
                                                        className="flex-1 py-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-bold rounded-xl hover:bg-red-100 dark:hover:bg-red-900/50 flex items-center justify-center gap-1 text-sm border border-red-200 dark:border-red-700"
                                                    >
                                                        <X size={16}/> Cancel
                                                    </button>
                                                    <button 
                                                        onClick={(e) => { 
                                                            e.stopPropagation(); 
                                                            const template = bountyTemplates.find(t => t.id === b.bountyTemplateId);
                                                            handleBountyAction(b.id, 'finish', false, !!template?.requiresPhoto); 
                                                        }} 
                                                        className="flex-[2] py-2 bg-orange-600 text-white font-bold rounded-xl shadow-md hover:bg-orange-700 flex items-center justify-center gap-1 text-sm"
                                                    >
                                                        <CheckCircle size={16}/> Re-submit for Review
                                                    </button>
                                                </>
                                            ) : b.status === BountyStatus.COMPLETED ? (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleBountyAction(b.id, 'reject'); }}
                                                    className="w-full py-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-bold rounded-xl hover:bg-red-100 dark:hover:bg-red-900/50 flex items-center justify-center gap-1 text-sm border border-red-200 dark:border-red-700"
                                                >
                                                    <X size={16}/> Cancel Task
                                                </button>
                                            ) : (
                                                <button 
                                                    disabled
                                                    className="w-full py-2 bg-gray-100 dark:bg-gray-700 text-gray-400 font-bold rounded-xl border border-gray-200 dark:border-gray-600 cursor-not-allowed text-sm"
                                                >
                                                    Pending Verification
                                                </button>
                                            )}
                                        </div>
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
                
                {filteredStoreItems.length === 0 ? (
                    <div className="text-center py-16 opacity-60">
                        <ShoppingBag size={64} className="mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                        <h3 className="text-lg font-bold text-gray-800 dark:text-white">{searchTerm ? 'No matching items' : 'Store is Empty'}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{searchTerm ? 'Try a different search term' : 'No items available yet'}</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {filteredStoreItems.map((item) => (
                            <div
                                key={item.id}
                                className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow"
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
                                    <h3 className="font-bold text-gray-800 dark:text-white mb-2">{item.title}</h3>
                                    
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
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{item.description}</p>
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
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                  <History size={18} /> Activity Feed
                </h3>
                {unifiedHistoryFeed.length === 0 ? (
                  <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
                    No activity yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {unifiedHistoryFeed.map((item) => {
                      if (item.kind === "taskLifecycle") {
                        const lifecycle = item.lifecycle;
                        return (
                          <div
                            key={`task-lifecycle-${lifecycle.bountyAssignmentId}`}
                            className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700"
                          >
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <div className="flex items-start gap-3">
                                <span className="text-2xl">{lifecycle.taskEmoji}</span>
                                <div>
                                  <p className="text-sm font-bold text-gray-800 dark:text-white">{lifecycle.taskTitle}</p>
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
                                      {ACTION_LABELS[event.action] || event.action.replaceAll("_", " ")}
                                    </p>
                                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                      {new Date(event.timestamp).toLocaleString()} by {event.assignerName}
                                      {event.action === "TASK_MISSED_FCFS" && event.parsedMetadata.fcfsClaimedByName
                                        ? ` • Claimed by ${event.parsedMetadata.fcfsClaimedByName}`
                                        : ""}
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
                        );
                      }

                      if (item.kind === "rewardLifecycle") {
                        const lifecycle = item.lifecycle;
                        return (
                          <div
                            key={`reward-lifecycle-${lifecycle.rewardAssignmentId}`}
                            className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700"
                          >
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <div className="flex items-start gap-3">
                                <span className="text-2xl">{lifecycle.rewardEmoji}</span>
                                <div>
                                  <p className="text-sm font-bold text-gray-800 dark:text-white">{lifecycle.rewardTitle}</p>
                                  {lifecycle.rewardOrigin === "STORE_PURCHASE" && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                      Store purchase request
                                    </p>
                                  )}
                                </div>
                              </div>
                              <span className="px-2 py-1 rounded-full text-[11px] font-bold bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                                {lifecycle.latestStatus}
                              </span>
                            </div>

                            <div className="space-y-2 mb-3">
                              {lifecycle.events.map((event) => (
                                <div
                                  key={event.id}
                                  className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-300"
                                >
                                  <span className="mt-1 w-2 h-2 rounded-full bg-purple-300 dark:bg-purple-600 shrink-0"></span>
                                  <div className="flex-1">
                                    <p className="font-semibold text-gray-800 dark:text-gray-100">
                                      {ACTION_LABELS[event.action] || event.action.replaceAll("_", " ")}
                                    </p>
                                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                      {new Date(event.timestamp).toLocaleString()} by {event.assignerName}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {lifecycle.rewardOrigin === "STORE_PURCHASE" && (
                              <div className="mb-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-xs font-semibold text-amber-700 dark:text-amber-300">
                                {lifecycle.refundedTickets
                                  ? `Refunded ${lifecycle.refundedTickets} tickets`
                                  : lifecycle.ticketCost
                                  ? `Store cost: ${lifecycle.ticketCost} tickets`
                                  : "Store purchase flow"}
                              </div>
                            )}

                            <div className="flex flex-wrap gap-2">
                              <span
                                title={lifecycle.rewardAssignmentId}
                                className="px-2 py-1 rounded-full text-[11px] bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                              >
                                Reward Ref: {lifecycle.rewardAssignmentId.slice(0, 8)}
                              </span>
                            </div>
                          </div>
                        );
                      }

                      const event = item.event;
                      return (
                        <div
                          key={`event-${event.id}`}
                          className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-4 opacity-90"
                        >
                          <span className="text-3xl">{event.emoji}</span>
                          <div className="flex-1">
                            <h4 className="font-bold text-gray-800 dark:text-white">{event.title}</h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {new Date(event.timestamp).toLocaleString()}
                              <span className="block text-[10px] text-indigo-500">
                                {getFeedActionLabel(event.action)} by {event.assignerName}
                              </span>
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
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
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Adjust Your Photo</h3>
            
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
    </div>
  );
};
