import { 
  AssignedPrize, 
  PrizeStatus, 
  PrizeTemplate, 
  User, 
  UserRole, 
  PrizeType, 
  HistoryEvent, 
  AppNotification, 
  Family, 
  BountyTemplate, 
  AssignedBounty, 
  BountyStatus 
} from '../types';
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

// Helper to get auth token
const getAuthToken = (): string | null => {
  return localStorage.getItem("bribebank_token");
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

  getAuthToken: (): string | null => getAuthToken(),

  // --- AUTHENTICATION (BACKEND) ---

  registerFamily: async (
    familyName: string,
    adminName: string,
    username: string,
    password: string
  ): Promise<User> => {
    // 1. Register parent + family
    const response = await fetch(apiUrl("/auth/register-parent"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        familyName,
        username,
        password,
        displayName: adminName,
      }),
    });

    if (!response.ok) {
      throw new Error("Registration failed");
    }

    const data = await response.json(); // should contain { token, ... }
    const token: string = data.token;
    if (!token) {
      throw new Error("No token returned from register-parent");
    }

    // 2. Store token
    localStorage.setItem("bribebank_token", token);

    // 3. Fetch canonical user profile
    const meRes = await fetch(apiUrl("/auth/me"), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!meRes.ok) {
      throw new Error("Failed to fetch user profile");
    }

    const backendUser = await meRes.json();

    // 4. Map backend user -> frontend User
    const sessionUser: User = {
      id: backendUser.id,
      familyId: backendUser.familyId ?? backendUser.family?.id,
      username: backendUser.username,
      name: backendUser.displayName,
      displayName: backendUser.displayName,
      role:
        backendUser.role === "PARENT"
          ? UserRole.ADMIN
          : UserRole.USER,
      avatarColor: backendUser.avatarColor || "bg-blue-500",
    };

    // 5. Save session locally
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));

    return sessionUser;
  },

  login: async (username: string, password: string): Promise<User> => {
    const res = await fetch(apiUrl("/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      throw new Error("Invalid credentials");
    }

    const { token } = await res.json();
    if (!token) {
      throw new Error("No token returned from login");
    }

    localStorage.setItem("bribebank_token", token);

    const meRes = await fetch(apiUrl("/auth/me"), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!meRes.ok) {
      throw new Error("Failed to fetch user profile");
    }

    const backendUser = await meRes.json();

    const sessionUser: User = {
      id: backendUser.id,
      familyId: backendUser.familyId ?? backendUser.family?.id,
      username: backendUser.username,
      name: backendUser.displayName,
      displayName: backendUser.displayName,
      role:
        backendUser.role === "PARENT"
          ? UserRole.ADMIN
          : UserRole.USER,
      avatarColor: "bg-blue-500",
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));

    return sessionUser;
  },

  logout: () => {
    // Blow away auth + session + local fake DB
    localStorage.removeItem("bribebank_token");
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(DB_KEY);
  },
  
  getCurrentUser: (): User | null => {
    const stored = localStorage.getItem(SESSION_KEY);
    return stored ? JSON.parse(stored) : null;
  },

  // --- USER MANAGEMENT ---

  getFamilyUsers: async (familyId: string): Promise<User[]> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");
    const res = await fetch(apiUrl(`/families/${familyId}/users`), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      console.error("Failed to fetch family users", res.status);
      throw new Error("Failed to fetch family users");
    }

    const backendUsers = await res.json();

    return backendUsers.map((u: any): User => ({
      id: u.id,
      familyId: u.familyId,
      username: u.username,
      name: u.displayName,          // <- used by AdminView UI
      displayName: u.displayName,   // <- for consistency
      role: u.role === "PARENT" ? UserRole.ADMIN : UserRole.USER,
      avatarColor: u.avatarColor || "bg-blue-500",
    }));
  },


  createUser: async (
    creator: User,
    name: string,
    username: string,
    password: string,
    role: UserRole,
    avatarColor: string
  ): Promise<void> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");
    if (!creator.familyId) throw new Error("Creator missing familyId");

    const res = await fetch(apiUrl(`/families/${creator.familyId}/users`), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        username,
        password,
        displayName: name,
        role: role === UserRole.ADMIN ? "PARENT" : "CHILD",
        avatarColor, // ignored by backend for now
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("createUser failed", res.status, body);
      throw new Error(body?.error || "Failed to create user");
    }
  },

  updateUser: async (
    adminId: string,
    userId: string,
    updates: Partial<User>
  ): Promise<void> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const payload: any = {};
    if (updates.username) payload.username = updates.username;

    if ((updates as any).name || (updates as any).displayName) {
      payload.displayName = (updates as any).name ?? (updates as any).displayName;
    }

    if (updates.role) {
      payload.role =
        updates.role === UserRole.ADMIN ? "PARENT" : "CHILD";
    }

    if (updates.avatarColor) {
      payload.avatarColor = updates.avatarColor;
    }

    if (Object.keys(payload).length > 0) {
      const res = await fetch(apiUrl(`/users/${userId}`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        console.error("updateUser failed", res.status, body);
        throw new Error(body?.error || "Failed to update user");
      }
    }

    // Password change handled separately
    if ((updates as any).password) {
      await storageService.updateUserPassword(
        adminId,
        userId,
        (updates as any).password as string
      );
    }
  },

  updateUserPassword: async (
    _adminId: string,
    targetUserId: string,
    newPassword: string
  ): Promise<void> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(apiUrl(`/users/${targetUserId}/password`), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ newPassword }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("updateUserPassword failed", res.status, body);
      throw new Error(body?.error || "Failed to update password");
    }
  },

  deleteUser: async (adminId: string, targetUserId: string): Promise<void> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(apiUrl(`/users/${targetUserId}`), {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("deleteUser failed", res.status, body);
      throw new Error(body?.error || "Failed to delete user");
    }
  },


  // --- REWARDS (PRIZES) ---

  // Load reward templates for a family from the backend
  getTemplates: async (familyId: string): Promise<PrizeTemplate[]> => {
    const token = getAuthToken();
    if (!token) {
      throw new Error("Not authenticated");
    }
    const res = await fetch(apiUrl(`/families/${familyId}/rewards`), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      console.error("Failed to fetch rewards from backend", res.status);
      throw new Error("Failed to fetch rewards");
    }

    const backendRewards = await res.json();

    return backendRewards.map((r: any): PrizeTemplate => ({
      id: r.id,
      familyId: r.familyId,
      title: r.title,
      description: r.description ?? "",
      emoji: r.emoji,
      type: r.type as PrizeType,
      themeColor: r.themeColor ?? undefined,
    }));
  },

  // Create or update a reward template via backend
  saveTemplate: async (template: PrizeTemplate): Promise<void> => {
    const token = getAuthToken();
    if (!token) {
      throw new Error("Not authenticated");
    }

    const isLocalId = /^\d+$/.test(template.id); // new vs existing

    const payload = {
      title: template.title,
      emoji: template.emoji,
      description: template.description,
      type: template.type,
      themeColor: template.themeColor,
    };

    const url = isLocalId
      ? apiUrl(`/families/${template.familyId}/rewards`)
      : apiUrl(`/rewards/${template.id}`);

    const method = isLocalId ? "POST" : "PUT";

    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("Failed to save reward template", res.status, body);
      throw new Error(body?.error || "Failed to save reward template");
    }
  },

  // Delete reward template in backend
  deleteTemplate: async (id: string): Promise<void> => {
    const token = getAuthToken();
    if (!token) {
      throw new Error("Not authenticated");
    }

    const res = await fetch(apiUrl(`/rewards/${id}`), {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("Failed to delete reward template", res.status, body);
      throw new Error(body?.error || "Failed to delete reward template");
    }
  },


  // Load assigned prizes for a family from backend
  getAssignments: async (familyId: string): Promise<AssignedPrize[]> => {
    const token = getAuthToken();
    if (!token) {
      throw new Error("Not authenticated");
    }

    const res = await fetch(
      apiUrl(`/families/${familyId}/assigned-prizes`),
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("Failed to fetch assigned prizes from backend", res.status, body);
      throw new Error(body?.error || "Failed to fetch assigned prizes");
    }

    const backendAssignments = await res.json();

    return backendAssignments.map((a: any): AssignedPrize => ({
      id: a.id,
      familyId: a.familyId,
      templateId: a.templateId,
      userId: a.userId,
      assignedBy: a.assignedBy,
      status: a.status as PrizeStatus,
      assignedAt: new Date(a.assignedAt).getTime(),
      claimedAt: a.claimedAt ? new Date(a.claimedAt).getTime() : undefined,
      redeemedAt: a.redeemedAt ? new Date(a.redeemedAt).getTime() : undefined,
      title: a.title,
      emoji: a.emoji,
      description: a.description ?? undefined,
      type: a.type as PrizeType,
      themeColor: a.themeColor ?? undefined,
    }));
  },

  // Assign a prize to a child via backend
  assignPrize: async (
    template: PrizeTemplate,
    userId: string,
    _adminId: string
  ): Promise<void> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    // Use canonical familyId from the template (comes from backend)
    const familyId = template.familyId;
    if (!familyId) {
      console.error("assignPrize: missing familyId on template", {
        template,
        userId,
      });
      throw new Error("Missing familyId for assignPrize");
    }

    const res = await fetch(
      apiUrl(`/families/${familyId}/assigned-prizes`),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          templateId: template.id,
          userId,
        }),
      }
    );

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("Failed to assign prize", res.status, body);
      throw new Error(body?.error || "Failed to assign prize");
    }
  },


    // Child calls this to request use of a prize
    claimPrize: async (assignmentId: string): Promise<void> => {
      const token = getAuthToken();
      if (!token) throw new Error("Not authenticated");

      const res = await fetch(
        apiUrl(`/assigned-prizes/${assignmentId}/claim`),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) {
        console.error("Failed to claim prize", res.status);
        throw new Error("Failed to claim prize");
      }
    },

  // Parent approves a pending prize
  approvePrize: async (assignmentId: string): Promise<void> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(
      apiUrl(`/assigned-prizes/${assignmentId}/approve`),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!res.ok) {
      console.error("Failed to approve prize", res.status);
      throw new Error("Failed to approve prize");
    }
  },

  // Parent rejects a pending claim
  rejectClaim: async (assignmentId: string): Promise<void> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(
      apiUrl(`/assigned-prizes/${assignmentId}/reject`),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!res.ok) {
      console.error("Failed to reject prize claim", res.status);
      throw new Error("Failed to reject prize claim");
    }
  },

  // Parent deletes/revokes an assignment entirely
  deleteAssignment: async (id: string): Promise<void> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(apiUrl(`/assigned-prizes/${id}`), {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      console.error("Failed to delete assignment", res.status);
      throw new Error("Failed to delete assignment");
    }
  },

  // --- BOUNTIES (TASKS) ---

  getBountyTemplates: async (familyId: string): Promise<BountyTemplate[]> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(apiUrl(`/families/${familyId}/bounties`), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("Failed to fetch bounties from backend", res.status, body);
      throw new Error(body?.error || "Failed to fetch bounties");
    }

    const backendBounties = await res.json();

    return backendBounties.map(
      (b: any): BountyTemplate => ({
        id: b.id,
        familyId: b.familyId,
        title: b.title,
        emoji: b.emoji,
        rewardValue: b.rewardValue,
        rewardTemplateId: b.rewardTemplateId ?? undefined,
        isFCFS: !!b.isFCFS,
        themeColor: b.themeColor ?? null,
      })
    );
  },

  saveBountyTemplate: async (template: BountyTemplate): Promise<void> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const isLocalId = /^\d+$/.test(template.id); // new vs existing

    const payload = {
      title: template.title,
      emoji: template.emoji,
      rewardValue: template.rewardValue,
      isFCFS: !!template.isFCFS,
      themeColor: template.themeColor ?? null,
      // rewardTemplateId: template.rewardTemplateId ?? null, // only if you wire this in UI
    };

    const url = isLocalId
      ? apiUrl(`/families/${template.familyId}/bounties`)
      : apiUrl(`/bounties/${template.id}`);

    const method = isLocalId ? "POST" : "PUT";

    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("Failed to save bounty template", res.status, body);
      throw new Error(body?.error || "Failed to save bounty template");
    }
  },

  deleteBountyTemplate: async (id: string): Promise<void> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(apiUrl(`/bounties/${id}`), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("Failed to delete bounty template", res.status, body);
      throw new Error(body?.error || "Failed to delete bounty template");
    }
  },

  assignBounty: async (
    familyId: string,
    bountyId: string,
    userId: string
  ): Promise<void> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(
      apiUrl(`/families/${familyId}/bounty-assignments`),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ bountyId, userId }),
      }
    );

    // // Notify Child
    // db.notifications.push({
    //   id: 'n_' + Date.now(),
    //   familyId: bountyTemp.familyId,
    //   userId,
    //   message: `${admin?.name || 'Parent'} added a new task: ${bountyTemp.title}`,
    //   isRead: false,
    //   timestamp: Date.now()
    // });

    // // Log History
    // db.history.unshift({
    //     id: 'h_' + Date.now(),
    //     familyId: bountyTemp.familyId,
    //     userId: userId,
    //     userName: user?.name || 'User',
    //     title: bountyTemp.title,
    //     emoji: bountyTemp.emoji,
    //     action: 'ASSIGNED_TASK',
    //     timestamp: Date.now(),
    //     assignerName: admin?.name || 'Admin'
    // });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("Failed to assign bounty", res.status, body);
      throw new Error(body?.error || "Failed to assign bounty");
    }
  },

  getBountyAssignments: async (familyId: string): Promise<AssignedBounty[]> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(
      apiUrl(`/families/${familyId}/bounty-assignments`),
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("Failed to fetch bounty assignments from backend", res.status, body);
      throw new Error(body?.error || "Failed to fetch bounty assignments");
    }

    const backendAssignments = await res.json();

    return backendAssignments.map(
      (a: any): AssignedBounty => ({
        id: a.id,
        familyId: a.familyId,
        bountyTemplateId: a.bountyId,
        userId: a.userId,
        assignedBy: a.assignedBy,
        status: a.status as BountyStatus,
        assignedAt: new Date(a.assignedAt).getTime(),
        completedAt: a.completedAt
          ? new Date(a.completedAt).getTime()
          : undefined,
        // if your UI needs bounty/user nested data, you can also keep a.bounty / a.user
      })
    );
  },

  updateBountyStatus: async (
    assignmentId: string,
    status: BountyStatus
  ): Promise<void> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    let endpoint = "";

    if (status === BountyStatus.IN_PROGRESS) {
      endpoint = `/bounty-assignments/${assignmentId}/accept`;
    } else if (status === BountyStatus.COMPLETED) {
      endpoint = `/bounty-assignments/${assignmentId}/complete`;
    } else {
      throw new Error("Unsupported bounty status transition");
    }

    const res = await fetch(apiUrl(endpoint), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    // if(status === BountyStatus.COMPLETED) {
    //   assignment.completedAt = Date.now();
      
    //   // Notify Admin when Completed (Waiting for verification)
    //   db.notifications.push({
    //       id: 'n_' + Date.now(),
    //       familyId: assignment.familyId,
    //       userId: adminId,
    //       message: `${child?.name} completed task: ${template?.title}. Verify now!`,
    //       isRead: false,
    //       timestamp: Date.now()
    //   });
    // }

    // // Notify Admin when Accepted (Started)
    // if (status === BountyStatus.IN_PROGRESS && prevStatus === BountyStatus.OFFERED) {
    //     db.notifications.push({
    //         id: 'n_' + Date.now(),
    //         familyId: assignment.familyId,
    //         userId: adminId,
    //         message: `${child?.name} accepted the task: ${template?.title}`,
    //         isRead: false,
    //         timestamp: Date.now()
    //     });
    // }

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("updateBountyStatus error:", res.status, body);
      throw new Error(body?.error || "Failed to update bounty status");
    }
  },

  verifyBounty: async (assignmentId: string): Promise<void> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(
      apiUrl(`/bounty-assignments/${assignmentId}/verify`),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    // // 3. Log History
    // db.history.unshift({
    //   id: 'h_' + Date.now(),
    //   familyId: bountyAssignment.familyId,
    //   userId: bountyAssignment.userId,
    //   userName: child?.name || 'User',
    //   title: bountyTemplate.title,
    //   emoji: bountyTemplate.emoji,
    //   action: 'VERIFIED_TASK',
    //   timestamp: Date.now(),
    //   assignerName: verifierName
    // });

    // // 4. Notify Child
    // db.notifications.push({
    //   id: 'n_' + Date.now(),
    //   familyId: bountyAssignment.familyId,
    //   userId: bountyAssignment.userId,
    //   message: `Task "${bountyTemplate.title}" verified by ${verifierName}! Reward added.`,
    //   isRead: false,
    //   timestamp: Date.now()
    // });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("verifyBounty error:", res.status, body);
      throw new Error(body?.error || "Failed to verify bounty");
    }
  },

  deleteBountyAssignment: async (id: string): Promise<void> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(apiUrl(`/bounty-assignments/${id}`), {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("deleteBountyAssignment error:", res.status, body);
      throw new Error(body?.error || "Failed to delete bounty assignment");
    }
  },

  // --- COMMON ---

  // Per-child history (WalletView)
  getHistoryEvents: async (
    familyId: string,
    userId: string
  ): Promise<HistoryEvent[]> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
    const res = await fetch(
      apiUrl(`/families/${familyId}/history${query}`),
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error(
        "getHistoryEvents error",
        res.status,
        body
      );
      throw new Error(body?.error || "Failed to load history");
    }

    const backendEvents = await res.json();

    return backendEvents
      .map((h: any): HistoryEvent => ({
        id: h.id,
        familyId: h.familyId,
        userId: h.userId,
        userName: h.userName,
        title: h.title,
        emoji: h.emoji,
        action: h.action,
        assignerName: h.assignerName,
        // Frontend expects `timestamp` as number
        timestamp:
          typeof h.timestamp === "number"
            ? h.timestamp
            : h.createdAt
            ? new Date(h.createdAt).getTime()
            : Date.now(),
      }))
      .sort((a, b) => b.timestamp - a.timestamp);
  },

  // Family-wide history (AdminView)
  getFamilyHistory: async (
    familyId: string
  ): Promise<HistoryEvent[]> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(
      apiUrl(`/families/${familyId}/history`),
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error(
        "getFamilyHistory error",
        res.status,
        body
      );
      throw new Error(body?.error || "Failed to load family history");
    }

    const backendEvents = await res.json();

    return backendEvents
      .map((h: any): HistoryEvent => ({
        id: h.id,
        familyId: h.familyId,
        userId: h.userId,
        userName: h.userName,
        title: h.title,
        emoji: h.emoji,
        action: h.action,
        assignerName: h.assignerName,
        timestamp:
          typeof h.timestamp === "number"
            ? h.timestamp
            : h.createdAt
            ? new Date(h.createdAt).getTime()
            : Date.now(),
      }))
      .sort((a, b) => b.timestamp - a.timestamp);
  },

  getNotifications: async (
    userId: string
  ): Promise<AppNotification[]> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(
      apiUrl(`/users/${userId}/notifications`),
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error(
        "getNotifications error",
        res.status,
        body
      );
      throw new Error(body?.error || "Failed to load notifications");
    }

    const backendNotifications = await res.json();

    return backendNotifications
      .map((n: any): AppNotification => ({
        id: n.id,
        userId: n.userId,
        message: n.message,
        isRead: !!n.isRead,
        timestamp:
          typeof n.timestamp === "number"
            ? n.timestamp
            : n.createdAt
            ? new Date(n.createdAt).getTime()
            : Date.now(),
      }))
      .sort((a, b) => b.timestamp - a.timestamp);
  },

  markNotificationRead: async (id: string): Promise<void> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(
      apiUrl(`/notifications/${id}/read`),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error(
        "markNotificationRead error",
        res.status,
        body
      );
      throw new Error(
        body?.error || "Failed to mark notification read"
      );
    }
  },

  markAllNotificationsRead: async (
    userId: string
  ): Promise<void> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(
      apiUrl(`/users/${userId}/notifications/read-all`),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error(
        "markAllNotificationsRead error",
        res.status,
        body
      );
      throw new Error(
        body?.error || "Failed to mark all notifications read"
      );
    }
  },
};
