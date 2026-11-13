"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Scissors,
  Link2,
  Upload,
  Sparkles,
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Film,
  Layers,
  PlaySquare,
  KeyRound,
  ChevronDown,
  ChevronUp,
  Terminal,
  Crown,
  FolderHeart,
  LogIn,
  LogOut,
  User,
  Check,
  Zap,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const PRO_CHECKOUT_URL = process.env.NEXT_PUBLIC_LEMONSQUEEZY_PRO_URL || "";
const PRO_MAX_CHECKOUT_URL = process.env.NEXT_PUBLIC_LEMONSQUEEZY_PRO_MAX_URL || "";

interface ClipResult {
  id: number | string;
  hook_banner: string;
  title: string;
  story_arc: string;
  cuts?: number;
  start?: number;
  end?: number;
  duration: number;
  video_url: string;
  expires_at?: string | null;
  created_at?: string;
}

interface JobStatus {
  job_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  step: string;
  progress: number;
  logs?: string[];
  clips: ClipResult[];
  error: string | null;
}

interface UserSession {
  access_token: string;
  refresh_token?: string;
  user: {
    id: string;
    email: string;
  };
}

interface UserProfile {
  plan: "free" | "pro" | "pro_max";
  clips_remaining: number;
  window_hours: number;
  max_clips_window: number;
  backup_days: number | null;
}

