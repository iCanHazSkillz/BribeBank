import { AssignedPrize, PrizeStatus, PrizeTemplate, User, UserRole, PrizeType, HistoryEvent, AppNotification, Family, BountyTemplate, AssignedBounty, BountyStatus } from '../types';
import { apiUrl } from "../config";
const DB_KEY = 'famrewards_production_db_v3'; // Bumped version
const SESSION_KEY = 'famrewards_session_v1';

interface DatabaseSchema {
  families: Family[];
  users: User[];
  templates: PrizeTemplate[];
  assignments: AssignedPrize[];
  bountyTemplates: BountyTemplate[];
  bountyAssignments: AssignedBounty[];
  history: HistoryEvent[];
  notifications: AppNotification[];
}

// Initial DB State.
const getEmptyDB = (): DatabaseSchema => ({
  families: [],
  users: [],
  templates: [],
  assignments: [],
  bountyTemplates: [],
  bountyAssignments: [],
  history: [],
  notifications: []
});

// Helper to read DB
const readDB = (): DatabaseSchema => {
  const data = localStorage.getItem(DB_KEY);
  return data ? JSON.parse(data) : getEmptyDB();
};

// Helper to write DB
const writeDB = (data: DatabaseSchema) => {
  localStorage.setItem(DB_KEY, JSON.stringify(data));
};

