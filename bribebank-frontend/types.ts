
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
}

// New interface for Family/Tenant isolation
export interface Family {
  id: string;
  name: string;
  createdAt: number;
}

export interface User {
  id: string;
  familyId: string; // Data isolation key
  username: string;
  name: string;
  role: UserRole;
  avatarColor: string;
  password?: string; // In a real app, this would never be stored plain text on client
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
  templateId: string;
  userId: string;
  assignedBy: string; // Admin ID
  assignedAt: number;
  status: PrizeStatus;
  claimedAt?: number;
  redeemedAt?: number;
}

// BOUNTY INTERFACES
export interface BountyTemplate {
  id: string;
  familyId: string;
  title: string; // The chore/task
  emoji: string;
  rewardValue: string; // "$5" or "Screen Time" description
  rewardTemplateId?: string; // Optional: if linked to an existing prize template
  isFCFS?: boolean; // First Come First Served
}

export interface AssignedBounty {
  id: string;
  familyId: string;
  bountyTemplateId: string;
  userId: string;
  assignedBy: string;
  assignedAt: number;
  status: BountyStatus;
  completedAt?: number;
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
