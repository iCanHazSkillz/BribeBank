import React, { useState } from "react";
import { User } from "../types";
import { storageService } from "../services/storageService";
import { apiService } from "../services/apiService";
import { Users, Lock, ArrowRight, Eye, EyeOff, KeyRound, Copy, Check } from "lucide-react";
import BribeBankLogo from "../src/assets/BribeBankLogo.webp";

interface LoginViewProps {
  onLogin: (user: User) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showRecoveryKey, setShowRecoveryKey] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [forgotRecoveryKey, setForgotRecoveryKey] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState("");
  const [resetSuccessKey, setResetSuccessKey] = useState("");
  const [copied, setCopied] = useState(false);

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

    const normalizedUsername = username.trim().toLowerCase();

    try {
      // Single source of truth for auth + local seeding
      const user = await storageService.login(normalizedUsername, password);
      onLogin(user);
    } catch (err: any) {
      console.error("Login failed:", err);
      setError(err?.message || "Invalid username or password.");
    }
  };

  const handleForgotPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username || !forgotRecoveryKey || !forgotNewPassword || !forgotConfirmPassword) {
      setError("All fields are required.");
      return;
    }
    if (forgotNewPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      const result = await storageService.resetForgottenPassword(
        username.trim().toLowerCase(),
        forgotRecoveryKey.trim().toUpperCase(),
        forgotNewPassword
      );
      setResetSuccessKey(result.newRecoveryKey);
      setForgotRecoveryKey("");
      setForgotNewPassword("");
      setForgotConfirmPassword("");
      setCopied(false);
    } catch (err: any) {
      const msg = err?.message || "Password reset failed.";
      if (msg === "INVALID_RECOVERY_CREDENTIALS") {
        setError("Invalid recovery details. Check username and recovery key.");
        return;
      }
      if (msg === "TOO_MANY_ATTEMPTS") {
        setError("Too many attempts. Please wait and try again.");
        return;
      }
      if (msg === "WEAK_PASSWORD") {
        setError("New password must be at least 8 characters.");
        return;
      }
      setError(msg);
    }
  };

  const handleCopyResetKey = async () => {
    if (!resetSuccessKey) return;
    try {
      await navigator.clipboard.writeText(resetSuccessKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Failed to copy. Please copy the key manually.");
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
      const normalizedUsername = username.trim().toLowerCase();
      const user = await storageService.login(normalizedUsername, password);
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
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 animate-gradient-shift"></div>
      
      {/* Vault illustration background */}
      <div 
        className="absolute inset-0 bg-center bg-no-repeat bg-contain opacity-20"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800'%3E%3Cg opacity='0.3'%3E%3Ccircle cx='300' cy='400' r='250' fill='%23fff' opacity='0.1'/%3E%3Ccircle cx='300' cy='400' r='200' fill='none' stroke='%23fff' stroke-width='20' opacity='0.2'/%3E%3Ccircle cx='300' cy='400' r='80' fill='%23fff' opacity='0.15'/%3E%3Cpath d='M300 320 L350 370 L300 420 L250 370 Z' fill='%23fff' opacity='0.2'/%3E%3Crect x='700' y='200' width='400' height='400' rx='20' fill='%23fff' opacity='0.05'/%3E%3C/g%3E%3C/svg%3E")`
        }}
      ></div>
      
      {/* Floating coins/tickets animation */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Top left cluster */}
        <div className="absolute top-20 left-10 w-16 h-16 bg-yellow-400/20 rounded-full animate-float-slow"></div>
        <div className="absolute top-32 left-24 w-10 h-10 bg-yellow-300/15 rounded-full animate-float-medium"></div>
        
        {/* Top right cluster */}
        <div className="absolute top-40 right-20 w-12 h-12 bg-blue-400/20 rounded-full animate-float-medium"></div>
        <div className="absolute top-16 right-32 w-14 h-14 bg-cyan-400/15 rounded-full animate-float-slow"></div>
        <div className="absolute top-28 right-12 w-8 h-8 bg-indigo-300/20 rounded-full animate-float-fast"></div>
        
        {/* Left side mid */}
        <div className="absolute top-1/2 left-16 w-12 h-12 bg-purple-400/15 rounded-full animate-float-medium" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/3 left-8 w-18 h-18 bg-pink-300/20 rounded-full animate-float-slow" style={{ animationDelay: '0.5s' }}></div>
        
        {/* Right side mid */}
        <div className="absolute top-1/2 right-24 w-16 h-16 bg-teal-400/15 rounded-full animate-float-fast" style={{ animationDelay: '1.5s' }}></div>
        <div className="absolute top-2/3 right-16 w-10 h-10 bg-emerald-300/20 rounded-full animate-float-medium" style={{ animationDelay: '2s' }}></div>
        
        {/* Bottom left cluster */}
        <div className="absolute bottom-32 left-1/4 w-20 h-20 bg-pink-400/20 rounded-full animate-float-fast"></div>
        <div className="absolute bottom-44 left-1/3 w-12 h-12 bg-rose-300/15 rounded-full animate-float-slow" style={{ animationDelay: '0.8s' }}></div>
        <div className="absolute bottom-24 left-12 w-14 h-14 bg-fuchsia-400/20 rounded-full animate-float-medium" style={{ animationDelay: '1.2s' }}></div>
        
        {/* Bottom right cluster */}
        <div className="absolute bottom-20 right-1/3 w-14 h-14 bg-purple-400/20 rounded-full animate-float-slow"></div>
        <div className="absolute bottom-36 right-1/4 w-16 h-16 bg-violet-300/15 rounded-full animate-float-fast" style={{ animationDelay: '1.8s' }}></div>
        <div className="absolute bottom-12 right-20 w-10 h-10 bg-indigo-400/20 rounded-full animate-float-medium" style={{ animationDelay: '2.5s' }}></div>
        
        {/* Center accents */}
        <div className="absolute top-1/4 left-1/2 w-8 h-8 bg-amber-300/15 rounded-full animate-float-slow" style={{ animationDelay: '3s' }}></div>
        <div className="absolute bottom-1/4 left-2/3 w-12 h-12 bg-orange-400/20 rounded-full animate-float-medium" style={{ animationDelay: '2.2s' }}></div>
      </div>
      
      <div className="bg-gray-900 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden relative z-10">
        {/* Header */}
        <div className="bg-gray-800 p-8 text-center border-b border-gray-700">
          <div className="flex justify-center mb-4">
            <img
              src={BribeBankLogo}
              alt="BribeBank Logo"
              className="w-32 h-32 object-contain drop-shadow-md"
            />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            BribeBank
          </h1>
          <p className="text-gray-300 mt-2 font-medium">
            {isForgotPassword ? "Recover Parent Password" : isSignUp ? "Create Family Account" : "Welcome Back"}
          </p>
        </div>

        {/* Form */}
        <div className="p-8">
          {error && (
            <div className="mb-4 p-3 bg-red-900/30 text-red-300 text-sm rounded-lg flex items-center justify-center font-medium">
              {error}
            </div>
          )}

          <form
            onSubmit={isForgotPassword ? handleForgotPasswordReset : isSignUp ? handleSignUp : handleLogin}
            className="space-y-4"
          >
            {isSignUp && (
              <>
                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">
                    Family Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. The Smiths"
                    className="w-full p-3 bg-gray-700 rounded-xl border border-gray-600 text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    value={familyName}
                    onChange={(e) => setFamilyName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">
                    Your Name (Admin)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Dad"
                    className="w-full p-3 bg-gray-700 rounded-xl border border-gray-600 text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">
                Username
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="username"
                  className="w-full p-3 pl-10 bg-gray-700 rounded-xl border border-gray-600 text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  value={username}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(e) => setUsername(e.target.value)}
                />
                <Users
                  size={18}
                  className="absolute left-3 top-3.5 text-gray-500"
                />
              </div>
            </div>

            {!isForgotPassword && (
            <div>
              <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="•••••••"
                  className="w-full p-3 pl-10 pr-10 bg-gray-700 rounded-xl border border-gray-600 text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Lock
                  size={18}
                  className="absolute left-3 top-3.5 text-gray-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3.5 text-gray-500 hover:text-gray-300 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            )}

            {isForgotPassword && (
              <>
                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">
                    Family Recovery Key
                  </label>
                  <div className="relative">
                    <input
                      type={showRecoveryKey ? "text" : "password"}
                      placeholder="XXXX-XXXX-XXXX-..."
                      className="w-full p-3 pl-10 pr-10 bg-gray-700 rounded-xl border border-gray-600 text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                      value={forgotRecoveryKey}
                      onChange={(e) => setForgotRecoveryKey(e.target.value)}
                    />
                    <KeyRound size={18} className="absolute left-3 top-3.5 text-gray-500" />
                    <button
                      type="button"
                      onClick={() => setShowRecoveryKey(!showRecoveryKey)}
                      className="absolute right-3 top-3.5 text-gray-500 hover:text-gray-300 transition-colors"
                      tabIndex={-1}
                    >
                      {showRecoveryKey ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      placeholder="At least 8 characters"
                      className="w-full p-3 pl-10 pr-10 bg-gray-700 rounded-xl border border-gray-600 text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                      value={forgotNewPassword}
                      onChange={(e) => setForgotNewPassword(e.target.value)}
                    />
                    <Lock size={18} className="absolute left-3 top-3.5 text-gray-500" />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-3.5 text-gray-500 hover:text-gray-300 transition-colors"
                      tabIndex={-1}
                    >
                      {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Re-enter new password"
                      className="w-full p-3 pl-10 pr-10 bg-gray-700 rounded-xl border border-gray-600 text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                      value={forgotConfirmPassword}
                      onChange={(e) => setForgotConfirmPassword(e.target.value)}
                    />
                    <Lock size={18} className="absolute left-3 top-3.5 text-gray-500" />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-3.5 text-gray-500 hover:text-gray-300 transition-colors"
                      tabIndex={-1}
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              </>
            )}

            <button
              type="submit"
              className="w-full py-4 mt-2 bg-indigo-600 text-white rounded-xl font-bold text-lg shadow-lg hover:bg-indigo-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              {isForgotPassword ? "Reset Password" : isSignUp ? "Create Account" : "Login"}{" "}
              <ArrowRight size={20} />
            </button>
          </form>

          {isForgotPassword && (
            <>
              <p className="mt-3 text-xs text-gray-400">
                If you do not have your family recovery key, contact your BribeBank self-hoster administrator.
              </p>
              {resetSuccessKey && (
                <div className="mt-4 p-4 rounded-xl border border-emerald-500/50 bg-emerald-900/30">
                  <p className="text-emerald-300 font-semibold text-sm">Password reset successful.</p>
                  <p className="text-gray-300 text-xs mt-1">New family recovery key (shown once):</p>
                  <div className="mt-2 p-3 rounded-lg bg-gray-900 text-emerald-300 font-mono text-xs break-all">
                    {resetSuccessKey}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyResetKey}
                    className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold"
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    {copied ? "Copied" : "Copy Recovery Key"}
                  </button>
                  <p className="text-[11px] text-amber-300 mt-2">
                    Store this key securely. It will not be shown again.
                  </p>
                </div>
              )}
            </>
          )}

          {/* Toggle */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-400">
              {isForgotPassword
                ? "Remembered your password?"
                : isSignUp
                ? "Already have a family account?"
                : "First time here?"}
            </p>
            <button
              onClick={() => {
                if (isForgotPassword) {
                  setIsForgotPassword(false);
                  setResetSuccessKey("");
                } else {
                  setIsSignUp(!isSignUp);
                }
                setError("");
              }}
              className="mt-1 text-indigo-400 font-bold text-sm hover:underline flex items-center justify-center gap-1 mx-auto"
            >
              {isForgotPassword ? "Back to login" : isSignUp ? "Login instead" : "Create new family wallet"}
            </button>
            {!isSignUp && !isForgotPassword && (
              <button
                onClick={() => {
                  setIsForgotPassword(true);
                  setError("");
                  setResetSuccessKey("");
                }}
                className="mt-3 text-xs text-gray-300 hover:text-white underline"
              >
                Forgot parent password?
              </button>
            )}
          </div>
        </div>
      </div>

      <p className="mt-8 text-white/90 text-xs text-center max-w-xs drop-shadow-md relative z-10">
        Made with ♥ by Dad
      </p>
    </div>
  );
};
