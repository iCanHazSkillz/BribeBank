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
  BountyStatus,
  StoreItem,
  WheelSegment
} from '../types';
import { API_BASE, apiUrl } from "../config";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

const DB_KEY = 'famrewards_production_db_v6'; // Bumped version
const SESSION_KEY = 'famrewards_session_v1';
const LAST_LOGIN_METHOD_KEY = "bb_last_login_method_v1";
const PREFERRED_LOGIN_METHOD_KEY = "bb_preferred_login_method_v1";
const LAST_USERNAME_KEY = "bb_last_username_v1";
const QUICK_LOGIN_CAPABILITIES_KEY = "bb_quick_login_capabilities_v1";
const PIN_BUNDLE_KEY = "bb_pin_bundle_v1";
const PIN_LOCK_KEY = "bb_pin_lock_v1";
const DEVICE_KEY_ID_KEY = "bb_device_key_id_v1";
const PIN_KDF_ITERATIONS = 150000;
const PIN_MAX_FAILED_ATTEMPTS = 5;
const NOTIFICATION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

interface DatabaseSchema {
  families: Family[];
  users: User[];
  templates: PrizeTemplate[];
  assignments: AssignedPrize[];
  bountyTemplates: BountyTemplate[];
  bountyAssignments: AssignedBounty[];
  storeItems: StoreItem[];
  wheelSegments: Record<string, WheelSegment[]>; // keyed by familyId
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
  storeItems: [],
  wheelSegments: {},
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

type QuickLoginMethod = "password" | "passkey" | "pin" | "session";
type PreferredLoginMethod = Exclude<QuickLoginMethod, "session">;

type PinBundle = {
  deviceKeyId: string;
  usernameKey: string;
  encryptedTokenB64: string;
  ivB64: string;
  saltB64: string;
  iterations: number;
  createdAt: number;
  needsRelink?: boolean;
  lastInvalidTokenAt?: number;
};

type PinLockState = {
  failedAttempts: number;
  lockedUntilFullLogin: boolean;
};

type QuickLoginCapabilities = {
  hasPasskey: boolean;
  hasDeviceTokenMethod: boolean;
  updatedAt: number;
};

type QuickLoginStatusResponse = {
  hasPasskey: boolean;
  hasDeviceTokenMethod: boolean;
  setupPromptSeen: boolean;
  needsInitialSetupPrompt: boolean;
};

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function setLastLoginMethod(method: QuickLoginMethod) {
  sessionStorage.setItem(LAST_LOGIN_METHOD_KEY, method);
  if (method === "password" || method === "passkey" || method === "pin") {
    localStorage.setItem(PREFERRED_LOGIN_METHOD_KEY, method);
  }
}

function setCachedLoginUsername(username: string) {
  const normalized = normalizeUsername(username);
  if (!normalized) return;
  localStorage.setItem(LAST_USERNAME_KEY, normalized);
}

function getCachedLoginUsername(): string | null {
  const cached = localStorage.getItem(LAST_USERNAME_KEY);
  if (!cached) return null;
  const normalized = normalizeUsername(cached);
  return normalized || null;
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function bytesFromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function readPinBundles(): Record<string, PinBundle> {
  const raw = localStorage.getItem(PIN_BUNDLE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writePinBundles(value: Record<string, PinBundle>) {
  localStorage.setItem(PIN_BUNDLE_KEY, JSON.stringify(value));
}

function readPinLocks(): Record<string, PinLockState> {
  const raw = localStorage.getItem(PIN_LOCK_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writePinLocks(value: Record<string, PinLockState>) {
  localStorage.setItem(PIN_LOCK_KEY, JSON.stringify(value));
}

function readQuickLoginCapabilitiesByUsername(): Record<string, QuickLoginCapabilities> {
  const raw = localStorage.getItem(QUICK_LOGIN_CAPABILITIES_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeQuickLoginCapabilitiesByUsername(value: Record<string, QuickLoginCapabilities>) {
  localStorage.setItem(QUICK_LOGIN_CAPABILITIES_KEY, JSON.stringify(value));
}

function setQuickLoginCapabilitiesForUsername(
  username: string,
  capabilities: Pick<QuickLoginCapabilities, "hasPasskey" | "hasDeviceTokenMethod">
) {
  const normalized = normalizeUsername(username);
  if (!normalized) return;
  const all = readQuickLoginCapabilitiesByUsername();
  all[normalized] = {
    hasPasskey: !!capabilities.hasPasskey,
    hasDeviceTokenMethod: !!capabilities.hasDeviceTokenMethod,
    updatedAt: Date.now(),
  };
  writeQuickLoginCapabilitiesByUsername(all);
}

function getSessionUsername(): string | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.username === "string") {
      return normalizeUsername(parsed.username);
    }
  } catch {
    return null;
  }
  return null;
}

function getOrCreateDeviceKeyId(): string {
  const existing = localStorage.getItem(DEVICE_KEY_ID_KEY);
  if (existing) return existing;

  const generated =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(DEVICE_KEY_ID_KEY, generated);
  return generated;
}

function ensureWebCrypto(): SubtleCrypto {
  if (!window.crypto?.subtle) {
    throw new Error("CRYPTO_UNAVAILABLE");
  }
  return window.crypto.subtle;
}

async function usernameKey(username: string): Promise<string> {
  const subtle = ensureWebCrypto();
  const digest = await subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalizeUsername(username))
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function validatePin(pin: string) {
  if (!/^\d{4}$/.test(pin)) {
    throw new Error("PIN_MUST_BE_4_DIGITS");
  }
}

async function derivePinKey(pin: string, salt: Uint8Array, iterations: number) {
  const subtle = ensureWebCrypto();
  const keyMaterial = await subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptTokenWithPin(pin: string, token: string) {
  validatePin(pin);
  const subtle = ensureWebCrypto();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derivePinKey(pin, salt, PIN_KDF_ITERATIONS);
  const encrypted = await subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(token)
  );

  return {
    encryptedTokenB64: base64FromBytes(new Uint8Array(encrypted)),
    ivB64: base64FromBytes(iv),
    saltB64: base64FromBytes(salt),
    iterations: PIN_KDF_ITERATIONS,
  };
}

async function decryptTokenWithPin(pin: string, bundle: PinBundle): Promise<string> {
  validatePin(pin);
  const subtle = ensureWebCrypto();
  const iv = bytesFromBase64(bundle.ivB64);
  const salt = bytesFromBase64(bundle.saltB64);
  const encrypted = bytesFromBase64(bundle.encryptedTokenB64);
  const key = await derivePinKey(pin, salt, bundle.iterations);

  const decrypted = await subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    encrypted
  );

  return new TextDecoder().decode(decrypted);
}

function mapBackendUserToSessionUser(backendUser: any): User {
  return {
    id: backendUser.id,
    familyId: backendUser.familyId ?? backendUser.family?.id,
    username: backendUser.username,
    name: backendUser.displayName,
    role: backendUser.role === "PARENT" ? UserRole.ADMIN : UserRole.USER,
    avatarColor: backendUser.avatarColor || "bg-blue-500",
    avatarUrl: backendUser.avatarUrl || undefined,
    ticketBalance: backendUser.ticketBalance || 0,
  };
}

async function fetchSessionUserWithToken(token: string): Promise<User> {
  const meRes = await fetch(apiUrl("/auth/me"), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!meRes.ok) {
    throw new Error("Failed to fetch user profile");
  }

  const backendUser = await meRes.json();
  const sessionUser = mapBackendUserToSessionUser(backendUser);
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
  return sessionUser;
}

async function clearPinLockForUsername(username: string): Promise<void> {
  let key: string;
  try {
    key = await usernameKey(username);
  } catch (err: any) {
    // On non-secure HTTP origins (e.g. LAN IP), SubtleCrypto is unavailable.
    // Do not block normal password/passkey login when PIN local crypto cannot run.
    if (err?.message === "CRYPTO_UNAVAILABLE") {
      return;
    }
    throw err;
  }
  const locks = readPinLocks();
  if (!locks[key]) return;
  locks[key] = {
    failedAttempts: 0,
    lockedUntilFullLogin: false,
  };
  writePinLocks(locks);
}

type PushSubscriptionKeys = {
  p256dh: string;
  auth: string;
};

type PushSubscription = {
  endpoint: string;
  keys: PushSubscriptionKeys;
};

//Helper to convert VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length) as Uint8Array;

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray as Uint8Array<ArrayBuffer>;
}

async function fetchPushPublicKey(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/push/public-key`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.publicKey as string;
  } catch (e) {
    console.error("fetchPushPublicKey error", e);
    return null;
  }
}

async function sendPushSubscriptionToServer(subscription: PushSubscription) {
  const token = localStorage.getItem("bribebank_token");
  if (!token) return;

  await fetch(`${API_BASE}/push/subscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(subscription),
  });
}

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

const DEFAULT_WHEEL_SEGMENTS: WheelSegment[] = [
    { id: 'ws_1', label: 'Not this time', color: '#9CA3AF', prob: 0.2 },
    { id: 'ws_2', label: '30 Minute Screen Time', color: '#60A5FA', prob: 0.1 },
    { id: 'ws_3', label: 'Pick supper', color: '#F472B6', prob: 0.1 },
    { id: 'ws_4', label: 'Free Pop', color: '#818CF8', prob: 0.1 },
    { id: 'ws_5', label: 'Candy Run', color: '#FCD34D', prob: 0.1 },
    { id: 'ws_6', label: 'Date Night', color: '#9CA3AF', prob: 0.1 },
    { id: 'ws_7', label: '1 Hour Screen Time', color: '#34D399', prob: 0.1 },
    { id: 'ws_8', label: 'Movie Night', color: '#A78BFA', prob: 0.1 },
    { id: 'ws_9', label: 'JACKPOT - $20', color: '#EF4444', prob: 0.1 },
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
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
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

    const sessionUser = await fetchSessionUserWithToken(token);
    setLastLoginMethod("password");
    setCachedLoginUsername(sessionUser.username);
    await clearPinLockForUsername(sessionUser.username);
    void storageService.syncQuickLoginCapabilitiesForCurrentUser().catch(() => {});
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
    const sessionUser = await fetchSessionUserWithToken(token);
    setLastLoginMethod("password");
    setCachedLoginUsername(sessionUser.username);
    await clearPinLockForUsername(sessionUser.username);
    void storageService.syncQuickLoginCapabilitiesForCurrentUser().catch(() => {});
    return sessionUser;
  },