export default function Home() {
  const [activeView, setActiveView] = useState<"create" | "library">("create");
  const [mode, setMode] = useState<"url" | "file">("url");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [numClips, setNumClips] = useState(4);
  const [dynamicMode, setDynamicMode] = useState(true);

  // Normalized Universal BYOK state
  const [showByok, setShowByok] = useState(false);
  const [userProvider, setUserProvider] = useState("auto");
  const [userApiKey, setUserApiKey] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [customModel, setCustomModel] = useState("");

  // Job & Live Console Logs state
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Auth, 3-Tier Pricing Modal & Saved Library state
  const [session, setSession] = useState<UserSession | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [savedClips, setSavedClips] = useState<ClipResult[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  useEffect(() => {
    setUserProvider(localStorage.getItem("clipforge_provider") || "auto");
    setUserApiKey(localStorage.getItem("clipforge_api_key") || "");
    setCustomBaseUrl(localStorage.getItem("clipforge_custom_url") || "");
    setCustomModel(localStorage.getItem("clipforge_custom_model") || "");

    const rawSession = localStorage.getItem("clipforge_session");
    if (rawSession) {
      try {
        setSession(JSON.parse(rawSession));
      } catch {
        localStorage.removeItem("clipforge_session");
      }
    }
  }, []);

  const refreshSupabaseSession = useCallback(
    async (currentSession: UserSession): Promise<UserSession | null> => {
      if (!currentSession.refresh_token || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
        return null;
      }
      try {
        const res = await fetch(
          `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
          {
            method: "POST",
            headers: {
              apikey: SUPABASE_ANON_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ refresh_token: currentSession.refresh_token }),
          }
        );
        if (!res.ok) return null;
        const data = await res.json();
        if (data.access_token && data.user) {
          const updated: UserSession = {
            access_token: data.access_token,
            refresh_token: data.refresh_token || currentSession.refresh_token,
            user: { id: data.user.id, email: data.user.email },
          };
          setSession(updated);
          localStorage.setItem("clipforge_session", JSON.stringify(updated));
          return updated;
        }
      } catch {
        // Ignore refresh network error
      }
      return null;
    },
    []
  );

  const fetchUserLibrary = useCallback(
    async (activeSession: UserSession) => {
      setLoadingLibrary(true);
      try {
        let res = await fetch(`${API_BASE}/api/my-clips`, {
          headers: { Authorization: `Bearer ${activeSession.access_token}` },
        });
        if (res.status === 401) {
          const refreshed = await refreshSupabaseSession(activeSession);
          if (refreshed) {
            res = await fetch(`${API_BASE}/api/my-clips`, {
              headers: { Authorization: `Bearer ${refreshed.access_token}` },
            });
          } else {
            setSession(null);
            localStorage.removeItem("clipforge_session");
            return;
          }
        }
        if (res.ok) {
          const data = await res.json();
          setProfile(data.profile);
          setSavedClips(data.clips || []);
        }
      } catch {
        // Ignore network errors
      } finally {
        setLoadingLibrary(false);
      }
    },
    [refreshSupabaseSession]
  );

  useEffect(() => {
    if (session?.access_token) {
      fetchUserLibrary(session);
    } else {
      setProfile(null);
      setSavedClips([]);
    }
  }, [session, fetchUserLibrary]);

  const handleProviderChange = (val: string) => {
    setUserProvider(val);
    localStorage.setItem("clipforge_provider", val);
  };

  const handleApiKeyChange = (val: string) => {
    setUserApiKey(val);
    localStorage.setItem("clipforge_api_key", val);
  };

  const handleCustomBaseUrlChange = (val: string) => {
    setCustomBaseUrl(val);
    localStorage.setItem("clipforge_custom_url", val);
  };

  const handleCustomModelChange = (val: string) => {
    setCustomModel(val);
    localStorage.setItem("clipforge_custom_model", val);
  };

  useEffect(() => {
    if (!jobId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/status/${jobId}`);
        if (!res.ok) return;
        const data: JobStatus = await res.json();
        setJob(data);
        if (data.status === "completed" || data.status === "failed") {
          clearInterval(interval);
          if (session?.access_token) {
            fetchUserLibrary(session);
          }
        }
      } catch {
        // Ignore transient network hiccups while polling
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [jobId, session, fetchUserLibrary]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthMessage(null);
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setAuthMessage(
        "Supabase keys not configured yet. Add NEXT_PUBLIC_SUPABASE_URL & NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
      );
      return;
    }

    setAuthLoading(true);
    try {
      const endpoint =
        authMode === "login"
          ? `${SUPABASE_URL}/auth/v1/token?grant_type=password`
          : `${SUPABASE_URL}/auth/v1/signup`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: authEmail, password: authPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error_description || data.msg || "Auth failed");
      }

      if (data.access_token && data.user) {
        const newSession: UserSession = {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          user: { id: data.user.id, email: data.user.email },
        };
        setSession(newSession);
        localStorage.setItem("clipforge_session", JSON.stringify(newSession));
        setShowAuthModal(false);
        setAuthEmail("");
        setAuthPassword("");
      } else {
        setAuthMessage(
          "Account created! Check your inbox to confirm your email, then sign in."
        );
      }
    } catch (err: unknown) {
      setAuthMessage(err instanceof Error ? err.message : "Authentication error");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setSession(null);
    setActiveView("create");
    localStorage.removeItem("clipforge_session");
  };

  const launchCheckout = (plan: "pro" | "pro_max") => {
    if (!session) {
      setShowPricingModal(false);
      setAuthMode("signup");
      setShowAuthModal(true);
      return;
    }
    const baseCheckout =
      plan === "pro_max" ? PRO_MAX_CHECKOUT_URL : PRO_CHECKOUT_URL;
    if (!baseCheckout) {
      alert(
        `Set ${
          plan === "pro_max"
            ? "NEXT_PUBLIC_LEMONSQUEEZY_PRO_MAX_URL"
            : "NEXT_PUBLIC_LEMONSQUEEZY_PRO_URL"
        } in your frontend environment variables to launch checkout!`
      );
      return;
    }
    const checkoutUrl = `${baseCheckout}?checkout[email]=${encodeURIComponent(
      session.user.email
    )}&checkout[custom][user_id]=${encodeURIComponent(
      session.user.id
    )}&checkout[custom][plan]=${plan}`;
    window.open(checkoutUrl, "_blank", "noopener,noreferrer");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (mode === "url" && !url.trim()) {
      setFormError("Please paste a valid YouTube or video URL.");
      return;
    }
    if (mode === "file" && !file) {
      setFormError("Please select an MP4/MOV video file to upload.");
      return;
    }

    setSubmitting(true);
    setJob(null);
    setJobId(null);

    try {
      let activeToken = session?.access_token;
      if (session) {
        const refreshed = await refreshSupabaseSession(session);
        if (refreshed) {
          activeToken = refreshed.access_token;
        }
      }

      const formData = new FormData();
      formData.append("num_clips", String(numClips));
      formData.append("dynamic_mode", String(dynamicMode));
      formData.append("user_provider", userProvider);
      if (userApiKey.trim()) {
        formData.append("user_api_key", userApiKey.trim());
      }
      if (customBaseUrl.trim()) {
        formData.append("custom_base_url", customBaseUrl.trim());
      }
      if (customModel.trim()) {
        formData.append("custom_model", customModel.trim());
      }
      if (mode === "url") {
        formData.append("url", url.trim());
      } else if (file) {
        formData.append("file", file);
      }

      const headers: Record<string, string> = {};
      if (activeToken) {
        headers["Authorization"] = `Bearer ${activeToken}`;
      }

      const res = await fetch(`${API_BASE}/api/clip`, {
        method: "POST",
        headers,
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to start clipping job.");
      }

      const data = await res.json();
      setJobId(data.job_id);
      setJob({
        job_id: data.job_id,
        status: "queued",
        step: "Starting pipeline...",
        progress: 5,
        logs: ["Starting background clipping worker..."],
        clips: [],
        error: null,
      });
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Server error");
    } finally {
      setSubmitting(false);
    }
  };

  const resolveMediaUrl = (rawUrl: string) =>
    rawUrl.startsWith("http") ? rawUrl : `${API_BASE}${rawUrl}`;

  const isWorking = job?.status === "queued" || job?.status === "processing";
  const hasCustomKey = Boolean(
    userApiKey.trim() || (userProvider === "custom" && customBaseUrl.trim())
  );
  const currentPlan = profile?.plan || "free";
  const maxSelectableClips =
    currentPlan === "pro_max" ? 10 : currentPlan === "pro" ? 8 : 4;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-amber-400 selection:text-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setActiveView("create")}
              className="flex items-center gap-2.5"
            >
              <div className="w-9 h-9 rounded-xl bg-amber-400 text-zinc-950 flex items-center justify-center font-black">
                <Scissors className="w-5 h-5" />
              </div>
              <span className="font-extrabold text-lg tracking-tight">
                ClipForge <span className="text-amber-400">AI</span>
              </span>
            </button>

            {session && (
              <nav className="hidden sm:flex items-center gap-1 bg-zinc-900/90 p-1 rounded-xl border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setActiveView("create")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    activeView === "create"
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Create Shorts
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveView("library");
                    fetchUserLibrary(session);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    activeView === "library"
                      ? "bg-zinc-800 text-amber-400"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <FolderHeart className="w-3.5 h-3.5" />
                  My Saved Clips ({savedClips.length})
                </button>
              </nav>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowPricingModal(true)}
              className="flex items-center gap-1.5 text-xs font-black px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 text-zinc-950 hover:opacity-95 transition shadow-md shadow-amber-500/10"
            >
              <Crown className="w-3.5 h-3.5" />
              {currentPlan === "pro_max"
                ? "Pro Max"
                : currentPlan === "pro"
                ? "Pro Plan"
                : "Plans & Pricing"}
            </button>

            {session ? (
              <div className="flex items-center gap-2">
                {profile && (
                  <span className="hidden md:inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300">
                    {currentPlan === "pro_max" ? (
                      <span className="text-amber-400 font-black">
                        UNLIMITED
                      </span>
                    ) : (
                      <span>
                        {profile.clips_remaining}/{profile.max_clips_window}{" "}
                        clips left
                      </span>
                    )}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setActiveView("library")}
                  className="sm:hidden p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300"
                  title="My Saved Clips"
                >
                  <FolderHeart className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 transition"
                  title={session.user.email}
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAuthMode("login");
                  setShowAuthModal(true);
                }}
                className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 transition"
              >
                <LogIn className="w-3.5 h-3.5 text-amber-400" />
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-12">
        {activeView === "library" && session ? (
          /* Saved Clips Cloud Library View */
          <section>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div>
                <h1 className="text-3xl font-black tracking-tight flex items-center gap-2.5">
                  <FolderHeart className="w-7 h-7 text-amber-400" />
                  My Saved Shorts Library
                </h1>
                <p className="text-sm text-zinc-400 mt-1">
                  Signed in as {session.user.email} •{" "}
                  {profile?.backup_days
                    ? `Clips backed up for ${profile.backup_days} days on ${currentPlan.toUpperCase()} tier.`
                    : "Permanent cloud backup active on PRO MAX."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveView("create")}
                className="px-4 py-2.5 rounded-xl bg-amber-400 text-zinc-950 font-black text-xs"
              >
                + Generate New Shorts
              </button>
            </div>

            {loadingLibrary ? (
              <div className="py-20 flex flex-col items-center justify-center text-zinc-400">
                <Loader2 className="w-7 h-7 animate-spin text-amber-400 mb-3" />
                Loading your saved clips...
              </div>
            ) : savedClips.length === 0 ? (
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-12 text-center">
                <Film className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                <h3 className="font-bold text-lg text-zinc-200">
                  No saved Shorts yet
                </h3>
                <p className="text-sm text-zinc-400 mt-1 mb-5">
                  Generate Shorts while signed in and they will automatically
                  appear here for future downloads.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveView("create")}
                  className="px-5 py-2.5 rounded-xl bg-amber-400 text-zinc-950 font-black text-xs"
                >
                  Create Your First Short
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {savedClips.map((clip) => (
                  <div
                    key={clip.id}
                    className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col shadow-xl"
                  >
                    <div className="aspect-[9/16] bg-black relative">
                      <video
                        src={resolveMediaUrl(clip.video_url)}
                        controls
                        playsInline
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                          <span className="inline-block text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-400/15 text-amber-400">
                            {clip.hook_banner}
                          </span>
                          {clip.cuts && clip.cuts > 1 && (
                            <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-400/15 text-emerald-400">
                              {clip.cuts} Cuts
                            </span>
                          )}
                        </div>
                        <h3 className="font-bold text-sm text-zinc-100 line-clamp-1">
                          {clip.title}
                        </h3>
                        <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
                          {clip.story_arc}
                        </p>
                      </div>
                      <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                        <span className="text-xs font-mono text-zinc-500">
                          {clip.duration}s
                        </span>
                        <a
                          href={resolveMediaUrl(clip.video_url)}
                          download={`${clip.title}.mp4`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-amber-400 hover:text-zinc-950 transition"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : (
          /* Main Creator Studio View */
          <>
            {/* Hero */}
            <div className="text-center max-w-2xl mx-auto mb-10">
              <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-4">
                Turn Long Gaming VODs Into{" "}
                <span className="text-amber-400">Viral Shorts</span>
              </h1>
              <p className="text-zinc-400 text-base sm:text-lg">
                Paste a YouTube link or upload raw gameplay. Our AI stitches
                setup, climax, and payoff into tight 9:16 Shorts with burned-in
                captions.
              </p>
              {!session && (
                <p className="text-xs text-zinc-500 mt-3">
                  Free Tier: 4 clips every 48 hours •{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("signup");
                      setShowAuthModal(true);
                    }}
                    className="text-amber-400 underline hover:text-amber-300"
                  >
                    Sign in free
                  </button>{" "}
                  to back up your clips for 7 days (or permanent backup on Pro
                  Max).
                </p>
              )}
            </div>

            {/* Input Card */}
            <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-2xl mb-10">
              {/* Source Mode Tabs */}
              <div className="flex gap-2 p-1 bg-zinc-950 rounded-xl border border-zinc-800 w-fit mb-6">
                <button
                  type="button"
                  onClick={() => setMode("url")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
                    mode === "url"
                      ? "bg-amber-400 text-zinc-950"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Link2 className="w-4 h-4" />
                  YouTube Link
                </button>
                <button
                  type="button"
                  onClick={() => setMode("file")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
                    mode === "file"
                      ? "bg-amber-400 text-zinc-950"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  Upload MP4
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {mode === "url" ? (
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                      Video URL
                    </label>
                    <input
                      type="url"
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      disabled={submitting || isWorking}
                      className="w-full px-4 py-3.5 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-amber-400 focus:outline-none text-zinc-100 placeholder-zinc-600"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                      Local Video File (.mp4 / .mov)
                    </label>
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-zinc-700 hover:border-amber-400/70 rounded-xl cursor-pointer bg-zinc-950/60 transition">
                      <Film className="w-7 h-7 text-amber-400 mb-2" />
                      <span className="text-sm font-medium text-zinc-300">
                        {file ? file.name : "Click to select a video file"}
                      </span>
                      <span className="text-xs text-zinc-500 mt-1">
                        Bypasses YouTube limits • 100% reliable
                      </span>
                      <input
                        type="file"
                        accept="video/mp4,video/quicktime,video/x-matroska"
                        className="hidden"
                        disabled={submitting || isWorking}
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                      />
                    </label>
                  </div>
                )}

                {/* Editing Style Toggle */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                    AI Editing Pacing
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={submitting || isWorking}
                      onClick={() => setDynamicMode(true)}
                      className={`p-3.5 rounded-xl border text-left transition flex items-start gap-3 ${
                        dynamicMode
                          ? "bg-amber-400/10 border-amber-400 text-zinc-100"
                          : "bg-zinc-950/70 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      <Layers
                        className={`w-5 h-5 mt-0.5 shrink-0 ${
                          dynamicMode ? "text-amber-400" : "text-zinc-500"
                        }`}
                      />
                      <div>
                        <div className="font-bold text-sm text-zinc-100">
                          Dynamic Story Jump-Cut
                        </div>
                        <div className="text-xs text-zinc-400 mt-0.5">
                          Cuts middle filler; stitches Setup → Climax → Winner
                          in under 58s
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      disabled={submitting || isWorking}
                      onClick={() => setDynamicMode(false)}
                      className={`p-3.5 rounded-xl border text-left transition flex items-start gap-3 ${
                        !dynamicMode
                          ? "bg-amber-400/10 border-amber-400 text-zinc-100"
                          : "bg-zinc-950/70 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      <PlaySquare
                        className={`w-5 h-5 mt-0.5 shrink-0 ${
                          !dynamicMode ? "text-amber-400" : "text-zinc-500"
                        }`}
                      />
                      <div>
                        <div className="font-bold text-sm text-zinc-100">
                          Single Continuous Clip
                        </div>
                        <div className="text-xs text-zinc-400 mt-0.5">
                          One uncut take—ideal for fast clutches, rants, or 1v5
                          plays
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Normalized Universal BYOK Drawer */}
                <div className="border border-zinc-800/80 rounded-xl bg-zinc-950/50 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowByok(!showByok)}
                    className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition"
                  >
                    <span className="flex items-center gap-2">
                      <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                      {hasCustomKey
                        ? `Custom AI Provider Active (${userProvider.toUpperCase()})`
                        : "Optional: Use Your Own AI Provider Key (Gemini, Claude, Groq, OpenAI, Custom)"}
                    </span>
                    {showByok ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>

                  {showByok && (
                    <div className="p-4 pt-3 border-t border-zinc-800/80 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                            AI Provider
                          </label>
                          <select
                            value={userProvider}
                            onChange={(e) => handleProviderChange(e.target.value)}
                            disabled={submitting || isWorking}
                            className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-amber-400 focus:outline-none text-xs text-zinc-100"
                          >
                            <option value="auto">Auto-Detect from Key</option>
                            <option value="gemini">Google Gemini</option>
                            <option value="claude">Anthropic Claude</option>
                            <option value="groq">Groq (Llama 3.3 + Whisper)</option>
                            <option value="openrouter">OpenRouter (Any Model)</option>
                            <option value="openai">OpenAI (GPT-4o-mini)</option>
                            <option value="deepseek">DeepSeek</option>
                            <option value="custom">
                              Custom OpenAI-Compatible Endpoint
                            </option>
                          </select>
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                            API Key
                          </label>
                          <input
                            type="password"
                            placeholder="Paste any key (AIza..., sk-ant-..., gsk_..., sk-or-..., sk-...)"
                            value={userApiKey}
                            onChange={(e) => handleApiKeyChange(e.target.value)}
                            disabled={submitting || isWorking}
                            className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-amber-400 focus:outline-none text-xs text-zinc-100 placeholder-zinc-600"
                          />
                        </div>
                      </div>

                      {userProvider === "custom" && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          <div>
                            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                              Generalized Base URL
                            </label>
                            <input
                              type="url"
                              placeholder="https://api.together.xyz/v1 or http://localhost:11434/v1"
                              value={customBaseUrl}
                              onChange={(e) =>
                                handleCustomBaseUrlChange(e.target.value)
                              }
                              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-amber-400 focus:outline-none text-xs text-zinc-100 placeholder-zinc-600"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                              Model Name
                            </label>
                            <input
                              type="text"
                              placeholder="meta-llama/Llama-3.3-70B-Instruct-Turbo"
                              value={customModel}
                              onChange={(e) =>
                                handleCustomModelChange(e.target.value)
                              }
                              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-amber-400 focus:outline-none text-xs text-zinc-100 placeholder-zinc-600"
                            />
                          </div>
                        </div>
                      )}

                      <p className="text-[11px] text-zinc-500">
                        Use your preferred AI model (Gemini, Claude, Groq,
                        OpenRouter, OpenAI, DeepSeek, or custom endpoint).
                        Stored strictly in your browser&apos;s local storage.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-medium text-zinc-400">
                      Clips to generate:
                    </label>
                    <select
                      value={numClips}
                      onChange={(e) => setNumClips(Number(e.target.value))}
                      disabled={submitting || isWorking}
                      className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm font-semibold text-zinc-100 focus:border-amber-400 focus:outline-none"
                    >
                      {[2, 3, 4, 6, 8, 10].map((n) => (
                        <option
                          key={n}
                          value={n}
                          disabled={n > maxSelectableClips}
                        >
                          {n} Shorts{" "}
                          {n > maxSelectableClips
                            ? n <= 8
                              ? "(Pro)"
                              : "(Pro Max)"
                            : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || isWorking}
                    className="flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 font-black text-sm tracking-wide transition shadow-lg shadow-amber-400/10"
                  >
                    {submitting || isWorking ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processing Video...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Generate Viral Shorts
                      </>
                    )}
                  </button>
                </div>
              </form>

              {formError && (
                <div className="mt-5 p-4 rounded-xl bg-red-950/50 border border-red-800/70 text-red-300 text-sm flex items-center justify-between gap-2.5">
                  <span className="flex items-center gap-2.5">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {formError}
                  </span>
                  {(formError.includes("limit") ||
                    formError.includes("Upgrade")) && (
                    <button
                      type="button"
                      onClick={() => setShowPricingModal(true)}
                      className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-400 text-zinc-950 font-black text-xs"
                    >
                      View Plans
                    </button>
                  )}
                </div>
              )}

              {/* Live Progress Bar & Collapsible Engine Logs */}
              {job && (
                <div className="mt-6 pt-6 border-t border-zinc-800">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="font-semibold text-zinc-200 flex items-center gap-2">
                      {job.status === "completed" ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : job.status === "failed" ? (
                        <AlertCircle className="w-4 h-4 text-red-400" />
                      ) : (
                        <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                      )}
                      {job.step}
                    </span>
                    <span className="font-mono text-xs text-zinc-400">
                      {job.progress}%
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
                    <div
                      className={`h-full transition-all duration-500 ${
                        job.status === "failed"
                          ? "bg-red-500"
                          : job.status === "completed"
                          ? "bg-emerald-400"
                          : "bg-amber-400"
                      }`}
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                  {job.error && (
                    <p className="mt-3 text-sm text-red-400">{job.error}</p>
                  )}

                  {/* Live Background Process Dropdown */}
                  {job.logs && job.logs.length > 0 && (
                    <div className="mt-4 border border-zinc-800 rounded-xl bg-zinc-950/90 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setShowLogs(!showLogs)}
                        className="w-full px-3.5 py-2 flex items-center justify-between text-xs font-mono text-zinc-400 hover:text-zinc-200 transition"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <Terminal className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="shrink-0">Live Engine Output</span>
                          <span className="text-[11px] text-zinc-500 truncate">
                            — {job.logs[job.logs.length - 1]}
                          </span>
                        </span>
                        {showLogs ? (
                          <ChevronUp className="w-4 h-4 shrink-0" />
                        ) : (
                          <ChevronDown className="w-4 h-4 shrink-0" />
                        )}
                      </button>

                      {showLogs && (
                        <div className="px-3.5 py-3 border-t border-zinc-800/80 bg-black/80 max-h-48 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-1">
                          {job.logs.map((line, i) => (
                            <div
                              key={i}
                              className={
                                line.includes("Exported") ||
                                line.includes("ready") ||
                                line.includes("Backed up") ||
                                line.includes("Refunded")
                                  ? "text-emerald-400"
                                  : line.includes("ffmpeg") ||
                                    line.includes("llm:")
                                  ? "text-amber-300/90"
                                  : line.includes("error:")
                                  ? "text-red-400"
                                  : "text-zinc-400"
                              }
                            >
                              {line}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Rendered Clips Grid */}
            {job?.clips && job.clips.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-black flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-400" />
                    Generated Viral Shorts ({job.clips.length})
                  </h2>
                  {session && (
                    <span className="text-xs font-semibold text-emerald-400">
                      Saved to My Clips
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {job.clips.map((clip) => (
                    <div
                      key={clip.id}
                      className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col shadow-xl"
                    >
                      <div className="aspect-[9/16] bg-black relative">
                        <video
                          src={resolveMediaUrl(clip.video_url)}
                          controls
                          playsInline
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                            <span className="inline-block text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-400/15 text-amber-400">
                              {clip.hook_banner}
                            </span>
                            {clip.cuts && clip.cuts > 1 && (
                              <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-400/15 text-emerald-400">
                                {clip.cuts} Cuts
                              </span>
                            )}
                          </div>
                          <h3 className="font-bold text-sm text-zinc-100 line-clamp-1">
                            {clip.title}
                          </h3>
                          <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
                            {clip.story_arc}
                          </p>
                        </div>
                        <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                          <span className="text-xs font-mono text-zinc-500">
                            {clip.duration}s
                          </span>
                          <a
                            href={resolveMediaUrl(clip.video_url)}
                            download={`${clip.title}.mp4`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-amber-400 hover:text-zinc-950 transition"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* 3-Tier Pricing Modal (Free / Pro $10 / Pro Max $50) */}
      {showPricingModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl my-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-black tracking-tight">
                  Choose Your ClipForge AI Plan
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Start free, or scale your Shorts output with extended cloud
                  backups and higher daily limits.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPricingModal(false)}
                className="w-8 h-8 rounded-full bg-zinc-800 text-zinc-400 hover:text-zinc-100 flex items-center justify-center text-sm"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Tier 1: Free */}
              <div className="rounded-2xl bg-zinc-950/80 border border-zinc-800 p-6 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-zinc-400">
                    Starter
                  </div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-3xl font-black">$0</span>
                    <span className="text-xs text-zinc-500">/ forever</span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-2">
                    Test Dynamic Story Jump-Cuts and word-level captions for
                    free.
                  </p>
                  <ul className="mt-5 space-y-2.5 text-xs text-zinc-300">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>
                        <strong>4 clips</strong> every 48 hours
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>
                        <strong>7-day</strong> cloud clip backup
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Up to 4 Shorts per video</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Bring your own AI key supported</span>
                    </li>
                  </ul>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPricingModal(false)}
                  className="mt-6 w-full py-2.5 rounded-xl bg-zinc-800 text-zinc-200 font-bold text-xs"
                >
                  {currentPlan === "free" ? "Current Plan" : "Included"}
                </button>
              </div>

              {/* Tier 2: Pro ($10/mo) */}
              <div className="rounded-2xl bg-zinc-950 border-2 border-amber-400 p-6 flex flex-col justify-between relative shadow-xl shadow-amber-500/10">
                <span className="absolute -top-3 right-4 px-2.5 py-0.5 rounded-full bg-amber-400 text-zinc-950 text-[10px] font-black uppercase tracking-wider">
                  Most Popular
                </span>
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-amber-400">
                    Pro Creator
                  </div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-3xl font-black">$10</span>
                    <span className="text-xs text-zinc-400">/ month</span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-2">
                    Built for daily YouTube Shorts, Reels, and TikTok creators.
                  </p>
                  <ul className="mt-5 space-y-2.5 text-xs text-zinc-200">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>
                        <strong>20 clips</strong> every day (~600/mo)
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>
                        <strong>30-day</strong> full cloud video backup
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Up to 8 Shorts per video</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>No API key setup required</span>
                    </li>
                  </ul>
                </div>
                <button
                  type="button"
                  disabled={currentPlan === "pro"}
                  onClick={() => launchCheckout("pro")}
                  className="mt-6 w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-zinc-950 font-black text-xs transition"
                >
                  {currentPlan === "pro"
                    ? "Active Plan"
                    : "Upgrade to Pro — $10/mo"}
                </button>
              </div>

              {/* Tier 3: Pro Max ($50/mo) */}
              <div className="rounded-2xl bg-gradient-to-b from-zinc-900 to-zinc-950 border border-orange-500/50 p-6 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-orange-400 flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5" />
                    Pro Max Agency
                  </div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-3xl font-black">$50</span>
                    <span className="text-xs text-zinc-400">/ month</span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-2">
                    Maximum throughput and permanent storage for high-volume
                    channels & agencies.
                  </p>
                  <ul className="mt-5 space-y-2.5 text-xs text-zinc-200">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-orange-400 shrink-0" />
                      <span>
                        <strong>Unlimited clips*</strong> (100/day fair-use)
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-orange-400 shrink-0" />
                      <span>
                        <strong>Permanent</strong> unlimited cloud backup
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-orange-400 shrink-0" />
                      <span>Up to 10 Shorts per video</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-orange-400 shrink-0" />
                      <span>Priority cloud rendering queue</span>
                    </li>
                  </ul>
                </div>
                <button
                  type="button"
                  disabled={currentPlan === "pro_max"}
                  onClick={() => launchCheckout("pro_max")}
                  className="mt-6 w-full py-3 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 hover:opacity-95 disabled:opacity-60 text-zinc-950 font-black text-xs transition"
                >
                  {currentPlan === "pro_max"
                    ? "Active Plan"
                    : "Go Pro Max — $50/mo"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sign In / Sign Up Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <User className="w-5 h-5 text-amber-400" />
                <h2 className="font-black text-lg">
                  {authMode === "login"
                    ? "Sign In to ClipForge AI"
                    : "Create Your Free Account"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowAuthModal(false)}
                className="text-xs text-zinc-400 hover:text-zinc-200"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-zinc-400 mb-5">
              Sign in to back up your Shorts in the cloud and manage your Pro
              or Pro Max plan.
            </p>

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-amber-400 focus:outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-amber-400 focus:outline-none text-sm"
                />
              </div>

              {authMessage && (
                <p className="text-xs text-amber-300 bg-amber-950/40 border border-amber-800/60 p-3 rounded-xl">
                  {authMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-black text-sm transition flex items-center justify-center gap-2"
              >
                {authLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {authMode === "login" ? "Sign In" : "Create Free Account"}
              </button>
            </form>

            <div className="mt-4 text-center text-xs text-zinc-400">
              {authMode === "login" ? (
                <>
                  Don&apos;t have an account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("signup");
                      setAuthMessage(null);
                    }}
                    className="text-amber-400 font-bold hover:underline"
                  >
                    Sign up free
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("login");
                      setAuthMessage(null);
                    }}
                    className="text-amber-400 font-bold hover:underline"
                  >
                    Sign in
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}