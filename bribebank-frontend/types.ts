
export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
}

export enum PrizeStatus {
  AVAILABLE = 'AVAILABLE',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  REDEEMED = 'REDEEMED',
}

export enum PrizeType {
  FOOD = 'FOOD',
  ACTIVITY = 'ACTIVITY',
  PRIVILEGE = 'PRIVILEGE',
  MONEY = 'MONEY',
  CUSTOM = 'CUSTOM',
}

// New Enum for Bounty Status
export enum BountyStatus {
  OFFERED = 'OFFERED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED', // Waiting for parent verification
  VERIFIED = 'VERIFIED',   // Done, reward issued
  DENIED = 'DENIED',       // Parent denied completion
}

export enum DenialReason {
  NOT_COMPLETED_ADEQUATELY = 'NOT_COMPLETED_ADEQUATELY',
  TOO_OLD_NO_LONGER_REQUIRED = 'TOO_OLD_NO_LONGER_REQUIRED',
  NOT_COMPLETED = 'NOT_COMPLETED',
  COMPLETED_AFTER_DEADLINE = 'COMPLETED_AFTER_DEADLINE',
}

// New interface for Family/Tenant isolation
export interface Family {
  id: string;
  name: string;
  createdAt: number;
  wheelSpinCost?: number; // Spin cost in tickets
  ticketConversionRate?: number; // Tickets per dollar (e.g., 10 = 10 tickets per $1)
}

export interface User {
  id: string;
  familyId: string; // Data isolation key
  username: string;
  name: string;
  //displayName: string;
  role: UserRole;
  avatarColor: string;
  avatarUrl?: string; // Optional profile picture URL (base64 data URL)
  password?: string;
  ticketBalance: number;
}

export interface PrizeTemplate {
  id: string;
  familyId: string;
  title: string;
  description: string;
  emoji: string;
  type: PrizeType;
  themeColor?: string; // Custom color theme
}

export interface AssignedPrize {
  id: string;
  familyId: string;
  templateId?: string | null;
  userId: string;
  assignedBy: string;
  assignedAt: number;
  status: PrizeStatus;
  claimedAt?: number;
  redeemedAt?: number;

  title: string;
  emoji: string;
  description?: string;
  type: PrizeType;
  themeColor?: string;
}

// BOUNTY INTERFACES
export interface BountyTemplate {
  id: string;
  familyId: string;
  title: string; // The chore/task
  emoji: string;
  rewardType?: 'CUSTOM' | 'TICKETS';
  rewardValue: string; // "$5" or "Screen Time" description or ticket amount
  rewardTemplateId?: string; // Optional: if linked to an existing prize template
  isFCFS?: boolean; // First Come First Served
  themeColor?: string | null;
  deadlineHours?: number | null; // Optional deadline in hours
}

export interface AssignedBounty {
  id: string;
  familyId: string;
  bountyTemplateId: string;
  userId: string;
  assignedBy: string;
  assignerName?: string;
  assignedAt: number;
  status: BountyStatus;
  completedAt?: number;
  denialReason?: string | null;
  denialNotes?: string | null;
  deniedAt?: number | null;
  deadlineStartedAt?: number | null;
  deadlineExpiresAt?: number | null;
  deadlineWarningNotified?: boolean;
}

// STORE INTERFACES
export interface StoreItem {
  id: string;
  familyId: string;
  title: string;
  cost: number;
  imageUrl?: string;
  productUrl?: string;
  description?: string;
}

export interface WheelSegment {
  id: string;
  label: string;
  color: string;
  prob: number;
}

export interface HistoryEvent {
  id: string;
  familyId: string;
  userId: string;
  userName: string; // Snapshot of child name
  title: string;
  emoji: string;
  action: string; // Relaxed to string to allow ASSIGNED, etc.
  timestamp: number;
  assignerName: string; // Snapshot of admin name
}

export interface AppNotification {
  id: string;
  familyId: string;
  userId: string;
  message: string;
  isRead: boolean;
  timestamp: number;
}

export interface GeneratedPrize {
  title: string;
  description: string;
  emoji: string;
  type: PrizeType;
}