  logout: () => {
    // Blow away auth + session + local fake DB
    localStorage.removeItem("bribebank_token");
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(DB_KEY);
    sessionStorage.removeItem(LAST_LOGIN_METHOD_KEY);
  },
  
  getCurrentUser: (): User | null => {
    const stored = localStorage.getItem(SESSION_KEY);
    return stored ? JSON.parse(stored) : null;
  },

  refreshSession: async (): Promise<User> => {
    const token = getAuthToken();
    if (!token) {
      throw new Error("No auth token");
    }

    const res = await fetch(apiUrl("/auth/me"), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      if (res.status === 401) {
        const body = await res.json().catch(() => null);
        if (body?.error === "SESSION_STALE") {
          throw new Error("SESSION_STALE");
        }
      }
      // Token invalid / expired
      throw new Error("SESSION_INVALID");
    }

    const backendUser = await res.json();
    const sessionUser = mapBackendUserToSessionUser(backendUser);
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
    setLastLoginMethod("session");
    return sessionUser;
  },

  getRecoveryKeyStatus: async (): Promise<{ configured: boolean; updatedAt?: string | null }> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(apiUrl("/auth/recovery-key/status"), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || "Failed to load recovery key status");
    }

    return await res.json();
  },

  regenerateRecoveryKey: async (): Promise<{ recoveryKey: string; updatedAt: string }> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(apiUrl("/auth/recovery-key/regenerate"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || "Failed to regenerate recovery key");
    }

    return await res.json();
  },

  resetForgottenPassword: async (
    username: string,
    recoveryKey: string,
    newPassword: string
  ): Promise<{ newRecoveryKey: string; rotatedAt: string }> => {
    const res = await fetch(apiUrl("/auth/forgot-password/reset"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: username.trim().toLowerCase(),
        recoveryKey: recoveryKey.trim().toUpperCase(),
        newPassword,
      }),
    });

    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(body?.error || "Failed to reset forgotten password");
    }

    return {
      newRecoveryKey: body.newRecoveryKey,
      rotatedAt: body.rotatedAt,
    };
  },

  consumeLastLoginMethod: (): QuickLoginMethod | null => {
    const raw = sessionStorage.getItem(LAST_LOGIN_METHOD_KEY);
    sessionStorage.removeItem(LAST_LOGIN_METHOD_KEY);
    if (
      raw === "password" ||
      raw === "passkey" ||
      raw === "pin" ||
      raw === "session"
    ) {
      return raw;
    }
    return null;
  },

  getPreferredLoginMethod: (): PreferredLoginMethod | null => {
    const raw = localStorage.getItem(PREFERRED_LOGIN_METHOD_KEY);
    if (raw === "password" || raw === "passkey" || raw === "pin") {
      return raw;
    }
    return null;
  },

  getCachedLoginUsername: (): string | null => {
    return getCachedLoginUsername();
  },

  setCachedLoginUsername: (username: string): void => {
    setCachedLoginUsername(username);
  },

  getCachedQuickLoginCapabilities: (
    username: string
  ): { hasPasskey: boolean; hasDeviceTokenMethod: boolean } | null => {
    const normalized = normalizeUsername(username);
    if (!normalized) return null;
    const all = readQuickLoginCapabilitiesByUsername();
    const cached = all[normalized];
    if (!cached) return null;
    return {
      hasPasskey: !!cached.hasPasskey,
      hasDeviceTokenMethod: !!cached.hasDeviceTokenMethod,
    };
  },

  syncQuickLoginCapabilitiesForCurrentUser: async (): Promise<void> => {
    await storageService.getQuickLoginStatus();
  },

  isPasskeySupported: (): boolean => {
    return !!window.PublicKeyCredential && window.isSecureContext;
  },

  getQuickLoginStatus: async (): Promise<QuickLoginStatusResponse> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(apiUrl("/auth/quick-login/status"), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || "Failed to load quick login status");
    }

    const status = (await res.json()) as QuickLoginStatusResponse;
    const sessionUsername = getSessionUsername();
    if (sessionUsername) {
      setQuickLoginCapabilitiesForUsername(sessionUsername, {
        hasPasskey: status.hasPasskey,
        hasDeviceTokenMethod: status.hasDeviceTokenMethod,
      });
    }
    return status;
  },

  markQuickLoginPromptSeen: async (): Promise<void> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(apiUrl("/auth/quick-login/prompt-seen"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || "Failed to mark prompt");
    }
  },

  getPasskeyRegisterOptions: async (): Promise<{
    challengeId: string;
    options: any;
  }> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(apiUrl("/auth/passkeys/register/options"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || "Failed to get passkey options");
    }

    return await res.json();
  },

  verifyPasskeyRegistration: async (challengeId: string, response: any): Promise<void> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(apiUrl("/auth/passkeys/register/verify"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ challengeId, response }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || "Failed to verify passkey");
    }
  },

  getPasskeyAuthOptions: async (): Promise<{
    challengeId: string;
    options: any;
  }> => {
    const res = await fetch(apiUrl("/auth/passkeys/authenticate/options"), {
      method: "POST",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || "Failed to get passkey auth options");
    }
    return await res.json();
  },

  verifyPasskeyAuthentication: async (
    challengeId: string,
    response: any
  ): Promise<{ token: string }> => {
    const res = await fetch(apiUrl("/auth/passkeys/authenticate/verify"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ challengeId, response }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || "Passkey login failed");
    }

    return await res.json();
  },

  loginWithPasskey: async (): Promise<User> => {
    if (!storageService.isPasskeySupported()) {
      throw new Error("PASSKEY_UNAVAILABLE");
    }

    const { challengeId, options } = await storageService.getPasskeyAuthOptions();
    const assertion = await startAuthentication(options);
    const { token } = await storageService.verifyPasskeyAuthentication(challengeId, assertion);
    if (!token) {
      throw new Error("PASSKEY_LOGIN_FAILED");
    }

    localStorage.setItem("bribebank_token", token);
    const sessionUser = await fetchSessionUserWithToken(token);
    setLastLoginMethod("passkey");
    setCachedLoginUsername(sessionUser.username);
    await clearPinLockForUsername(sessionUser.username);
    void storageService.syncQuickLoginCapabilitiesForCurrentUser().catch(() => {});
    return sessionUser;
  },

  registerPasskey: async (): Promise<void> => {
    if (!storageService.isPasskeySupported()) {
      throw new Error("PASSKEY_UNAVAILABLE");
    }

    const { challengeId, options } = await storageService.getPasskeyRegisterOptions();
    const attestation = await startRegistration(options);
    await storageService.verifyPasskeyRegistration(challengeId, attestation);
  },

  listPasskeys: async (): Promise<Array<{ id: string; createdAt: string; lastUsedAt?: string | null; transports: string[] }>> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(apiUrl("/auth/passkeys"), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || "Failed to load passkeys");
    }

    return await res.json();
  },

  removePasskey: async (passkeyId: string): Promise<void> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(apiUrl(`/auth/passkeys/${passkeyId}`), {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || "Failed to remove passkey");
    }
  },

  createDeviceToken: async (): Promise<{ token: string; deviceKeyId: string }> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");
    const deviceKeyId = getOrCreateDeviceKeyId();

    const res = await fetch(apiUrl("/auth/device-token/create"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ deviceKeyId }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || "Failed to create device token");
    }

    return await res.json();
  },

  loginWithDeviceToken: async (rawDeviceToken: string): Promise<{ token: string }> => {
    const res = await fetch(apiUrl("/auth/device-token/login"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: rawDeviceToken }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || "Device token login failed");
    }

    return await res.json();
  },

  getCurrentDeviceTokenStatus: async (
    deviceKeyIdOverride?: string
  ): Promise<{ hasActiveToken: boolean }> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");
    const deviceKeyId = deviceKeyIdOverride?.trim() || getOrCreateDeviceKeyId();

    const res = await fetch(apiUrl("/auth/device-token/current/status"), {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-device-key-id": deviceKeyId,
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || "Failed to get device token status");
    }

    return await res.json();
  },

  revokeCurrentDeviceToken: async (): Promise<void> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");
    const deviceKeyId = getOrCreateDeviceKeyId();

    const res = await fetch(apiUrl("/auth/device-token/current"), {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-device-key-id": deviceKeyId,
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || "Failed to revoke device token");
    }
  },

  getPinQuickLoginInfo: async (
    username: string
  ): Promise<{ available: boolean; locked: boolean; failedAttempts: number }> => {
    const key = await usernameKey(username);
    const bundles = readPinBundles();
    const locks = readPinLocks();
    const lock = locks[key] || {
      failedAttempts: 0,
      lockedUntilFullLogin: false,
    };

    return {
      available: !!bundles[key],
      locked: !!lock.lockedUntilFullLogin,
      failedAttempts: lock.failedAttempts,
    };
  },

  getPinQuickLoginHealth: async (
    username: string
  ): Promise<{
    localConfigured: boolean;
    locked: boolean;
    failedAttempts: number;
    serverLinked: boolean | null;
    needsRelink: boolean;
  }> => {
    const key = await usernameKey(username);
    const bundles = readPinBundles();
    const locks = readPinLocks();
    const bundle = bundles[key];
    const lock = locks[key] || {
      failedAttempts: 0,
      lockedUntilFullLogin: false,
    };

    if (!bundle) {
      return {
        localConfigured: false,
        locked: !!lock.lockedUntilFullLogin,
        failedAttempts: lock.failedAttempts,
        serverLinked: null,
        needsRelink: false,
      };
    }

    const token = getAuthToken();
    if (!token) {
      return {
        localConfigured: true,
        locked: !!lock.lockedUntilFullLogin,
        failedAttempts: lock.failedAttempts,
        serverLinked: null,
        needsRelink: !!bundle.needsRelink,
      };
    }

    let serverLinked: boolean | null = null;
    try {
      const status = await storageService.getCurrentDeviceTokenStatus(bundle.deviceKeyId);
      serverLinked = !!status.hasActiveToken;
    } catch {
      serverLinked = null;
    }

    return {
      localConfigured: true,
      locked: !!lock.lockedUntilFullLogin,
      failedAttempts: lock.failedAttempts,
      serverLinked,
      needsRelink: !!bundle.needsRelink || serverLinked === false,
    };
  },

  enablePinQuickLogin: async (pin: string): Promise<void> => {
    validatePin(pin);
    const sessionUser = storageService.getCurrentUser();
    if (!sessionUser) throw new Error("Not authenticated");

    const { token: rawDeviceToken, deviceKeyId } = await storageService.createDeviceToken();
    const encrypted = await encryptTokenWithPin(pin, rawDeviceToken);
    const key = await usernameKey(sessionUser.username);

    const bundles = readPinBundles();
    bundles[key] = {
      deviceKeyId,
      usernameKey: key,
      encryptedTokenB64: encrypted.encryptedTokenB64,
      ivB64: encrypted.ivB64,
      saltB64: encrypted.saltB64,
      iterations: encrypted.iterations,
      createdAt: Date.now(),
      needsRelink: false,
    };
    writePinBundles(bundles);

    const locks = readPinLocks();
    locks[key] = {
      failedAttempts: 0,
      lockedUntilFullLogin: false,
    };
    writePinLocks(locks);
    void storageService.syncQuickLoginCapabilitiesForCurrentUser().catch(() => {});
  },

  disablePinQuickLogin: async (): Promise<void> => {
    const sessionUser = storageService.getCurrentUser();
    if (!sessionUser) throw new Error("Not authenticated");
    const key = await usernameKey(sessionUser.username);

    const bundles = readPinBundles();
    if (bundles[key]) {
      delete bundles[key];
      writePinBundles(bundles);
    }

    const locks = readPinLocks();
    if (locks[key]) {
      delete locks[key];
      writePinLocks(locks);
    }

    await storageService.revokeCurrentDeviceToken();
    void storageService.syncQuickLoginCapabilitiesForCurrentUser().catch(() => {});
  },

  repairPinQuickLogin: async (pin: string): Promise<void> => {
    validatePin(pin);
    const sessionUser = storageService.getCurrentUser();
    if (!sessionUser) throw new Error("Not authenticated");
    const key = await usernameKey(sessionUser.username);
    const bundles = readPinBundles();
    const bundle = bundles[key];
    if (!bundle) {
      throw new Error("PIN_NOT_CONFIGURED");
    }

    try {
      await decryptTokenWithPin(pin, bundle);
    } catch {
      throw new Error("INVALID_PIN");
    }

    const { token: rawDeviceToken, deviceKeyId } = await storageService.createDeviceToken();
    const encrypted = await encryptTokenWithPin(pin, rawDeviceToken);

    bundles[key] = {
      ...bundle,
      deviceKeyId,
      encryptedTokenB64: encrypted.encryptedTokenB64,
      ivB64: encrypted.ivB64,
      saltB64: encrypted.saltB64,
      iterations: encrypted.iterations,
      needsRelink: false,
    };
    delete bundles[key].lastInvalidTokenAt;
    writePinBundles(bundles);

    const locks = readPinLocks();
    locks[key] = {
      failedAttempts: 0,
      lockedUntilFullLogin: false,
    };
    writePinLocks(locks);

    void storageService.syncQuickLoginCapabilitiesForCurrentUser().catch(() => {});
  },

  loginWithPin: async (username: string, pin: string): Promise<User> => {
    validatePin(pin);
    const normalized = normalizeUsername(username);
    const key = await usernameKey(normalized);
    const bundles = readPinBundles();
    const bundle = bundles[key];
    if (!bundle) {
      throw new Error("PIN_NOT_CONFIGURED");
    }

    const locks = readPinLocks();
    const lock = locks[key] || {
      failedAttempts: 0,
      lockedUntilFullLogin: false,
    };

    if (lock.lockedUntilFullLogin) {
      throw new Error("PIN_LOCKED_REQUIRES_FULL_LOGIN");
    }

    let rawToken: string;
    try {
      rawToken = await decryptTokenWithPin(pin, bundle);
    } catch {
      const failed = (lock.failedAttempts || 0) + 1;
      const locked = failed >= PIN_MAX_FAILED_ATTEMPTS;
      locks[key] = {
        failedAttempts: failed,
        lockedUntilFullLogin: locked,
      };
      writePinLocks(locks);
      if (locked) {
        throw new Error("PIN_LOCKED_REQUIRES_FULL_LOGIN");
      }
      throw new Error("INVALID_PIN");
    }

    try {
      const { token } = await storageService.loginWithDeviceToken(rawToken);
      localStorage.setItem("bribebank_token", token);
      const sessionUser = await fetchSessionUserWithToken(token);
      setLastLoginMethod("pin");
      setCachedLoginUsername(sessionUser.username);

      if (bundle.needsRelink) {
        bundles[key] = {
          ...bundle,
          needsRelink: false,
        };
        delete bundles[key].lastInvalidTokenAt;
        writePinBundles(bundles);
      }
      locks[key] = {
        failedAttempts: 0,
        lockedUntilFullLogin: false,
      };
      writePinLocks(locks);

      void storageService.syncQuickLoginCapabilitiesForCurrentUser().catch(() => {});
      return sessionUser;
    } catch (err: any) {
      const backendCode = err?.message;
      if (backendCode === "INVALID_DEVICE_TOKEN") {
        bundles[key] = {
          ...bundle,
          needsRelink: true,
          lastInvalidTokenAt: Date.now(),
        };
        writePinBundles(bundles);
        throw new Error("PIN_RELINK_REQUIRED");
      }
      throw new Error("PIN_LOGIN_FAILED");
    }
  },


  // --- USER MANAGEMENT ---

  getUser: async (userId: string): Promise<User> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");
    
    const res = await fetch(apiUrl(`/users/${userId}`), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      console.error("Failed to fetch user", res.status);
      throw new Error("Failed to fetch user");
    }

    const u = await res.json();

    return {
      id: u.id,
      familyId: u.familyId,
      username: u.username,
      name: u.displayName,
      role: u.role === "PARENT" ? UserRole.ADMIN : UserRole.USER,
      avatarColor: u.avatarColor || "bg-blue-500",
      avatarUrl: u.avatarUrl || undefined,
      ticketBalance: u.ticketBalance || 0,
    };
  },

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
      //displayName: u.displayName,   // <- for consistency
      role: u.role === "PARENT" ? UserRole.ADMIN : UserRole.USER,
      avatarColor: u.avatarColor || "bg-blue-500",
      avatarUrl: u.avatarUrl || undefined,
      ticketBalance: u.ticketBalance || 0,
    }));
  },


  createUser: async (
    creator: User,
    name: string,
    username: string,
    password: string,
    role: UserRole,
    avatarColor: string,
    avatarUrl?: string
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
        avatarColor,
        avatarUrl: avatarUrl || null,
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

    if (updates.avatarUrl !== undefined) {
      payload.avatarUrl = updates.avatarUrl;
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

      // Return the response data which includes avatar size info
      const data = await res.json();
      return data;
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

  deleteCurrentUser: async (userId: string): Promise<void> => {
    try {
      await storageService.deleteUser(userId, userId);
    } catch (err: any) {
      throw new Error(err?.message || "Failed to delete current user");
    }
  },

  deleteCurrentFamily: async (): Promise<void> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(apiUrl("/auth/family"), {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("deleteCurrentFamily failed", res.status, body);
      throw new Error(body?.error || "Failed to delete family");
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

  // Child cancels a pending prize claim (rolls card back to available)
  cancelPrizeClaim: async (assignmentId: string): Promise<void> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(
      apiUrl(`/assigned-prizes/${assignmentId}/cancel`),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("Failed to cancel prize claim", res.status, body);
      throw new Error(body?.error || "Failed to cancel prize claim");
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
        rewardType: b.rewardType ?? 'CUSTOM',
        rewardValue: b.rewardValue,
        rewardTemplateId: b.rewardTemplateId ?? undefined,
        isFCFS: !!b.isFCFS,
        requiresPhoto: !!b.requiresPhoto,
        themeColor: b.themeColor ?? null,
        deadlineHours: b.deadlineHours ?? undefined,
        recurrenceEnabled: !!b.recurrenceEnabled,
        recurrenceCadence: b.recurrenceCadence ?? null,
        recurrencePattern: b.recurrencePattern ?? null,
        recurrenceDayOfWeek: b.recurrenceDayOfWeek ?? null,
        recurrenceDayOfMonth: b.recurrenceDayOfMonth ?? null,
        recurrenceWeekOfMonth: b.recurrenceWeekOfMonth ?? null,
        recurrenceMonthOfYear: b.recurrenceMonthOfYear ?? null,
        streakEnabled: !!b.streakEnabled,
        streakMilestones: Array.isArray(b.streakMilestones)
          ? b.streakMilestones.map((m: any) => ({
              id: m.id,
              threshold: m.threshold,
              rewardType: m.rewardType,
              rewardValue: m.rewardValue,
            }))
          : [],
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
      rewardType: template.rewardType ?? 'CUSTOM',
      rewardValue: template.rewardValue,
      isFCFS: !!template.isFCFS,
      requiresPhoto: !!template.requiresPhoto,
      themeColor: template.themeColor ?? null,
      deadlineHours: template.deadlineHours ?? null,
      recurrenceEnabled: !!template.recurrenceEnabled,
      recurrenceCadence: template.recurrenceCadence ?? null,
      recurrencePattern: template.recurrencePattern ?? null,
      recurrenceDayOfWeek: template.recurrenceDayOfWeek ?? null,
      recurrenceDayOfMonth: template.recurrenceDayOfMonth ?? null,
      recurrenceWeekOfMonth: template.recurrenceWeekOfMonth ?? null,
      recurrenceMonthOfYear: template.recurrenceMonthOfYear ?? null,
      streakEnabled: !!template.streakEnabled,
      streakMilestones: template.streakMilestones ?? [],
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
        assignerName: a.assignerName,
        status: a.status as BountyStatus,
        assignedAt: new Date(a.assignedAt).getTime(),
        completedAt: a.completedAt
          ? new Date(a.completedAt).getTime()
          : undefined,
        denialReason: a.denialReason || null,
        denialNotes: a.denialNotes || null,
        deniedAt: a.deniedAt ? new Date(a.deniedAt).getTime() : null,
        deadlineStartedAt: a.deadlineStartedAt ? new Date(a.deadlineStartedAt).getTime() : undefined,
        deadlineExpiresAt: a.deadlineExpiresAt ? new Date(a.deadlineExpiresAt).getTime() : undefined,
        photoUrl: a.photoUrl || null,
        recurrenceSeriesId: a.recurrenceSeriesId ?? null,
        seriesActive: !!a.seriesActive,
        seriesPaused: !!a.seriesPaused,
        seriesPausedAt: a.seriesPausedAt ? new Date(a.seriesPausedAt).getTime() : null,
        seriesAutoResumeSkipAt: a.seriesAutoResumeSkipAt ? new Date(a.seriesAutoResumeSkipAt).getTime() : null,
        currentStreak: typeof a.currentStreak === "number" ? a.currentStreak : 0,
        streakEnabled: !!a.streakEnabled,
        isRecurring: !!a.isRecurring,
        nextOccurrenceAt: a.nextOccurrenceAt ? new Date(a.nextOccurrenceAt).getTime() : null,
        isCurrentOccurrence: !!a.isCurrentOccurrence,
        // if your UI needs bounty/user nested data, you can also keep a.bounty / a.user
      })
    );
  },

  updateBountyStatus: async (
    assignmentId: string,
    status: BountyStatus,
    photoUrl?: string
  ): Promise<void> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    let endpoint = "";
    let bodyData: any = {};

    if (status === BountyStatus.IN_PROGRESS) {
      endpoint = `/bounty-assignments/${assignmentId}/accept`;
    } else if (status === BountyStatus.COMPLETED) {
      endpoint = `/bounty-assignments/${assignmentId}/complete`;
      if (photoUrl) {
        bodyData.photoUrl = photoUrl;
      }
    } else {
      throw new Error("Unsupported bounty status transition");
    }

    const res = await fetch(apiUrl(endpoint), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: Object.keys(bodyData).length > 0 ? JSON.stringify(bodyData) : undefined
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

  denyBounty: async (assignmentId: string, denialReason: string, denialNotes?: string, allowResubmit: boolean = true): Promise<void> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(
      apiUrl(`/bounty-assignments/${assignmentId}/deny`),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ denialReason, denialNotes: denialNotes || '', allowResubmit })
      }
    );

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("denyBounty error:", res.status, body);
      throw new Error(body?.error || "Failed to deny bounty");
    }
  },

  cancelBountyAssignment: async (id: string): Promise<void> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(apiUrl(`/bounty-assignments/${id}/cancel`), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("cancelBountyAssignment error:", res.status, body);
      throw new Error(body?.error || "Failed to cancel bounty assignment");
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

  pauseBountySeries: async (
    seriesId: string,
    options?: { autoResumeSkipNext?: boolean }
  ): Promise<void> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(apiUrl(`/bounty-series/${seriesId}/pause`), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        autoResumeSkipNext:
          typeof options?.autoResumeSkipNext === "boolean"
            ? options.autoResumeSkipNext
            : true,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("pauseBountySeries error:", res.status, body);
      throw new Error(body?.error || "Failed to pause recurring series");
    }
  },

  resumeBountySeries: async (seriesId: string): Promise<void> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(apiUrl(`/bounty-series/${seriesId}/resume`), {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("resumeBountySeries error:", res.status, body);
      throw new Error(body?.error || "Failed to resume recurring series");
    }
  },

  stopBountySeries: async (seriesId: string): Promise<void> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(apiUrl(`/bounty-series/${seriesId}/stop`), {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("stopBountySeries error:", res.status, body);
      throw new Error(body?.error || "Failed to stop recurring series");
    }
  },

  giveTickets: async (userId: string, amount: number): Promise<void> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(apiUrl(`/users/${userId}/tickets`), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ amount }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("giveTickets error:", res.status, body);
      throw new Error(body?.error || "Failed to give tickets");
    }
  },

  // --- STORE ITEMS ---

  getStoreItems: async (familyId: string): Promise<StoreItem[]> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(apiUrl(`/families/${familyId}/store-items`), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("Failed to fetch store items", res.status, body);
      throw new Error(body?.error || "Failed to fetch store items");
    }

    return await res.json();
  },

  saveStoreItem: async (item: StoreItem, notifyUserIds: string[] = []): Promise<void> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const isLocalId = /^\d+$/.test(item.id);
    const url = isLocalId
      ? apiUrl(`/families/${item.familyId}/store-items`)
      : apiUrl(`/store-items/${item.id}`);
    const method = isLocalId ? "POST" : "PUT";

    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ...item,
        notifyUserIds: isLocalId ? notifyUserIds : undefined,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("Failed to save store item", res.status, body);
      throw new Error(body?.error || "Failed to save store item");
    }
  },

  deleteStoreItem: async (id: string): Promise<void> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(apiUrl(`/store-items/${id}`), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("Failed to delete store item", res.status, body);
      throw new Error(body?.error || "Failed to delete store item");
    }
  },

  purchaseStoreItem: async (itemId: string, userId: string): Promise<void> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(apiUrl(`/store-items/${itemId}/purchase`), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ userId }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("Failed to purchase store item", res.status, body);
      throw new Error(body?.error || "Failed to purchase store item");
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
        metadata: h.metadata ?? null,
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
        metadata: h.metadata ?? null,
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
    const cutoff = Date.now() - NOTIFICATION_RETENTION_MS;

    return backendNotifications
      .map((n: any): AppNotification => ({
        id: n.id,
        userId: n.userId,
        familyId: n.familyId,
        message: n.message,
        isRead: !!n.isRead,
        timestamp:
          typeof n.timestamp === "number"
            ? n.timestamp
            : n.createdAt
            ? new Date(n.createdAt).getTime()
            : Date.now(),
      }))
      .filter((n) => n.timestamp >= cutoff)
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

  registerPushNotifications: async (): Promise<void> => {
    try {
      // Detect TWA environment
      const isTWA = document.referrer.includes("android-app://");
      const isStandalone = window.matchMedia("(display-mode: standalone)").matches || 
                           (window.navigator as any).standalone;
      
      console.log("[push] Starting registration...");
      console.log("[push] Environment:", {
        isTWA,
        isStandalone,
        referrer: document.referrer,
        userAgent: navigator.userAgent.substring(0, 100)
      });

      // Basic capability check
      const hasServiceWorker = "serviceWorker" in navigator;
      const hasPushManager = "PushManager" in window;
      const hasNotification = "Notification" in window;
      
      console.log("[push] Capabilities:", {
        serviceWorker: hasServiceWorker,
        pushManager: hasPushManager,
        notification: hasNotification,
        currentPermission: hasNotification ? Notification.permission : "N/A"
      });

      if (!hasServiceWorker || !hasPushManager || !hasNotification) {
        console.log("[push] Push or SW not supported in this browser");
        return;
      }

      console.log("[push] Requesting notification permission...");
      const permission = await Notification.requestPermission();
      console.log("[push] Permission result:", permission);
      
      if (permission !== "granted") {
        console.log("[push] Notification permission not granted");
        return;
      }

      console.log("[push] Fetching VAPID public key...");
      const publicKey = await fetchPushPublicKey();
      if (!publicKey) {
        console.warn("[push] No VAPID public key available");
        return;
      }
      console.log("[push] VAPID key received:", publicKey.substring(0, 20) + "...");

      console.log("[push] Waiting for service worker ready...");
      const registration = await navigator.serviceWorker.ready;
      console.log("[push] Service worker ready:", {
        scope: registration.scope,
        active: !!registration.active,
        installing: !!registration.installing,
        waiting: !!registration.waiting
      });

      console.log("[push] Checking for existing subscription...");
      const existingSub = await registration.pushManager.getSubscription();
      
      if (existingSub) {
        console.log("[push] Existing subscription found:", {
          endpoint: existingSub.endpoint.substring(0, 50) + "...",
          hasKeys: !!(existingSub.toJSON().keys)
        });
        
        // Already have one, just ensure backend knows about it
        const subPayload: PushSubscription = {
          endpoint: existingSub.endpoint,
          keys: {
            p256dh:
              existingSub.toJSON().keys?.p256dh ??
              "", // TS appeasement
            auth: existingSub.toJSON().keys?.auth ?? "",
          },
        };
        await sendPushSubscriptionToServer(subPayload);
        console.log("[push] Existing subscription sent to server");
        return;
      }

      console.log("[push] No existing subscription, creating new one...");
      const newSub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      console.log("[push] New subscription created:", {
        endpoint: newSub.endpoint.substring(0, 50) + "...",
        hasKeys: !!(newSub.toJSON().keys)
      });

      const subJson = newSub.toJSON();

      const payload: PushSubscription = {
        endpoint: newSub.endpoint,
        keys: {
          p256dh: subJson.keys?.p256dh ?? "",
          auth: subJson.keys?.auth ?? "",
        },
      };

      console.log("[push] Sending subscription to server...");
      await sendPushSubscriptionToServer(payload);
      console.log("[push] ✓ Subscription successfully registered");
    } catch (e) {
      console.error("[push] ❌ registerPushNotifications error:", e);
      if (e instanceof Error) {
        console.error("[push] Error details:", {
          name: e.name,
          message: e.message,
          stack: e.stack?.substring(0, 200)
        });
      }
    }
  },

  // --- WHEEL ---

  getWheelSegments: async (familyId: string): Promise<WheelSegment[]> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(apiUrl(`/families/${familyId}/wheel-segments`), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      console.error("Failed to get wheel segments", res.status);
      throw new Error("Failed to get wheel segments");
    }

    return await res.json();
  },

  getWheelConfig: async (familyId: string): Promise<{ spinCost: number; ticketConversionRate?: number; timezone?: string; timezoneSource?: 'FAMILY' | 'CONTAINER_DEFAULT' }> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(apiUrl(`/families/${familyId}/wheel-config`), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      console.error("Failed to get wheel config", res.status);
      throw new Error("Failed to get wheel config");
    }

    return await res.json();
  },

  updateWheelSegments: async (
    familyId: string,
    segments: Array<{ label: string; color: string; prob: number }>,
    spinCost: number
  ): Promise<{ segments: WheelSegment[]; spinCost: number }> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(apiUrl(`/families/${familyId}/wheel-segments`), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ segments, spinCost }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("Failed to update wheel segments", res.status, body);
      throw new Error(body?.error || "Failed to update wheel segments");
    }

    return await res.json();
  },

  resetWheelSegments: async (familyId: string): Promise<WheelSegment[]> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(apiUrl(`/families/${familyId}/wheel-segments/reset`), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      console.error("Failed to reset wheel segments", res.status);
      throw new Error("Failed to reset wheel segments");
    }

    return await res.json();
  },

  spinWheel: async (
    familyId: string,
    userId: string
  ): Promise<{ won: boolean; prize: string; emoji: string; newBalance: number; segmentIndex: number }> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(apiUrl(`/families/${familyId}/wheel-segments/spin`), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ userId }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("Failed to spin wheel", res.status, body);
      throw new Error(body?.error || "Failed to spin wheel");
    }

    return await res.json();
  },

  // ========== Template Export/Import ==========

  /**
   * Export rewards or bounties as a JSON template file
   */
  exportTemplate: async (type: 'rewards' | 'bounties'): Promise<Blob> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(apiUrl(`/templates/export?type=${type}`), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("Failed to export template", res.status, body);
      throw new Error(body?.error || "Failed to export template");
    }

    const data = await res.json();
    
    // Convert to JSON blob for download
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    return blob;
  },

  /**
   * Import rewards or bounties from a JSON template file
   */
  importTemplate: async (fileContent: any): Promise<{ 
    success: boolean; 
    imported: number; 
    errors?: string[]; 
    message: string;
  }> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(apiUrl(`/templates/import`), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(fileContent),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("Failed to import template", res.status, body);
      throw new Error(body?.error || "Failed to import template");
    }

    return await res.json();
  },

  /**
   * Update ticket conversion rate for a family
   */
  updateTicketConversionRate: async (familyId: string, conversionRate: number): Promise<{ conversionRate: number }> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(apiUrl(`/families/${familyId}/ticket-conversion-rate`), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ conversionRate }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("Failed to update conversion rate", res.status, body);
      throw new Error(body?.error || "Failed to update conversion rate");
    }

    return await res.json();
  },

  updateFamilyTimezone: async (
    familyId: string,
    timezone: string
  ): Promise<{ timezone: string; timezoneSource: 'FAMILY' }> => {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(apiUrl(`/families/${familyId}/timezone`), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ timezone }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("Failed to update family timezone", res.status, body);
      throw new Error(body?.error || "Failed to update family timezone");
    }

    return await res.json();
  },
};
