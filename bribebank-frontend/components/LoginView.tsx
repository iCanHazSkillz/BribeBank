import React, { useState } from "react";
import { User } from "../types";
import { storageService } from "../services/storageService";
import { apiService } from "../services/apiService";
import { Users, Lock, ArrowRight } from "lucide-react";

interface LoginViewProps {
  onLogin: (user: User) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");

  // Shared auth fields
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Sign-up only
  const [familyName, setFamilyName] = useState("");
  const [adminName, setAdminName] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username || !password) {
      setError("Username and password are required.");
      return;
    }

    try {
      // Single source of truth for auth + local seeding
      const user = await storageService.login(username, password);
      onLogin(user);
    } catch (err: any) {
      console.error("Login failed:", err);
      setError(err?.message || "Invalid username or password.");
    }
  };

const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!familyName || !adminName || !username || !password) {
      setError("All fields are required.");
      return;
    }
    try {
      // 1) Create the parent + family in the backend.
      await apiService.registerParent({
        familyName,
        username,
        password,
        displayName: adminName,
      });
      // 2) Immediately log in via the normal path so we:
      //    - get a valid JWThing-a-magig
      //    - seed the local DB in one consistent place
      const user = await storageService.login(username, password);
      onLogin(user);
    } catch (err: any) {
      console.error("Registration/login failed:", err);
      
      if (err?.message === "USERNAME_TAKEN") {
        setError("This username is already in use. Please choose another.");
        return;
      }
      
      const msg =
        err?.message ||
        (typeof err === "string" ? err : "") ||
        "Registration failed.";
      setError(msg);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-indigo-600 to-purple-700">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-indigo-50 p-8 text-center border-b border-indigo-100">
          <div className="flex justify-center mb-4">
            <img
              src="https://raw.githubusercontent.com/iCanHazSkillz/BribeBank/refs/heads/main/BribeBankLogo.png"
              alt="BribeBank Logo"
              className="w-32 h-32 object-contain drop-shadow-md"
            />
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            BribeBank
          </h1>
          <p className="text-gray-600 mt-2 font-medium">
            {isSignUp ? "Create Family Account" : "Welcome Back"}
          </p>
        </div>

        {/* Form */}
        <div className="p-8">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center justify-center font-medium">
              {error}
            </div>
          )}

          <form
            onSubmit={isSignUp ? handleSignUp : handleLogin}
            className="space-y-4"
          >
            {isSignUp && (
              <>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Family Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. The Smiths"
                    className="w-full p-3 bg-white rounded-xl border border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    value={familyName}
                    onChange={(e) => setFamilyName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Your Name (Admin)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Dad"
                    className="w-full p-3 bg-white rounded-xl border border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Username
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="username"
                  className="w-full p-3 pl-10 bg-white rounded-xl border border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
                <Users
                  size={18}
                  className="absolute left-3 top-3.5 text-gray-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  placeholder="•••••••"
                  className="w-full p-3 pl-10 bg-white rounded-xl border border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Lock
                  size={18}
                  className="absolute left-3 top-3.5 text-gray-400"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-4 mt-2 bg-indigo-600 text-white rounded-xl font-bold text-lg shadow-lg hover:bg-indigo-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              {isSignUp ? "Create Account" : "Login"}{" "}
              <ArrowRight size={20} />
            </button>
          </form>

          {/* Toggle */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              {isSignUp
                ? "Already have a family account?"
                : "First time here?"}
            </p>
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError("");
              }}
              className="mt-1 text-indigo-600 font-bold text-sm hover:underline flex items-center justify-center gap-1 mx-auto"
            >
              {isSignUp ? "Login instead" : "Create new family wallet"}
            </button>
          </div>
        </div>
      </div>

      <p className="mt-8 text-indigo-200 text-xs text-center max-w-xs opacity-80">
        Made with ♥ by Dad
      </p>
    </div>
  );
};
