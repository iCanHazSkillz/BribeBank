// bribebank-frontend/services/apiService.ts
import { API_BASE } from "../config";

export interface AuthRegisterResponse {
  message: string;
  token: string;
  joinCode: string;
}

export interface AuthLoginResponse {
  token: string;
}

export interface MeResponse {
  id: string;
  username: string;
  displayName: string;
  role: string;
  family: {
    name: string;
    joinCode: string | null;
    joinCodeExpiry: string | null;
  } | null;
}

export const apiService = {
  async registerParent(params: {
    familyName: string;
    username: string;
    password: string;
    displayName: string;
  }): Promise<AuthRegisterResponse> {
    const res = await fetch(`${API_BASE}/auth/register-parent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      let msg = "Failed to register parent";
      try {
        const body = await res.json();
        if (body?.error) msg = body.error;
      } catch (_) {}
      throw new Error(msg);
    }

    return res.json();
  },

  async login(username: string, password: string): Promise<AuthLoginResponse> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      let msg = "Login failed";
      try {
        const body = await res.json();
        if (body?.error) msg = body.error;
      } catch (_) {}
      throw new Error(msg);
    }

    return res.json();
  },

  async getMe(token: string): Promise<MeResponse> {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      throw new Error("Failed to fetch current user");
    }

    return res.json();
  },
};