// DEFAULT TEMPLATES for new families
const DEFAULT_TEMPLATES = [
  { title: 'Skip Chores', description: 'Skip one household chore of your choice today.', emoji: '🧹', type: PrizeType.PRIVILEGE, themeColor: 'bg-purple-100 text-purple-800 border-purple-200' },
  { title: 'Stay Up Late', description: 'Stay up 1 hour past bedtime.', emoji: '🌙', type: PrizeType.PRIVILEGE, themeColor: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  { title: 'Ice Cream Run', description: 'Trip to get ice cream immediately.', emoji: '🍦', type: PrizeType.FOOD, themeColor: 'bg-pink-100 text-pink-800 border-pink-200' },
  { title: 'Choose Movie', description: 'You get to pick the family movie tonight.', emoji: '🎬', type: PrizeType.ACTIVITY, themeColor: 'bg-blue-100 text-blue-800 border-blue-200' },
];

// DEFAULT BOUNTIES for new families
const DEFAULT_BOUNTIES = [
  { title: 'Wash Dishes', emoji: '🍽️', rewardValue: '$5', isFCFS: false },
  { title: 'Clean Room', emoji: '🧹', rewardValue: 'Screen Time', isFCFS: false },
  { title: 'Walk Dog', emoji: '🐕', rewardValue: '$2', isFCFS: true },
  { title: 'Read a Book', emoji: '📚', rewardValue: 'Ice Cream', isFCFS: false },
];

export const storageService = {

  // --- AUTHENTICATION (BACKEND) ---

  registerFamily: async (
    familyName: string,
    adminName: string,
    username: string,
    password: string
  ): Promise<User> => {
    // 1. Hit backend API
    const response = await fetch(
      apiUrl("/auth/register-parent"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyName,
          username,
          password,
          displayName: adminName
        }),
      }
    );

    if (!response.ok) {
      throw new Error("Registration failed");
    }

    const data = await response.json();

    // 2. Store token
    localStorage.setItem("bribebank_token", data.token);

    // 3. Fetch canonical user profile
    const meRes = await fetch(
      apiUrl("/auth/me"),
      {
        headers: { Authorization: `Bearer ${data.token}` },
      }
    );

    if (!meRes.ok) {
      throw new Error("Failed to fetch user profile");
    }

    const user = await meRes.json();

    // 4. Save session locally (no password)
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        id: user.id,
        familyId: user.family?.id,
        username: user.username,
        name: user.displayName,       // store readable name
        displayName: user.displayName, // ← add this field!
        role: user.role,
        avatarColor: "bg-blue-500"
      })
    );

    return user;
  },

  // --- TEMPORARY LOCAL SEEDING (kept until Phase 2) ---
  seedLocalDBFromBackend(user: any): User {
    const db = getEmptyDB(); // start from clean state every time

    const familyId = user.family?.id || Date.now().toString();

    const newFamily: Family = {
      id: familyId,
      name: user.family?.name || "Unknown Family",
      createdAt: Date.now(),
    };

    const newAdmin: User = {
      id: user.id,
      familyId,
      username: user.username,
      name: user.displayName,
      displayName: user.displayName,
      role: UserRole.ADMIN,    // enforce admin locally
      avatarColor: "bg-blue-500",
    };

    const newTemplates: PrizeTemplate[] = DEFAULT_TEMPLATES.map((t, idx) => ({
      id: `t_${Date.now()}_${idx}`,
      familyId,
      ...t,
    }));

    const newBountyTemplates: BountyTemplate[] = DEFAULT_BOUNTIES.map((b, idx) => ({
      id: `bt_${Date.now()}_${idx}`,
      familyId,
      ...b,
    }));

    db.families.push(newFamily);
    db.users.push(newAdmin);
    db.templates.push(...newTemplates);
    db.bountyTemplates.push(...newBountyTemplates);

    localStorage.setItem(DB_KEY, JSON.stringify(db));
    localStorage.setItem(SESSION_KEY, JSON.stringify(newAdmin));

    return newAdmin;
  },


  login: async (username: string, password: string): Promise<User> => {
    const res = await fetch(apiUrl("/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) throw new Error("Invalid credentials");

    const { token } = await res.json();
    localStorage.setItem("bribebank_token", token);

    const meRes = await fetch(apiUrl("/auth/me"), {
      headers: { Authorization: `Bearer ${token}` },
    });

    const backendUser = await meRes.json();

    // THIS FIXES THE BLANK DASHBOARD
    const seededUser = storageService.seedLocalDBFromBackend(backendUser);

    return seededUser;
  },

  logout: () => {
    localStorage.removeItem(SESSION_KEY);
  },

  getCurrentUser: (): User | null => {
    const stored = localStorage.getItem(SESSION_KEY);
    return stored ? JSON.parse(stored) : null;
  },

  // --- USER MANAGEMENT ---

  getFamilyUsers: (familyId: string): User[] => {
    const db = readDB();
    return db.users.filter(u => u.familyId === familyId);
  },

  createUser: (creator: User, name: string, username: string, password: string, role: UserRole, avatarColor: string): void => {
    if (creator.role !== UserRole.ADMIN) throw new Error("Unauthorized");
    const db = readDB();
    if (db.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
      throw new Error("Username already taken");
    }
    const newUser: User = {
      id: 'u_' + Date.now() + Math.random().toString().slice(2,5),
      familyId: creator.familyId,
      username,
      name,
      password,
      role,
      avatarColor
    };
    db.users.push(newUser);
    writeDB(db);
  },

  updateUser: (adminId: string, userId: string, updates: Partial<User>): void => {
    const db = readDB();
    const admin = db.users.find(u => u.id === adminId);
    // Check admin rights unless updating self (though UI restricts this, good for safety)
    if (!admin || admin.role !== UserRole.ADMIN) throw new Error("Unauthorized");

    const targetIndex = db.users.findIndex(u => u.id === userId);
    if (targetIndex === -1) throw new Error("User not found");

    // Check username uniqueness if changing
    if (updates.username && updates.username.toLowerCase() !== db.users[targetIndex].username.toLowerCase()) {
         if (db.users.some(u => u.id !== userId && u.username.toLowerCase() === updates.username.toLowerCase())) {
             throw new Error("Username already taken");
         }
    }

    // Apply updates
    const currentUser = db.users[targetIndex];
    db.users[targetIndex] = { ...currentUser, ...updates };
    
    // Ensure password isn't wiped if empty string passed (handled in UI, but double check)
    if (updates.password === "") {
        db.users[targetIndex].password = currentUser.password;
    }

    // If updating self, update session storage
    const sessionUser = storageService.getCurrentUser();
    if (sessionUser && sessionUser.id === userId) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(db.users[targetIndex]));
    }

    writeDB(db);
  },

  updateUserPassword: (adminId: string, targetUserId: string, newPassword: string): void => {
    const db = readDB();
    const admin = db.users.find(u => u.id === adminId);
    const targetIndex = db.users.findIndex(u => u.id === targetUserId);
    if (!admin || admin.role !== UserRole.ADMIN || targetIndex === -1) throw new Error("Unauthorized");
    db.users[targetIndex].password = newPassword;
    writeDB(db);
  },

  deleteUser: (adminId: string, targetUserId: string): void => {
      const db = readDB();
      const admin = db.users.find(u => u.id === adminId);
      if (!admin || admin.role !== UserRole.ADMIN) return;
      db.users = db.users.filter(u => u.id !== targetUserId);
      writeDB(db);
  },

  // --- REWARDS (PRIZES) ---

  getTemplates: (familyId: string): PrizeTemplate[] => {
    const db = readDB();
    return db.templates.filter(t => t.familyId === familyId);
  },

  saveTemplate: (template: PrizeTemplate): void => {
    const db = readDB();
    const index = db.templates.findIndex(t => t.id === template.id);
    if (index !== -1) {
        db.templates[index] = template;
    } else {
        db.templates.push(template);
    }
    writeDB(db);
  },

  deleteTemplate: (id: string): void => {
    const db = readDB();
    db.templates = db.templates.filter(t => t.id !== id);
    writeDB(db);
  },

  getAssignments: (familyId: string): AssignedPrize[] => {
    const db = readDB();
    return db.assignments.filter(a => a.familyId === familyId);
  },

  assignPrize: (template: PrizeTemplate, userId: string, adminId: string): void => {
    const db = readDB();
    const admin = db.users.find(u => u.id === adminId);
    const user = db.users.find(u => u.id === userId);

    const newAssignment: AssignedPrize = {
      id: 'ap_' + Date.now() + Math.random().toString().slice(2,5),
      familyId: template.familyId,
      templateId: template.id,
      userId,
      assignedBy: adminId,
      assignedAt: Date.now(),
      status: PrizeStatus.AVAILABLE,
    };
    
    db.assignments.push(newAssignment);
    
    // Create Notification for child
    db.notifications.push({
        id: 'n_' + Date.now(),
        familyId: template.familyId,
        userId,
        message: `${admin?.name || 'Admin'} sent you a reward: ${template.title}!`,
        isRead: false,
        timestamp: Date.now()
    });

    // Log History
    db.history.unshift({
        id: 'h_' + Date.now(),
        familyId: template.familyId,
        userId: userId,
        userName: user?.name || 'User',
        title: template.title,
        emoji: template.emoji,
        action: 'ASSIGNED',
        timestamp: Date.now(),
        assignerName: admin?.name || 'Admin'
    });

    writeDB(db);
  },

  claimPrize: (assignmentId: string): void => {
    const db = readDB();
    const index = db.assignments.findIndex(a => a.id === assignmentId);
    if (index !== -1) {
      db.assignments[index].status = PrizeStatus.PENDING_APPROVAL;
      db.assignments[index].claimedAt = Date.now();
      writeDB(db);
    }
  },

  approvePrize: (assignmentId: string): void => {
    const db = readDB();
    const index = db.assignments.findIndex(a => a.id === assignmentId);
    if (index !== -1) {
      const assignment = db.assignments[index];
      const template = db.templates.find(t => t.id === assignment.templateId);
      const admin = db.users.find(u => u.id === assignment.assignedBy); // Assigner logic preserved
      const currentUser = db.users.find(u => u.id === storageService.getCurrentUser()?.id); // Approver logic
      const approverName = currentUser?.name || admin?.name || 'Admin';
      const child = db.users.find(u => u.id === assignment.userId);

      assignment.status = PrizeStatus.REDEEMED;
      assignment.redeemedAt = Date.now();

      const newHistory: HistoryEvent = {
        id: 'h_' + Date.now(),
        familyId: assignment.familyId,
        userId: assignment.userId,
        userName: child?.name || 'User',
        title: template?.title || 'Reward',
        emoji: template?.emoji || '🎁',
        action: 'APPROVED',
        timestamp: Date.now(),
        assignerName: approverName
      };
      db.history.unshift(newHistory);

      db.notifications.push({
          id: 'n_' + Date.now(),
          familyId: assignment.familyId,
          userId: assignment.userId,
          message: `Your request to use "${template?.title}" was approved by ${approverName}!`,
          isRead: false,
          timestamp: Date.now()
      });

      writeDB(db);
    }
  },

  rejectClaim: (assignmentId: string): void => {
    const db = readDB();
    const index = db.assignments.findIndex(a => a.id === assignmentId);
    if (index !== -1) {
      const assignment = db.assignments[index];
      const template = db.templates.find(t => t.id === assignment.templateId);
      const admin = db.users.find(u => u.id === assignment.assignedBy);
      const currentUser = db.users.find(u => u.id === storageService.getCurrentUser()?.id);
      const denierName = currentUser?.name || admin?.name || 'Admin';
      const child = db.users.find(u => u.id === assignment.userId);

      // Revert status to AVAILABLE
      assignment.status = PrizeStatus.AVAILABLE;
      assignment.claimedAt = undefined;

      const newHistory: HistoryEvent = {
        id: 'h_' + Date.now(),
        familyId: assignment.familyId,
        userId: assignment.userId,
        userName: child?.name || 'User',
        title: template?.title || 'Reward',
        emoji: template?.emoji || '🎁',
        action: 'DENIED',
        timestamp: Date.now(),
        assignerName: denierName
      };
      db.history.unshift(newHistory);

      db.notifications.push({
          id: 'n_' + Date.now(),
          familyId: assignment.familyId,
          userId: assignment.userId,
          message: `Your request for "${template?.title}" was denied by ${denierName}.`,
          isRead: false,
          timestamp: Date.now()
      });

      writeDB(db);
    }
  },

  deleteAssignment: (id: string): void => {
      const db = readDB();
      const assignment = db.assignments.find(a => a.id === id);
      
      if (assignment) {
          // Notify user if status was AVAILABLE or PENDING (Revoking an active reward)
          if (assignment.status !== PrizeStatus.REDEEMED) {
              const template = db.templates.find(t => t.id === assignment.templateId);
              const currentUser = db.users.find(u => u.id === storageService.getCurrentUser()?.id);
              const admin = db.users.find(u => u.id === assignment.assignedBy);
              const revokerName = currentUser?.name || admin?.name || 'Admin';
              const title = template?.title || 'Unknown Reward';
              
              db.notifications.push({
                  id: 'n_' + Date.now(),
                  familyId: assignment.familyId,
                  userId: assignment.userId,
                  message: `Reward "${title}" was revoked by ${revokerName}.`,
                  isRead: false,
                  timestamp: Date.now()
              });
          }
          
          db.assignments = db.assignments.filter(a => a.id !== id);
          writeDB(db);
      }
  },

  // --- BOUNTIES (TASKS) ---

  getBountyTemplates: (familyId: string): BountyTemplate[] => {
    const db = readDB();
    return db.bountyTemplates.filter(b => b.familyId === familyId);
  },

  saveBountyTemplate: (bounty: BountyTemplate): void => {
    const db = readDB();
    const index = db.bountyTemplates.findIndex(b => b.id === bounty.id);
    if(index !== -1) {
      db.bountyTemplates[index] = bounty;
    } else {
      db.bountyTemplates.push(bounty);
    }
    writeDB(db);
  },

  deleteBountyTemplate: (id: string): void => {
      const db = readDB();
      db.bountyTemplates = db.bountyTemplates.filter(b => b.id !== id);
      writeDB(db);
  },

  assignBounty: (bountyTemp: BountyTemplate, userId: string, adminId: string): void => {
    const db = readDB();
    const admin = db.users.find(u => u.id === adminId);
    const user = db.users.find(u => u.id === userId);
    
    const newAssignment: AssignedBounty = {
      id: 'ab_' + Date.now() + Math.random().toString().slice(2,5),
      familyId: bountyTemp.familyId,
      bountyTemplateId: bountyTemp.id,
      userId,
      assignedBy: adminId,
      assignedAt: Date.now(),
      status: BountyStatus.OFFERED
    };
    db.bountyAssignments.push(newAssignment);
    
    // Notify Child
    db.notifications.push({
      id: 'n_' + Date.now(),
      familyId: bountyTemp.familyId,
      userId,
      message: `${admin?.name || 'Parent'} added a new task: ${bountyTemp.title}`,
      isRead: false,
      timestamp: Date.now()
    });

    // Log History
    db.history.unshift({
        id: 'h_' + Date.now(),
        familyId: bountyTemp.familyId,
        userId: userId,
        userName: user?.name || 'User',
        title: bountyTemp.title,
        emoji: bountyTemp.emoji,
        action: 'ASSIGNED_TASK',
        timestamp: Date.now(),
        assignerName: admin?.name || 'Admin'
    });

    writeDB(db);
  },

  getBountyAssignments: (familyId: string): AssignedBounty[] => {
    const db = readDB();
    return db.bountyAssignments.filter(b => b.familyId === familyId);
  },

  updateBountyStatus: (assignmentId: string, status: BountyStatus): void => {
    const db = readDB();
    const index = db.bountyAssignments.findIndex(b => b.id === assignmentId);
    if(index !== -1) {
      const assignment = db.bountyAssignments[index];
      const prevStatus = assignment.status;
      assignment.status = status;
      
      const template = db.bountyTemplates.find(t => t.id === assignment.bountyTemplateId);
      const child = db.users.find(u => u.id === assignment.userId);
      const adminId = assignment.assignedBy; // The admin who assigned it

      if(status === BountyStatus.COMPLETED) {
        assignment.completedAt = Date.now();
        
        // Notify Admin when Completed (Waiting for verification)
        db.notifications.push({
            id: 'n_' + Date.now(),
            familyId: assignment.familyId,
            userId: adminId,
            message: `${child?.name} completed task: ${template?.title}. Verify now!`,
            isRead: false,
            timestamp: Date.now()
        });
      }

      // Notify Admin when Accepted (Started)
      if (status === BountyStatus.IN_PROGRESS && prevStatus === BountyStatus.OFFERED) {
          db.notifications.push({
              id: 'n_' + Date.now(),
              familyId: assignment.familyId,
              userId: adminId,
              message: `${child?.name} accepted the task: ${template?.title}`,
              isRead: false,
              timestamp: Date.now()
          });
      }

      // FIRST COME FIRST SERVED LOGIC
      if (status === BountyStatus.IN_PROGRESS) {
        if (template && template.isFCFS) {
          // Find other assignments of this template that are still OFFERED
          const otherAssignments = db.bountyAssignments.filter(
            b => b.bountyTemplateId === assignment.bountyTemplateId && 
                 b.status === BountyStatus.OFFERED && 
                 b.id !== assignmentId
          );

          // Remove them
          const idsToRemove = otherAssignments.map(b => b.id);
          db.bountyAssignments = db.bountyAssignments.filter(b => !idsToRemove.includes(b.id));
        }
      }

      writeDB(db);
    }
  },

  verifyBounty: (assignmentId: string): void => {
    const db = readDB();
    const index = db.bountyAssignments.findIndex(b => b.id === assignmentId);
    
    if(index !== -1) {
      const bountyAssignment = db.bountyAssignments[index];
      const bountyTemplate = db.bountyTemplates.find(t => t.id === bountyAssignment.bountyTemplateId);
      const admin = db.users.find(u => u.id === bountyAssignment.assignedBy); // Assigner
      const currentUser = db.users.find(u => u.id === storageService.getCurrentUser()?.id); // Verifier
      const verifierName = currentUser?.name || admin?.name || 'Admin';
      const child = db.users.find(u => u.id === bountyAssignment.userId);

      if(!bountyTemplate) return;

      // 1. Update Bounty Status
      bountyAssignment.status = BountyStatus.VERIFIED;

      // 2. Create Prize Assignment based on reward logic
      let prizeTemplateId = bountyTemplate.rewardTemplateId;
      
      // If reward is CASH/Generic (no template ID), create a temporary custom template for it or handle as money
      if (!prizeTemplateId) {
        // Create a specific prize instance for this payout
        const cashTemplate: PrizeTemplate = {
            id: 't_cash_' + Date.now(),
            familyId: bountyAssignment.familyId,
            title: bountyTemplate.rewardValue,
            description: `Reward for completing: ${bountyTemplate.title}`,
            emoji: '💵',
            type: PrizeType.MONEY,
            themeColor: 'bg-green-100 text-green-800 border-green-200'
        };
        db.templates.push(cashTemplate);
        prizeTemplateId = cashTemplate.id;
      }

      // Assign the prize
      const prizeAssignment: AssignedPrize = {
        id: 'ap_' + Date.now(),
        familyId: bountyAssignment.familyId,
        templateId: prizeTemplateId,
        userId: bountyAssignment.userId,
        assignedBy: bountyAssignment.assignedBy,
        assignedAt: Date.now(),
        status: PrizeStatus.AVAILABLE
      };
      db.assignments.push(prizeAssignment);

      // 3. Log History
      db.history.unshift({
        id: 'h_' + Date.now(),
        familyId: bountyAssignment.familyId,
        userId: bountyAssignment.userId,
        userName: child?.name || 'User',
        title: bountyTemplate.title,
        emoji: bountyTemplate.emoji,
        action: 'VERIFIED_TASK',
        timestamp: Date.now(),
        assignerName: verifierName
      });

      // 4. Notify Child
      db.notifications.push({
        id: 'n_' + Date.now(),
        familyId: bountyAssignment.familyId,
        userId: bountyAssignment.userId,
        message: `Task "${bountyTemplate.title}" verified by ${verifierName}! Reward added.`,
        isRead: false,
        timestamp: Date.now()
      });

      writeDB(db);
    }
  },

  deleteBountyAssignment: (id: string): void => {
    const db = readDB();
    db.bountyAssignments = db.bountyAssignments.filter(b => b.id !== id);
    writeDB(db);
  },

  // --- COMMON ---

  getHistoryEvents: (userId: string): HistoryEvent[] => {
    const db = readDB();
    return db.history.filter(h => h.userId === userId);
  },
  
  getFamilyHistory: (familyId: string): HistoryEvent[] => {
      const db = readDB();
      return db.history.filter(h => h.familyId === familyId);
  },

  getNotifications: (userId: string): AppNotification[] => {
    const db = readDB();
    return db.notifications.filter(n => n.userId === userId).sort((a, b) => b.timestamp - a.timestamp);
  },

  markNotificationRead: (id: string): void => {
      const db = readDB();
      const index = db.notifications.findIndex(n => n.id === id);
      if (index !== -1) {
          db.notifications[index].isRead = true;
          writeDB(db);
      }
  },

  markAllNotificationsRead: (userId: string): void => {
      const db = readDB();
      let updated = false;
      db.notifications.forEach(n => {
          if (n.userId === userId && !n.isRead) {
              n.isRead = true;
              updated = true;
          }
      });
      if (updated) writeDB(db);
  },
};
