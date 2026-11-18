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
  BookOpen,
  FolderSearch,
  HelpCircle,
  Heart,
  Trash2,
  Pencil,
  FolderPlus,
  Search,
  Clock,
  X,
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
  job_id?: string;
  caption_style?: Record<string, any>;
  saved_to_cloud?: boolean;
  is_favorite?: boolean;
  folder_name?: string;
  social_meta?: {
    post_title: string;
    description: string;
    hashtags: string;
    pinned_comment: string;
  };
  expires_at?: string | null;
  created_at?: string;
}

interface JobStatus {
  job_id: string;
  status: "queued" | "processing" | "needs_confirmation" | "completed" | "failed" | "cancelled";
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
  const [mode, setMode] = useState<"file" | "url">("file");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [numClips, setNumClips] = useState(4);
  const [showSubtitleStudio, setShowSubtitleStudio] = useState(false);
  const [captionPreset, setCaptionPreset] = useState("hormozi");
  const [captionPrimaryColor, setCaptionPrimaryColor] = useState("#FFFFFF");
  const [captionHighlightColor, setCaptionHighlightColor] = useState("#FFFF00");
  const [captionWordsPerLine, setCaptionWordsPerLine] = useState(2);
  const [captionPosition, setCaptionPosition] = useState<"top" | "center" | "bottom">("bottom");
  const [captionCasing, setCaptionCasing] = useState<"upper" | "sentence">("upper");
  const [captionBounce, setCaptionBounce] = useState(true);
  const [captionShowHook, setCaptionShowHook] = useState(true);
  const [captionCustomHook, setCaptionCustomHook] = useState("");
  const [captionHookTheme, setCaptionHookTheme] = useState<string>("gold");
  const [captionHookSize, setCaptionHookSize] = useState<string>("md");
  const [captionHookPosition, setCaptionHookPosition] = useState<string>("top");
  const [captionHookCasing, setCaptionHookCasing] = useState<string>("upper");
  const [editingHookClipId, setEditingHookClipId] = useState<string | null>(null);
  const [editHookShow, setEditHookShow] = useState<boolean>(true);
  const [editHookText, setEditHookText] = useState<string>("");
  const [editHookTheme, setEditHookTheme] = useState<string>("gold");
  const [editHookSize, setEditHookSize] = useState<string>("md");
  const [editHookPosition, setEditHookPosition] = useState<string>("top");
  const [editHookCasing, setEditHookCasing] = useState<string>("upper");
  const [rerenderingClipId, setRerenderingClipId] = useState<string | null>(null);
  const [batchHookAppend, setBatchHookAppend] = useState<string>("");
  const [batchHookPlacement, setBatchHookPlacement] = useState<"suffix" | "prefix">("suffix");
  const [batchAppendingHooks, setBatchAppendingHooks] = useState<boolean>(false);

  const applyCaptionPreset = (p: string) => {
    setCaptionPreset(p);
    if (p === "hormozi") {
      setCaptionPrimaryColor("#FFFFFF");
      setCaptionHighlightColor("#FFFF00");
      setCaptionWordsPerLine(2);
      setCaptionCasing("upper");
      setCaptionBounce(true);
    } else if (p === "mrbeast") {
      setCaptionPrimaryColor("#FFFFFF");
      setCaptionHighlightColor("#FF3B30");
      setCaptionWordsPerLine(2);
      setCaptionCasing("upper");
      setCaptionBounce(true);
    } else if (p === "podcast") {
      setCaptionPrimaryColor("#F8FAFC");
      setCaptionHighlightColor("#38BDF8");
      setCaptionWordsPerLine(3);
      setCaptionCasing("sentence");
      setCaptionBounce(false);
    } else if (p === "neon") {
      setCaptionPrimaryColor("#E0E7FF");
      setCaptionHighlightColor("#00F5D4");
      setCaptionWordsPerLine(2);
      setCaptionCasing("upper");
      setCaptionBounce(true);
    } else if (p === "minimal") {
      setCaptionPrimaryColor("#FFFFFF");
      setCaptionHighlightColor("#FACC15");
      setCaptionWordsPerLine(3);
      setCaptionCasing("sentence");
      setCaptionBounce(false);
    }
  };
  const [dynamicMode, setDynamicMode] = useState(true);

  // Normalized Universal BYOK state
  const [showByok, setShowByok] = useState(true);
  const [userProvider, setUserProvider] = useState("auto");
  const [userApiKey, setUserApiKey] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [customModel, setCustomModel] = useState("");

  // User Manual state
  const [manualTab, setManualTab] = useState<"upload" | "find" | "api">("upload");

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
        if (data.status === "completed" || data.status === "failed" || data.status === "cancelled") {
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

  const openGuideSection = (tab: "upload" | "find" | "api") => {
    setActiveView("create");
    setManualTab(tab);
    setTimeout(() => {
      document
        .getElementById("user-manual")
        ?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (mode === "file" && !file) {
      setFormError("Please select an MP4 or MOV video file to upload.");
      return;
    }
    if (mode === "url" && !url.trim()) {
      setFormError("Please paste a valid YouTube or video URL.");
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
      formData.append(
        "caption_style",
        JSON.stringify({
          preset: captionPreset,
          enabled: captionPreset !== "none",
          primaryColor: captionPrimaryColor,
          highlightColor: captionHighlightColor,
          wordsPerLine: captionWordsPerLine,
          position: captionPosition,
          casing: captionCasing,
          bounce: captionBounce,
          showHook: captionShowHook,
          customHook: captionCustomHook.trim(),
            hookTheme: captionHookTheme,
            hookSize: captionHookSize,
            hookPosition: captionHookPosition,
            hookCasing: captionHookCasing,
        })
      );
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

  const [confirming, setConfirming] = useState(false);
  const [savingClipId, setSavingClipId] = useState<string | null>(null);
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryTab, setLibraryTab] = useState<"all" | "favorites">("all");
  const [selectedFolder, setSelectedFolder] = useState<string>("ALL");
  const [customFolders, setCustomFolders] = useState<string[]>([]);
  const [newFolderInput, setNewFolderInput] = useState("");

  useEffect(() => {
    setSelectedFolder("ALL");
    setShowFolderPicker(false);
    setCustomFolders([]);
    try {
      localStorage.removeItem("peakslicer_folders");
    } catch {}
    const uid = session?.user?.id;
    if (!uid) return;

    let cancelled = false;
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
        Authorization: `Bearer ${session.access_token}`,
      },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => {
        if (cancelled || !u || u.id !== uid) return;
        const metaFolders = u.user_metadata?.folders;
        setCustomFolders(Array.isArray(metaFolders) ? metaFolders : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const allFolders = Array.from(
    new Set([
      ...customFolders,
      ...savedClips.map((c) => (c.folder_name || "").trim()).filter(Boolean),
    ])
  );

  const [showFolderPicker, setShowFolderPicker] = useState(false);

  const handleDeleteFolder = async (folderName: string) => {
    const updated = customFolders.filter((f) => f !== folderName);
    setCustomFolders(updated);
    if (session?.user?.id) {
      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ data: { folders: updated } }),
      });
    }
    if (selectedFolder === folderName) {
      setSelectedFolder("ALL");
      setShowFolderPicker(false);
    }
    setSavedClips((prev) =>
      prev.map((c) =>
        (c.folder_name || "") === folderName ? { ...c, folder_name: "" } : c
      )
    );
    if (session?.access_token) {
      await fetch(`${API_BASE}/api/folders/${encodeURIComponent(folderName)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newFolderInput.trim();
    if (!name || !session?.user?.id) return;
    if (!allFolders.includes(name)) {
      const updated = [...customFolders, name];
      setCustomFolders(updated);
      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ data: { folders: updated } }),
      });
    }
    setSelectedFolder(name);
    setNewFolderInput("");
  };

  const handleToggleFavorite = async (clip: ClipResult) => {
    if (!session) return;
    const nextVal = !clip.is_favorite;
    setSavedClips((prev) =>
      prev.map((c) => (c.id === clip.id ? { ...c, is_favorite: nextVal } : c))
    );
    await fetch(`${API_BASE}/api/saved-clips/${clip.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ is_favorite: nextVal }),
    });
  };

  const handleAssignFolder = async (clip: ClipResult, folderName: string) => {
    if (!session) return;
    setSavedClips((prev) =>
      prev.map((c) => (c.id === clip.id ? { ...c, folder_name: folderName } : c))
    );
    await fetch(`${API_BASE}/api/saved-clips/${clip.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ folder_name: folderName }),
    });
  };

  const [editingClipId, setEditingClipId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<
    | { type: "clip"; clip: ClipResult }
    | { type: "folder"; folderName: string }
    | null
  >(null);

  const handleRenameSavedClip = async (clip: ClipResult) => {
    const clean = renameDraft.trim().slice(0, 80);
    setEditingClipId(null);
    if (!clean || clean === clip.title || !session) return;
    setSavedClips((prev) =>
      prev.map((c) => (c.id === clip.id ? { ...c, title: clean } : c))
    );
    await fetch(`${API_BASE}/api/saved-clips/${clip.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ title: clean }),
    });
  };

  const handleDeleteSavedClip = async (clip: ClipResult) => {
    if (!session) return;
    setSavedClips((prev) => prev.filter((c) => c.id !== clip.id));
    await fetch(`${API_BASE}/api/saved-clips/${clip.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
  };

  const formatTimeRemaining = (expiresAt?: string | null) => {
    if (!expiresAt) return "Permanent backup";
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    if (diffMs <= 0) return "Expiring soon";
    const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return days > 0 ? `${days}d ${hours}h left` : `${hours}h left`;
  };

  const [manuallySavedIds, setManuallySavedIds] = useState<Record<string, boolean>>({});

  const focusApiKeySetup = () => {
    setActiveView("create");
    setShowByok(true);
    setManualTab("api");
    setTimeout(() => {
      const el = document.getElementById("byok-api-box");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      const inp = document.getElementById("byok-key-input") as HTMLInputElement | null;
      if (inp) inp.focus();
    }, 80);
  };

  const handleSaveClip = async (clip: ClipResult) => {
    if (!session) {
      setAuthMode("login");
      setShowAuthModal(true);
      return;
    }
    const key = String(clip.id);
    setSavingClipId(key);
    try {
      const res = await fetch(`${API_BASE}/api/save-clip`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          job_id: jobId,
          video_url: clip.video_url,
          hook_banner: clip.hook_banner,
          title: clip.title,
          story_arc: clip.story_arc,
          cuts: clip.cuts || 1,
          duration: clip.duration,
        }),
      });
      if (res.ok) {
        const resData = await res.json().catch(() => ({}));
        setManuallySavedIds((prev) => ({ ...prev, [key]: true }));
        if (resData.duplicate) {
          alert("This clip is already in your Saved Clips library!");
        }
        fetchUserLibrary(session);
      } else {
        const err = await res.json();
        alert(err.detail || "Could not save clip.");
      }
    } catch {
      alert("Network error while saving clip.");
    } finally {
      setSavingClipId(null);
    }
  };

  const [openMetaIds, setOpenMetaIds] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const toggleClipMeta = (id: number | string) => {
    const k = String(id);
    setOpenMetaIds((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const copyMetaText = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };


  const handleConfirmChoice = async (proceed: boolean) => {
    if (!jobId) return;
    setConfirming(true);
    try {
      const res = await fetch(`${API_BASE}/api/confirm/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proceed }),
      });
      if (res.ok && session?.access_token) {
        fetchUserLibrary(session);
      }
    } catch {
      // Polling will pick up status change
    } finally {
      setConfirming(false);
    }
  };

  const resolveMediaUrl = (rawUrl: string) =>
    rawUrl.startsWith("http") ? rawUrl : `${API_BASE}${rawUrl}`;

  const isWorking = job?.status === "queued" || job?.status === "processing" || job?.status === "needs_confirmation";
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
                PeakSlicer <span className="text-amber-400">AI</span>
              </span>
            </button>

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
                onClick={() => openGuideSection("upload")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-zinc-400 hover:text-zinc-200 transition"
              >
                <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                User Manual
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!session) {
                    setAuthMode("login");
                    setShowAuthModal(true);
                    return;
                  }
                  setActiveView("library");
                  fetchUserLibrary(session);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  activeView === "library"
                    ? "bg-zinc-800 text-amber-400"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <FolderHeart className="w-3.5 h-3.5 text-amber-400" />
                My Saved Clips{session ? ` (${savedClips.length})` : ""}
              </button>
            </nav>
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
          /* Saved Clips Cloud Library View with Search, Favorites, Folders & Expiry Timer */
          <section>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h1 className="text-3xl font-black tracking-tight flex items-center gap-2.5">
                  <FolderHeart className="w-7 h-7 text-amber-400" />
                  My Saved Shorts Library
                </h1>
                <p className="text-sm text-zinc-400 mt-1">
                  Signed in as {session.user.email} ?{" "}
                  {profile?.backup_days
                    ? `Clips backed up for ${profile.backup_days} days on ${currentPlan.toUpperCase()} tier.`
                    : "Permanent cloud backup active on PRO MAX."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveView("create")}
                className="px-4 py-2.5 rounded-xl bg-amber-400 text-zinc-950 font-black text-xs shrink-0"
              >
                + Generate New Shorts
              </button>
            </div>

            {/* Search, All vs Favorites Tabs & Folder Creation Bar */}
            <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 mb-6 space-y-4">
              <div className="flex flex-col md:flex-row gap-3 justify-between">
                {/* Search Input */}
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={librarySearch}
                    onChange={(e) => setLibrarySearch(e.target.value)}
                    placeholder="Search saved clips by title, hook, or description..."
                    className="w-full pl-10 pr-4 py-2 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-amber-400 focus:outline-none text-xs text-zinc-100 placeholder-zinc-500"
                  />
                </div>

                {/* All vs Favorites Toggle */}
                <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800 w-fit">
                  <button
                    type="button"
                    onClick={() => setLibraryTab("all")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      libraryTab === "all"
                        ? "bg-amber-400 text-zinc-950"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    All Clips ({savedClips.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setLibraryTab("favorites")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      libraryTab === "favorites"
                        ? "bg-amber-400 text-zinc-950"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <Heart className="w-3.5 h-3.5" />
                    Favorites ({savedClips.filter((c) => c.is_favorite).length})
                  </button>
                </div>
              </div>

              {/* Folders Filter Pills + Create New Folder */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-800/80">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedFolder("ALL")}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                      selectedFolder === "ALL"
                        ? "bg-zinc-800 text-amber-400 border border-amber-400/40"
                        : "bg-zinc-950 text-zinc-400 border border-zinc-800 hover:text-zinc-200"
                    }`}
                  >
                    All Folders
                  </button>
                  {allFolders.map((folder) => (
                    <div
                      key={folder}
                      className={`inline-flex items-center rounded-lg border text-xs font-semibold transition ${
                        selectedFolder === folder
                          ? "bg-zinc-800 text-amber-400 border-amber-400/40"
                          : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedFolder(folder);
                          setShowFolderPicker(false);
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1"
                      >
                        <FolderHeart className="w-3 h-3 text-amber-400" />
                        <span>{folder}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteTarget({ type: "folder", folderName: folder })}
                        className="px-1.5 py-1 text-zinc-400 hover:text-red-400 border-l border-zinc-800/80 transition flex items-center"
                        title={`Delete folder "${folder}"`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleCreateFolder} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={newFolderInput}
                    onChange={(e) => setNewFolderInput(e.target.value)}
                    placeholder="New folder name..."
                    className="px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 focus:border-amber-400 focus:outline-none text-xs text-zinc-100 placeholder-zinc-500 w-40"
                  />
                  <button
                    type="submit"
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-400 font-bold text-xs transition"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    Add Folder
                  </button>
                </form>
              </div>

              {savedClips.length > 0 && (
                <div className="mb-4 p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800 flex flex-col md:flex-row md:items-center gap-2.5">
                  <div className="text-xs font-bold text-amber-300 shrink-0">
                    Append to All Clip Banners:
                  </div>
                  <input
                    type="text"
                    value={batchHookAppend}
                    onChange={(e) => setBatchHookAppend(e.target.value)}
                    maxLength={30}
                    placeholder="e.g. | GTA 6 or PART 1:"
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-amber-400 focus:outline-none"
                  />
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setBatchHookPlacement((p) => (p === "suffix" ? "prefix" : "suffix"))}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-zinc-950 text-zinc-300 border border-zinc-700 hover:border-amber-400 transition"
                    >
                      {batchHookPlacement === "suffix" ? "At End (Hook + Text)" : "At Start (Text + Hook)"}
                    </button>
                    <button
                      type="button"
                      disabled={batchAppendingHooks || !batchHookAppend.trim()}
                      onClick={async () => {
                        const visible = selectedFolder === "ALL"
                          ? savedClips
                          : savedClips.filter((c: any) => (c.folder || "Uncategorized") === selectedFolder);
                        const jobIds = Array.from(
                          new Set(
                            visible
                              .map((c) => c.job_id || c.video_url?.match(/\/files\/([^/]+)\//)?.[1])
                              .filter(Boolean) as string[]
                          )
                        );
                        if (jobIds.length === 0) {
                          alert("No active render sessions found for these clips.");
                          return;
                        }
                        try {
                          setBatchAppendingHooks(true);
                          for (const jid of jobIds) {
                            const res = await fetch(resolveMediaUrl("/api/clips/batch-append-hook"), {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                job_id: jid,
                                append_text: batchHookAppend.trim(),
                                placement: batchHookPlacement,
                              }),
                            });
                            const out = await res.json();
                            if (!res.ok) {
                              alert(out.detail || "Failed to update banners");
                            } else if (Array.isArray(out.updated)) {
                              const byId = new Map(out.updated.map((u: any) => [String(u.id), u]));
                              setSavedClips((prev) =>
                                prev.map((item) => {
                                  const hit: any = byId.get(String(item.id));
                                  return hit
                                    ? {
                                        ...item,
                                        hook_banner: hit.hook_banner,
                                        video_url: hit.video_url,
                                        caption_style: hit.caption_style,
                                      }
                                    : item;
                                })
                              );
                            }
                          }
                          setBatchHookAppend("");
                        } catch (err) {
                          alert("Network error while updating banners.");
                        } finally {
                          setBatchAppendingHooks(false);
                        }
                      }}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-black bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-zinc-950 transition"
                    >
                      {batchAppendingHooks ? "Updating All Clips..." : "Append to All"}
                    </button>
                  </div>
                </div>
              )}

              {selectedFolder !== "ALL" && (
                <div className="pt-3 border-t border-zinc-800/80 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-zinc-300 font-semibold">
                      Viewing folder: <strong className="text-amber-400">{selectedFolder}</strong>
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowFolderPicker((v) => !v)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-zinc-950 font-black text-xs transition"
                      >
                        <FolderPlus className="w-3.5 h-3.5" />
                        {showFolderPicker ? "Done Adding" : `+ Add Clips to ${selectedFolder}`}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteTarget({ type: "folder", folderName: selectedFolder })}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900/70 border border-red-800/70 text-red-300 font-bold text-xs transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete Folder
                      </button>
                    </div>
                  </div>

                  {showFolderPicker && (
                    <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 space-y-2">
                      <p className="text-[11px] text-zinc-400">
                        Click any clip below to add or remove it from <strong className="text-amber-400">{selectedFolder}</strong>:
                      </p>
                      {savedClips.length === 0 ? (
                        <p className="text-xs text-zinc-500">No saved clips available yet.</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                          {savedClips.map((c) => {
                            const inThisFolder = (c.folder_name || "") === selectedFolder;
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() =>
                                  handleAssignFolder(c, inThisFolder ? "" : selectedFolder)
                                }
                                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left text-xs transition ${
                                  inThisFolder
                                    ? "bg-amber-400/15 border-amber-400/50 text-amber-300 font-bold"
                                    : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700"
                                }`}
                              >
                                <span className="truncate">{c.title}</span>
                                <span className="shrink-0 text-[10px] uppercase font-black">
                                  {inThisFolder ? "Added ?" : "+ Add"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {loadingLibrary ? (
              <div className="py-20 flex flex-col items-center justify-center text-zinc-400">
                <Loader2 className="w-7 h-7 animate-spin text-amber-400 mb-3" />
                Loading your saved clips...
              </div>
            ) : (() => {
              const filteredClips = savedClips.filter((c) => {
                if (libraryTab === "favorites" && !c.is_favorite) return false;
                if (selectedFolder !== "ALL" && (c.folder_name || "") !== selectedFolder)
                  return false;
                if (librarySearch.trim()) {
                  const q = librarySearch.toLowerCase();
                  const hay = `${c.title} ${c.hook_banner} ${c.story_arc} ${c.folder_name || ""}`.toLowerCase();
                  if (!hay.includes(q)) return false;
                }
                return true;
              });

              if (filteredClips.length === 0) {
                return (
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-12 text-center">
                    <Film className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                    <h3 className="font-bold text-lg text-zinc-200">
                      {savedClips.length === 0
                        ? "No saved Shorts yet"
                        : "No clips match this filter"}
                    </h3>
                    <p className="text-sm text-zinc-400 mt-1 mb-5">
                      {savedClips.length === 0
                        ? "Click Save on any generated Short to store it here."
                        : "Try clearing your search or switching folders/tabs."}
                    </p>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {filteredClips.map((clip) => (
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
                        {/* Top-left Expiration Countdown Badge */}
                        <span className="absolute top-2.5 left-2.5 flex items-center gap-1 px-2 py-1 rounded-lg bg-black/80 backdrop-blur text-[10px] font-bold text-amber-300 border border-zinc-700/80">
                          <Clock className="w-3 h-3" />
                          {formatTimeRemaining(clip.expires_at)}
                        </span>
                        {/* Top-right Favorite & Delete Buttons */}
                        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleToggleFavorite(clip)}
                            className={`p-1.5 rounded-lg backdrop-blur border transition ${
                              clip.is_favorite
                                ? "bg-rose-500/90 border-rose-400 text-white"
                                : "bg-black/75 border-zinc-700 text-zinc-300 hover:text-rose-400"
                            }`}
                            title={clip.is_favorite ? "Remove from Favorites" : "Add to Favorites"}
                          >
                            <Heart className="w-3.5 h-3.5 fill-current" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteTarget({ type: "clip", clip })}
                            className="p-1.5 rounded-lg bg-black/75 backdrop-blur border border-zinc-700 text-zinc-300 hover:bg-red-600 hover:border-red-500 hover:text-white transition"
                            title="Delete Saved Clip"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
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
                          {editingClipId === String(clip.id) ? (
                            <div className="flex items-center gap-1 mt-0.5">
                              <input
                                type="text"
                                autoFocus
                                value={renameDraft}
                                onChange={(e) => setRenameDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleRenameSavedClip(clip);
                                  if (e.key === "Escape") setEditingClipId(null);
                                }}
                                className="flex-1 min-w-0 px-2 py-1 rounded bg-zinc-950 border border-amber-400 text-xs font-bold text-zinc-100 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleRenameSavedClip(clip)}
                                className="p-1 rounded bg-amber-400 text-zinc-950 hover:bg-amber-300"
                                title="Save Name"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingClipId(null)}
                                className="p-1 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                                title="Cancel"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-1.5 group">
                              <h3 className="font-bold text-sm text-zinc-100 line-clamp-1">
                                {clip.title}
                              </h3>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingClipId(String(clip.id));
                                  setRenameDraft(clip.title);
                                }}
                                className="p-1 rounded text-zinc-500 hover:text-amber-400 hover:bg-zinc-800 shrink-0 transition"
                                title="Rename Clip"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                          <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
                            {clip.story_arc}
                          </p>
                        </div>

                        {/* Folder Assignment Selector */}
                        <div>
                          <select
                            value={clip.folder_name || ""}
                            onChange={(e) => handleAssignFolder(clip, e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-300 focus:border-amber-400 focus:outline-none"
                          >
                            <option value="">No Folder (Unorganized)</option>
                            {allFolders.map((f) => (
                              <option key={f} value={f}>
                                {f}
                              </option>
                            ))}
                          </select>
                        </div>

                        {(clip.job_id || clip.video_url?.match(/\/files\/([^/]+)\//)?.[1]) && (
                          <div className="pt-2 border-t border-zinc-800/80">
                            <button type="button" onClick={() => { if (editingHookClipId === String(clip.id)) { setEditingHookClipId(null); } else { const st = clip.caption_style || {}; setEditingHookClipId(String(clip.id)); setEditHookShow(st.showHook !== false); setEditHookText(clip.hook_banner || ""); setEditHookTheme(st.hookTheme || "gold"); setEditHookSize(st.hookSize || "md"); setEditHookPosition(st.hookPosition || "top"); setEditHookCasing(st.hookCasing || "upper"); } }} className="w-full py-1.5 px-2.5 rounded-lg text-xs font-bold bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-zinc-800 flex items-center justify-between transition">
                              <span>Edit Top Hook Banner</span>
                              <span>{editingHookClipId === String(clip.id) ? "[-]" : "[+]"}</span>
                            </button>
                            {editingHookClipId === String(clip.id) && (
                              <div className="mt-2 p-2.5 rounded-lg bg-zinc-950/90 border border-zinc-800 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-bold text-zinc-400">Show Hook Banner</span>
                                  <button type="button" onClick={() => setEditHookShow((v) => !v)} className={`px-2 py-0.5 rounded text-[11px] font-bold ${editHookShow ? "bg-amber-400 text-zinc-950" : "bg-zinc-800 text-zinc-400"}`}>{editHookShow ? "ON" : "OFF"}</button>
                                </div>
                                {editHookShow && (
                                  <>
                                    <input type="text" value={editHookText} onChange={(e) => setEditHookText(e.target.value)} maxLength={45} placeholder="Enter top hook text..." className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-100 focus:border-amber-400 focus:outline-none" />
                                    <div className="flex flex-wrap gap-1">
                                      {[{ id: "gold", label: "Gold" }, { id: "red", label: "Red" }, { id: "cyan", label: "Cyan" }, { id: "white", label: "White" }, { id: "minimal", label: "Clean" }].map((t) => (
                                        <button key={t.id} type="button" onClick={() => setEditHookTheme(t.id)} className={`px-2 py-0.5 rounded text-[10px] font-bold border ${editHookTheme === t.id ? "bg-amber-400 text-zinc-950 border-amber-400" : "bg-zinc-900 text-zinc-300 border-zinc-800"}`}>{t.label}</button>
                                      ))}
                                    </div>
                                    <div className="flex gap-1">
                                      {[{ id: "sm", label: "Small" }, { id: "md", label: "Med" }, { id: "lg", label: "Large" }].map((s) => (
                                        <button key={s.id} type="button" onClick={() => setEditHookSize(s.id)} className={`flex-1 py-0.5 rounded text-[10px] font-bold border ${editHookSize === s.id ? "bg-amber-400 text-zinc-950 border-amber-400" : "bg-zinc-900 text-zinc-300 border-zinc-800"}`}>{s.label}</button>
                                      ))}
                                      <button type="button" onClick={() => setEditHookPosition((p) => p === "top" ? "above_video" : "top")} className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-900 text-zinc-200 border border-zinc-700">{editHookPosition === "top" ? "Top" : "Near Vid"}</button>
                                      <button type="button" onClick={() => setEditHookCasing((c) => c === "upper" ? "title" : "upper")} className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-900 text-zinc-200 border border-zinc-700">{editHookCasing === "upper" ? "AA" : "Aa"}</button>
                                    </div>
                                  </>
                                )}
                                <button type="button" disabled={rerenderingClipId === String(clip.id)} onClick={async () => { try { setRerenderingClipId(String(clip.id)); const res = await fetch(resolveMediaUrl("/api/clips/rerender-hook"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job_id: clip.job_id || clip.video_url?.match(/\/files\/([^/]+)\//)?.[1], clip_id: Number(String(clip.id).replace(/\D/g, '')) || 1, show_hook: editHookShow, hook_text: editHookText, hook_theme: editHookTheme, hook_size: editHookSize, hook_position: editHookPosition, hook_casing: editHookCasing }) }); const out = await res.json(); if (!res.ok) { alert(out.detail || "Failed to update hook banner"); } else { setSavedClips((prev) => prev.map((item) => String(item.id) === String(clip.id) ? { ...item, hook_banner: out.hook_banner, video_url: out.video_url, caption_style: out.caption_style } : item)); setEditingHookClipId(null); } } catch (err) { alert("Network error while re-rendering hook banner."); } finally { setRerenderingClipId(null); } }} className="w-full py-1.5 rounded bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-zinc-950 font-black text-xs transition">
                                  {rerenderingClipId === String(clip.id) ? "Updating Video (~2s)..." : "Apply & Re-render Clip"}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
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
              );
            })()}
          </section>
        ) : (
          /* Main Creator Studio View */
          <>
            {/* Hero */}
            <div className="text-center max-w-2xl mx-auto mb-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-300 text-xs font-bold mb-4">
                <Upload className="w-3.5 h-3.5" />
                Direct MP4-to-Shorts AI Engine • Bring Your Own API Key
              </div>
              <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-4">
                Turn Raw MP4 Videos Into{" "}
                <span className="text-amber-400">Viral Shorts</span>
              </h1>
              <p className="text-zinc-400 text-base sm:text-lg">
                Upload any MP4 gameplay, podcast, or stream recording. Our AI
                detects peak reactions, stitches the full story arc, and burns
                in dynamic 9:16 captions automatically.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4 mt-4 text-xs text-zinc-400">
                <button
                  type="button"
                  onClick={() => openGuideSection("upload")}
                  className="text-amber-400 hover:underline font-semibold"
                >
                  How to Upload MP4s
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => openGuideSection("find")}
                  className="text-amber-400 hover:underline font-semibold"
                >
                  Where to Find MP4 Files
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => openGuideSection("api")}
                  className="text-amber-400 hover:underline font-semibold"
                >
                  Setup Free Custom AI API Key
                </button>
              </div>
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
              {/* Source Mode Tabs (MP4 Primary) */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <div className="flex gap-2 p-1 bg-zinc-950 rounded-xl border border-zinc-800 w-fit">
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
                    <span
                      className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${
                        mode === "file"
                          ? "bg-zinc-950/20 text-zinc-950"
                          : "bg-amber-400/15 text-amber-400"
                      }`}
                    >
                      Primary
                    </span>
                  </button>
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
                </div>

                <button
                  type="button"
                  onClick={() => openGuideSection("find")}
                  className="text-xs text-zinc-400 hover:text-amber-400 flex items-center gap-1.5 transition"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                  Need help finding your MP4 file?
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {mode === "file" ? (
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                      Local Video File (.mp4 / .mov / .mkv)
                    </label>
                    <label className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-zinc-700 hover:border-amber-400/70 rounded-xl cursor-pointer bg-zinc-950/60 transition px-4 text-center">
                      <Film className="w-8 h-8 text-amber-400 mb-2" />
                      <span className="text-sm font-semibold text-zinc-200">
                        {file
                          ? `${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`
                          : "Click here to choose an MP4 video from your device"}
                      </span>
                      <span className="text-xs text-zinc-500 mt-1">
                        Fastest & most reliable method • Works with OBS,
                        ShadowPlay, phone videos & edited exports
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
                ) : (
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                      Video URL (Secondary Option)
                    </label>
                    <input
                      type="url"
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      disabled={submitting || isWorking}
                      className="w-full px-4 py-3.5 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-amber-400 focus:outline-none text-zinc-100 placeholder-zinc-600"
                    />
                    <p className="text-[11px] text-zinc-500 mt-1.5">
                      Tip: For 100% reliability without YouTube download blocks,
                      use the{" "}
                      <button
                        type="button"
                        onClick={() => setMode("file")}
                        className="text-amber-400 underline"
                      >
                        Upload MP4
                      </button>{" "}
                      tab.
                    </p>
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
                <div id="byok-api-box" className="border border-amber-400/30 rounded-xl bg-zinc-950/50 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowByok(!showByok)}
                    className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-zinc-300 hover:text-zinc-100 transition"
                  >
                    <span className="flex items-center gap-2">
                      <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                      {hasCustomKey
                        ? `Custom AI Provider Active (${userProvider.toUpperCase()})`
                        : "Bring Your Own AI API Key (Gemini, Groq, Claude, OpenAI, Custom)"}
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
                            <option value="gemini">Google Gemini (Free Key)</option>
                            <option value="groq">
                              Groq (Free Llama 3.3 + Whisper)
                            </option>
                            <option value="claude">Anthropic Claude</option>
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
                            Your API Key
                          </label>
                          <input
                            type="password"
                            id="byok-key-input"
                            placeholder="Paste your key (AIza..., gsk_..., sk-ant-..., sk-or-..., sk-...)"
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

                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400">
                        <span>
                          Stored strictly in your browser&apos;s local storage
                          and sent only when generating clips.
                        </span>
                        <button
                          type="button"
                          onClick={() => openGuideSection("api")}
                          className="text-amber-400 hover:underline font-semibold"
                        >
                          How to get a free Gemini or Groq key →
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Custom Subtitles Studio */}
                <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/60 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowSubtitleStudio((v) => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-900/50 transition"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="px-2 py-0.5 rounded bg-amber-400/15 border border-amber-400/30 text-amber-300 text-[11px] font-bold uppercase tracking-wider">
                        Subtitles Studio
                      </span>
                      <span className="text-xs sm:text-sm font-semibold text-zinc-200 capitalize">
                        Style: {captionPreset === "none" ? "No Captions (Raw)" : captionPreset}
                      </span>
                      <span className="hidden sm:inline text-xs text-zinc-500">
                        | {captionWordsPerLine}w/line | {captionPosition}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-amber-400">
                      {showSubtitleStudio ? "Hide [-]" : "Customize [+]"}
                    </span>
                  </button>

                  {showSubtitleStudio && (
                    <div className="p-4 border-t border-zinc-800/80 grid grid-cols-1 lg:grid-cols-3 gap-4">
                      {/* Controls Column */}
                      <div className="lg:col-span-2 space-y-4">
                        <div>
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
                            1. Creator Style Presets
                          </label>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {[
                              { id: "hormozi", label: "Hormozi Pop", desc: "Bold yellow bounce" },
                              { id: "mrbeast", label: "MrBeast Impact", desc: "Heavy red/white" },
                              { id: "podcast", label: "Clean Podcast", desc: "Dark pill badge" },
                              { id: "neon", label: "Neon Gaming", desc: "Cyan cyber glow" },
                              { id: "minimal", label: "Minimal Clean", desc: "Subtle modern" },
                              { id: "none", label: "No Captions", desc: "Clean 9:16 video" },
                            ].map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => applyCaptionPreset(p.id)}
                                className={`p-2.5 rounded-lg border text-left transition ${
                                  captionPreset === p.id
                                    ? "bg-amber-400/15 border-amber-400 text-amber-200"
                                    : "bg-zinc-900/80 border-zinc-800 text-zinc-300 hover:border-zinc-700"
                                }`}
                              >
                                <div className="text-xs font-bold">{p.label}</div>
                                <div className="text-[10px] text-zinc-400 mt-0.5">{p.desc}</div>
                              </button>
                            ))}
                          </div>
                        </div>

                        {captionPreset !== "none" && (
                          <>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                                  Active Word Color
                                </label>
                                <div className="flex items-center gap-1.5">
                                  {["#FFFF00", "#FF3B30", "#00F5D4", "#4ADE80", "#C084FC"].map((hex) => (
                                    <button
                                      key={hex}
                                      type="button"
                                      onClick={() => setCaptionHighlightColor(hex)}
                                      style={{ backgroundColor: hex }}
                                      className={`w-6 h-6 rounded-full border-2 transition ${
                                        captionHighlightColor.toUpperCase() === hex
                                          ? "border-white scale-110"
                                          : "border-zinc-900 opacity-80 hover:opacity-100"
                                      }`}
                                      title={hex}
                                    />
                                  ))}
                                </div>
                              </div>

                              <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                                  Base Text Color
                                </label>
                                <div className="flex items-center gap-1.5">
                                  {["#FFFFFF", "#FEF08A", "#E2E8F0", "#93C5FD"].map((hex) => (
                                    <button
                                      key={hex}
                                      type="button"
                                      onClick={() => setCaptionPrimaryColor(hex)}
                                      style={{ backgroundColor: hex }}
                                      className={`w-6 h-6 rounded-full border-2 transition ${
                                        captionPrimaryColor.toUpperCase() === hex
                                          ? "border-amber-400 scale-110"
                                          : "border-zinc-900 opacity-80 hover:opacity-100"
                                      }`}
                                      title={hex}
                                    />
                                  ))}
                                </div>
                              </div>

                              <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                                  Words Per Line
                                </label>
                                <div className="flex gap-1">
                                  {[1, 2, 3, 4].map((w) => (
                                    <button
                                      key={w}
                                      type="button"
                                      onClick={() => setCaptionWordsPerLine(w)}
                                      className={`flex-1 py-1 rounded text-xs font-bold border transition ${
                                        captionWordsPerLine === w
                                          ? "bg-amber-400 text-zinc-950 border-amber-400"
                                          : "bg-zinc-900 text-zinc-300 border-zinc-800"
                                      }`}
                                    >
                                      {w}w
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                                  Vertical Position
                                </label>
                                <div className="flex gap-1">
                                  {(["top", "center", "bottom"] as const).map((pos) => (
                                    <button
                                      key={pos}
                                      type="button"
                                      onClick={() => setCaptionPosition(pos)}
                                      className={`flex-1 py-1 rounded text-xs font-bold capitalize border transition ${
                                        captionPosition === pos
                                          ? "bg-amber-400 text-zinc-950 border-amber-400"
                                          : "bg-zinc-900 text-zinc-300 border-zinc-800"
                                      }`}
                                    >
                                      {pos}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                                  Letter Casing
                                </label>
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setCaptionCasing("upper")}
                                    className={`flex-1 py-1 rounded text-xs font-bold border transition ${
                                      captionCasing === "upper"
                                        ? "bg-amber-400 text-zinc-950 border-amber-400"
                                        : "bg-zinc-900 text-zinc-300 border-zinc-800"
                                    }`}
                                  >
                                    UPPER
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setCaptionCasing("sentence")}
                                    className={`flex-1 py-1 rounded text-xs font-bold border transition ${
                                      captionCasing === "sentence"
                                        ? "bg-amber-400 text-zinc-950 border-amber-400"
                                        : "bg-zinc-900 text-zinc-300 border-zinc-800"
                                    }`}
                                  >
                                    Sentence
                                  </button>
                                </div>
                              </div>

                              <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                                  Pop Animation
                                </label>
                                <button
                                  type="button"
                                  onClick={() => setCaptionBounce((b) => !b)}
                                  className={`w-full py-1 rounded text-xs font-bold border transition ${
                                    captionBounce
                                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                      : "bg-zinc-900 text-zinc-400 border-zinc-800"
                                  }`}
                                >
                                  {captionBounce ? "Bounce: ON" : "Bounce: OFF"}
                                </button>
                              </div>
                            </div>
                          </>
                        )}

                        <div className="pt-3 border-t border-zinc-800/80 space-y-2.5">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setCaptionShowHook((h) => !h)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold border shrink-0 transition ${
                                captionShowHook
                                  ? "bg-amber-400/15 text-amber-300 border-amber-400/40"
                                  : "bg-zinc-900 text-zinc-400 border-zinc-800"
                              }`}
                            >
                              Top Hook Banner: {captionShowHook ? "ON" : "OFF"}
                            </button>
                            {captionShowHook && (
                              <input
                                type="text"
                                value={captionCustomHook}
                                onChange={(e) => setCaptionCustomHook(e.target.value)}
                                placeholder="Optional custom hook banner (blank = AI auto hook)"
                                maxLength={45}
                                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-amber-400 focus:outline-none"
                              />
                            )}
                          </div>
                          {captionShowHook && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                              <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">Banner Style</label>
                                <div className="flex flex-wrap gap-1">
                                  {[{ id: "gold", label: "Gold" }, { id: "red", label: "Red" }, { id: "cyan", label: "Cyan" }, { id: "white", label: "White" }, { id: "minimal", label: "Clean" }].map((t) => (
                                    <button key={t.id} type="button" onClick={() => setCaptionHookTheme(t.id)} className={`px-2 py-1 rounded text-[11px] font-bold border transition ${captionHookTheme === t.id ? "bg-amber-400 text-zinc-950 border-amber-400" : "bg-zinc-900 text-zinc-300 border-zinc-800"}`}>{t.label}</button>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">Banner Size</label>
                                <div className="flex gap-1">
                                  {[{ id: "sm", label: "Small" }, { id: "md", label: "Med" }, { id: "lg", label: "Large" }].map((s) => (
                                    <button key={s.id} type="button" onClick={() => setCaptionHookSize(s.id)} className={`flex-1 py-1 rounded text-[11px] font-bold border transition ${captionHookSize === s.id ? "bg-amber-400 text-zinc-950 border-amber-400" : "bg-zinc-900 text-zinc-300 border-zinc-800"}`}>{s.label}</button>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">Position & Case</label>
                                <div className="flex gap-1">
                                  <button type="button" onClick={() => setCaptionHookPosition((p) => p === "top" ? "above_video" : "top")} className="flex-1 py-1 rounded text-[11px] font-bold bg-zinc-900 text-zinc-200 border border-zinc-700 hover:border-amber-400 transition">{captionHookPosition === "top" ? "Top" : "Near Vid"}</button>
                                  <button type="button" onClick={() => setCaptionHookCasing((c) => c === "upper" ? "title" : "upper")} className="px-2 py-1 rounded text-[11px] font-bold bg-zinc-900 text-zinc-200 border border-zinc-700 hover:border-amber-400 transition">{captionHookCasing === "upper" ? "AA" : "Aa"}</button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Live 9:16 Preview Box */}
                      <div className="flex flex-col items-center justify-center bg-zinc-900/60 rounded-xl p-3 border border-zinc-800/80">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
                          Live 9:16 Frame Preview
                        </div>
                        <div className="relative w-36 h-64 rounded-xl overflow-hidden border border-zinc-700 bg-gradient-to-b from-indigo-950 via-zinc-900 to-amber-950/60 shadow-inner p-2.5">
                          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-20 bg-zinc-800/90 border-y border-zinc-700/80 flex items-center justify-center">
                            <span className="text-[9px] font-semibold text-zinc-400 tracking-wider uppercase">
                              16:9 Gameplay / Video
                            </span>
                          </div>

                          <div className={`relative z-10 flex justify-center transition-all ${captionHookPosition === "above_video" ? "pt-7" : "pt-1"}`}>
                            {captionShowHook && (
                              <span className={`px-2 py-0.5 rounded font-black tracking-wide text-center shadow ${captionHookSize === "sm" ? "text-[8px]" : captionHookSize === "lg" ? "text-[11px]" : "text-[9px]"} ${captionHookCasing === "title" ? "capitalize" : "uppercase"} ${captionHookTheme === "red" ? "bg-red-600 text-white" : captionHookTheme === "cyan" ? "bg-zinc-950/90 text-cyan-300 border border-cyan-400/40" : captionHookTheme === "white" ? "bg-white text-zinc-950" : captionHookTheme === "minimal" ? "bg-transparent text-white drop-shadow-[0_1px_2px_rgba(0,0,0,1)]" : "bg-black/85 text-amber-300"}`}>
                                {captionCustomHook.trim() || "INSANE CLUTCH PLAY"}
                              </span>
                            )}
                          </div>

                          <div
                            className={`absolute inset-x-2 z-20 flex justify-center transition-all ${
                              captionPosition === "top"
                                ? "top-12"
                                : captionPosition === "center"
                                ? "top-1/2 -translate-y-1/2"
                                : "bottom-5"
                            }`}
                          >
                            {captionPreset !== "none" ? (
                              <div
                                className={`px-2 py-0.5 rounded text-center font-black leading-tight ${
                                  captionPreset === "podcast"
                                    ? "bg-black/80 text-[11px]"
                                    : captionPreset === "mrbeast"
                                    ? "text-[13px] drop-shadow-[0_2px_2px_rgba(0,0,0,1)]"
                                    : "text-[12px] drop-shadow-[0_2px_2px_rgba(0,0,0,0.95)]"
                                }`}
                              >
                                {(["VIRAL", "SHORTS", "MADE", "FAST"].slice(0, captionWordsPerLine)).map(
                                  (word, idx) => {
                                    const disp =
                                      captionCasing === "upper"
                                        ? word
                                        : word[0] + word.slice(1).toLowerCase();
                                    const isActive = idx === 0;
                                    return (
                                      <span
                                        key={idx}
                                        style={{
                                          color: isActive
                                            ? captionHighlightColor
                                            : captionPrimaryColor,
                                        }}
                                        className={`inline-block mx-0.5 ${
                                          isActive && captionBounce ? "scale-110" : ""
                                        }`}
                                      >
                                        {disp}
                                      </span>
                                    );
                                  }
                                )}
                              </div>
                            ) : (
                              <span className="text-[9px] text-zinc-400 bg-black/50 px-2 py-0.5 rounded">
                                Captions Disabled
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
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
                        Processing MP4...
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
                <div className="mt-5 p-4 rounded-xl bg-red-950/50 border border-red-800/70 text-red-200 text-sm space-y-3">
                  <div className="flex items-center justify-between gap-2.5">
                    <span className="flex items-center gap-2.5">
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                      {formError.replace("API_BUSY:", "").trim()}
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
                  {(formError.includes("API_BUSY") ||
                    formError.toLowerCase().includes("api") ||
                    formError.toLowerCase().includes("busy")) && (
                    <div className="flex flex-wrap items-center gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={focusApiKeySetup}
                        className="px-3.5 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-zinc-950 font-black text-xs transition"
                      >
                        Add Your Own Free API Key ?
                      </button>
                      <button
                        type="button"
                        onClick={() => openGuideSection("api")}
                        className="px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-bold text-xs transition"
                      >
                        Read 30-Sec Setup Guide
                      </button>
                    </div>
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
                                    {job.status === "needs_confirmation" && (
                    <div className="mt-4 p-4 rounded-xl bg-amber-950/40 border border-amber-500/50 space-y-3">
                      <p className="text-sm text-amber-200 font-medium">
                        {job.error ||
                          "AI could not detect standout viral peaks (0 credits charged). Do you wish to continue with auto-selected highlight slices anyway?"}
                      </p>
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          disabled={confirming}
                          onClick={() => handleConfirmChoice(true)}
                          className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-zinc-950 font-black text-xs transition"
                        >
                          {confirming ? "Starting..." : "Yes, Continue & Render"}
                        </button>
                        <button
                          type="button"
                          disabled={confirming}
                          onClick={() => handleConfirmChoice(false)}
                          className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 font-bold text-xs transition"
                        >
                          No, Stop (0 Credits Charged)
                        </button>
                      </div>
                    </div>
                  )}
                  {job.error && job.status !== "needs_confirmation" && (
                    <div className="mt-4 p-4 rounded-xl bg-red-950/40 border border-red-800/70 space-y-3">
                      <p className="text-sm text-red-300">
                        {job.error.replace("API_BUSY:", "").trim()}
                      </p>
                      {(job.error.includes("API_BUSY") ||
                        job.error.toLowerCase().includes("busy") ||
                        job.error.toLowerCase().includes("rate") ||
                        !hasCustomKey) && (
                        <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3.5 space-y-2.5">
                          <div className="text-xs font-black text-amber-400 uppercase tracking-wider">
                            Quick Fix: Connect Your Free Personal AI Key (Takes 30 Seconds)
                          </div>
                          <ol className="text-xs text-zinc-300 space-y-1 list-decimal list-inside">
                            <li>
                              Get a free key from{" "}
                              <a
                                href="https://aistudio.google.com/apikey"
                                target="_blank"
                                rel="noreferrer"
                                className="text-amber-400 underline font-semibold"
                              >
                                Google AI Studio (Gemini)
                              </a>{" "}
                              or{" "}
                              <a
                                href="https://console.groq.com/keys"
                                target="_blank"
                                rel="noreferrer"
                                className="text-amber-400 underline font-semibold"
                              >
                                Groq Cloud
                              </a>
                              .
                            </li>
                            <li>
                              Click <strong>Paste My API Key Now</strong> below and paste it into the API Key box.
                            </li>
                            <li>
                              Click <strong>Generate Viral Shorts</strong> again (0 credits were deducted).
                            </li>
                          </ol>
                          <div className="flex flex-wrap gap-2 pt-1">
                            <button
                              type="button"
                              onClick={focusApiKeySetup}
                              className="px-3.5 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-zinc-950 font-black text-xs transition"
                            >
                              Paste My API Key Now ?
                            </button>
                            <button
                              type="button"
                              onClick={() => openGuideSection("api")}
                              className="px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-bold text-xs transition"
                            >
                              Full Step-by-Step Guide
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
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
              <section className="mb-14">
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
                {job?.status === "completed" && job.clips && job.clips.length > 0 && (
                  <div className="mb-4 p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800 flex flex-col md:flex-row md:items-center gap-2.5">
                    <div className="text-xs font-bold text-amber-300 shrink-0">
                      Append to All Clip Banners:
                    </div>
                    <input
                      type="text"
                      value={batchHookAppend}
                      onChange={(e) => setBatchHookAppend(e.target.value)}
                      maxLength={30}
                      placeholder="e.g. | GTA 6 or PART 1:"
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-amber-400 focus:outline-none"
                    />
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setBatchHookPlacement((p) => (p === "suffix" ? "prefix" : "suffix"))}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-zinc-950 text-zinc-300 border border-zinc-700 hover:border-amber-400 transition"
                      >
                        {batchHookPlacement === "suffix" ? "At End (Hook + Text)" : "At Start (Text + Hook)"}
                      </button>
                      <button
                        type="button"
                        disabled={batchAppendingHooks || !batchHookAppend.trim()}
                        onClick={async () => {
                          const activeJobId = job.job_id || jobId;
                          if (!activeJobId || !batchHookAppend.trim()) return;
                          try {
                            setBatchAppendingHooks(true);
                            const res = await fetch(resolveMediaUrl("/api/clips/batch-append-hook"), {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                job_id: activeJobId,
                                append_text: batchHookAppend.trim(),
                                placement: batchHookPlacement,
                              }),
                            });
                            const out = await res.json();
                            if (!res.ok) {
                              alert(out.detail || "Failed to append to all banners");
                            } else if (Array.isArray(out.updated)) {
                              const byId = new Map(out.updated.map((u: any) => [String(u.id), u]));
                              setJob((prev: any) =>
                                prev && prev.clips
                                  ? {
                                      ...prev,
                                      clips: prev.clips.map((c: any) => {
                                        const hit: any = byId.get(String(c.id));
                                        return hit
                                          ? {
                                              ...c,
                                              hook_banner: hit.hook_banner,
                                              video_url: hit.video_url,
                                              caption_style: hit.caption_style,
                                            }
                                          : c;
                                      }),
                                    }
                                  : prev
                              );
                              setBatchHookAppend("");
                            }
                          } catch (err) {
                            alert("Network error while updating all banners.");
                          } finally {
                            setBatchAppendingHooks(false);
                          }
                        }}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-black bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-zinc-950 transition"
                      >
                        {batchAppendingHooks ? "Updating All Clips..." : "Append to All"}
                      </button>
                    </div>
                  </div>
                )}
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
                        {(clip.job_id || jobId) && (
                          <div className="pt-2 border-t border-zinc-800/80">
                            <button
                              type="button"
                              onClick={() => {
                                const cid = String(clip.id);
                                if (editingHookClipId === cid) {
                                  setEditingHookClipId(null);
                                } else {
                                  const st = clip.caption_style || {};
                                  setEditingHookClipId(cid);
                                  setEditHookShow(st.showHook !== false);
                                  setEditHookText(clip.hook_banner || "");
                                  setEditHookTheme(st.hookTheme || "gold");
                                  setEditHookSize(st.hookSize || "md");
                                  setEditHookPosition(st.hookPosition || "top");
                                  setEditHookCasing(st.hookCasing || "upper");
                                }
                              }}
                              className="w-full py-1.5 px-2.5 rounded-lg text-xs font-bold bg-zinc-950 hover:bg-zinc-800 text-amber-300 border border-zinc-800 flex items-center justify-between transition"
                            >
                              <span>Edit Top Hook Banner</span>
                              <span>{editingHookClipId === String(clip.id) ? "[-]" : "[+]"}</span>
                            </button>

                            {editingHookClipId === String(clip.id) && (
                              <div className="mt-2 p-2.5 rounded-lg bg-zinc-950/95 border border-zinc-800 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-bold text-zinc-400">Show Hook Banner</span>
                                  <button
                                    type="button"
                                    onClick={() => setEditHookShow((v) => !v)}
                                    className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                      editHookShow ? "bg-amber-400 text-zinc-950" : "bg-zinc-800 text-zinc-400"
                                    }`}
                                  >
                                    {editHookShow ? "ON" : "OFF"}
                                  </button>
                                </div>

                                {editHookShow && (
                                  <>
                                    <input
                                      type="text"
                                      value={editHookText}
                                      onChange={(e) => setEditHookText(e.target.value)}
                                      maxLength={45}
                                      placeholder="Enter top hook text..."
                                      className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-100 focus:border-amber-400 focus:outline-none"
                                    />
                                    <div className="flex flex-wrap gap-1">
                                      {[
                                        { id: "gold", label: "Gold" },
                                        { id: "red", label: "Red" },
                                        { id: "cyan", label: "Cyan" },
                                        { id: "white", label: "White" },
                                        { id: "minimal", label: "Clean" },
                                      ].map((t) => (
                                        <button
                                          key={t.id}
                                          type="button"
                                          onClick={() => setEditHookTheme(t.id)}
                                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                            editHookTheme === t.id
                                              ? "bg-amber-400 text-zinc-950 border-amber-400"
                                              : "bg-zinc-900 text-zinc-300 border-zinc-800"
                                          }`}
                                        >
                                          {t.label}
                                        </button>
                                      ))}
                                    </div>
                                    <div className="flex gap-1">
                                      {[
                                        { id: "sm", label: "Small" },
                                        { id: "md", label: "Med" },
                                        { id: "lg", label: "Large" },
                                      ].map((s) => (
                                        <button
                                          key={s.id}
                                          type="button"
                                          onClick={() => setEditHookSize(s.id)}
                                          className={`flex-1 py-0.5 rounded text-[10px] font-bold border ${
                                            editHookSize === s.id
                                              ? "bg-amber-400 text-zinc-950 border-amber-400"
                                              : "bg-zinc-900 text-zinc-300 border-zinc-800"
                                          }`}
                                        >
                                          {s.label}
                                        </button>
                                      ))}
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setEditHookPosition((p) => (p === "top" ? "above_video" : "top"))
                                        }
                                        className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-900 text-zinc-200 border border-zinc-700"
                                      >
                                        {editHookPosition === "top" ? "Top" : "Near Vid"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setEditHookCasing((c) => (c === "upper" ? "title" : "upper"))
                                        }
                                        className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-900 text-zinc-200 border border-zinc-700"
                                      >
                                        {editHookCasing === "upper" ? "AA" : "Aa"}
                                      </button>
                                    </div>
                                  </>
                                )}

                                <button
                                  type="button"
                                  disabled={rerenderingClipId === String(clip.id)}
                                  onClick={async () => {
                                    const activeJobId = clip.job_id || jobId;
                                    try {
                                      setRerenderingClipId(String(clip.id));
                                      const res = await fetch(resolveMediaUrl("/api/clips/rerender-hook"), {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                          job_id: activeJobId,
                                          clip_id: Number(clip.id),
                                          show_hook: editHookShow,
                                          hook_text: editHookText,
                                          hook_theme: editHookTheme,
                                          hook_size: editHookSize,
                                          hook_position: editHookPosition,
                                          hook_casing: editHookCasing,
                                        }),
                                      });
                                      const out = await res.json();
                                      if (!res.ok) {
                                        alert(out.detail || "Failed to update hook banner");
                                      } else {
                                        setJob((prev: any) =>
                                          prev && prev.clips
                                            ? {
                                                ...prev,
                                                clips: prev.clips.map((item: any) =>
                                                  String(item.id) === String(clip.id)
                                                    ? {
                                                        ...item,
                                                        hook_banner: out.hook_banner,
                                                        video_url: out.video_url,
                                                        caption_style: out.caption_style,
                                                      }
                                                    : item
                                                ),
                                              }
                                            : prev
                                        );
                                        setEditingHookClipId(null);
                                      }
                                    } catch (err) {
                                      alert("Network error while re-rendering hook banner.");
                                    } finally {
                                      setRerenderingClipId(null);
                                    }
                                  }}
                                  className="w-full py-1.5 rounded bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-zinc-950 font-black text-xs transition"
                                >
                                  {rerenderingClipId === String(clip.id)
                                    ? "Updating Video (~2s)..."
                                    : "Apply & Re-render Clip"}
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                                              {/* Shorts / Reels Post Details Dropdown */}
                      <div className="border-t border-zinc-800/80 pt-2">
                        <button
                          type="button"
                          onClick={() => toggleClipMeta(clip.id)}
                          className="w-full flex items-center justify-between text-[11px] font-bold text-amber-400 hover:text-amber-300 py-1 transition"
                        >
                          <span>Shorts / Reels Title & Caption</span>
                          {openMetaIds[String(clip.id)] ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {openMetaIds[String(clip.id)] && (() => {
                          const fallbackTitle = `${clip.title.replace(/[_-]+/g, " ")} (${clip.hook_banner})`;
                          const fallbackTags = "#shorts #reels #viral #fyp";
                          const fallbackDesc = `${clip.hook_banner} ??\n${clip.story_arc}\n\n${fallbackTags}`;
                          const fallbackPin = "Wait till the end ?? Rate this 1-10 in the comments!";
                          const meta = clip.social_meta || {
                            post_title: fallbackTitle,
                            description: fallbackDesc,
                            hashtags: fallbackTags,
                            pinned_comment: fallbackPin,
                          };
                          return (
                            <div className="mt-2 space-y-2.5 bg-zinc-950/90 border border-zinc-800 rounded-xl p-2.5 text-[11px]">
                              <div>
                                <div className="flex items-center justify-between text-zinc-400 font-semibold mb-0.5">
                                  <span>Title</span>
                                  <button
                                    type="button"
                                    onClick={() => copyMetaText(`${clip.id}-title`, meta.post_title)}
                                    className="text-amber-400 hover:underline font-bold"
                                  >
                                    {copiedKey === `${clip.id}-title` ? "Copied!" : "Copy"}
                                  </button>
                                </div>
                                <p className="text-zinc-200 bg-zinc-900 px-2 py-1.5 rounded border border-zinc-800/80 select-all">
                                  {meta.post_title}
                                </p>
                              </div>

                              <div>
                                <div className="flex items-center justify-between text-zinc-400 font-semibold mb-0.5">
                                  <span>Description & Tags</span>
                                  <button
                                    type="button"
                                    onClick={() => copyMetaText(`${clip.id}-desc`, meta.description)}
                                    className="text-amber-400 hover:underline font-bold"
                                  >
                                    {copiedKey === `${clip.id}-desc` ? "Copied!" : "Copy"}
                                  </button>
                                </div>
                                <pre className="whitespace-pre-wrap font-sans text-zinc-300 bg-zinc-900 px-2 py-1.5 rounded border border-zinc-800/80 max-h-24 overflow-y-auto select-all">
                                  {meta.description}
                                </pre>
                              </div>

                              <div>
                                <div className="flex items-center justify-between text-zinc-400 font-semibold mb-0.5">
                                  <span>Hashtags</span>
                                  <button
                                    type="button"
                                    onClick={() => copyMetaText(`${clip.id}-tags`, meta.hashtags)}
                                    className="text-amber-400 hover:underline font-bold"
                                  >
                                    {copiedKey === `${clip.id}-tags` ? "Copied!" : "Copy"}
                                  </button>
                                </div>
                                <p className="text-amber-300/90 bg-zinc-900 px-2 py-1 rounded border border-zinc-800/80 select-all">
                                  {meta.hashtags}
                                </p>
                              </div>

                              <div>
                                <div className="flex items-center justify-between text-zinc-400 font-semibold mb-0.5">
                                  <span>Pinned Comment</span>
                                  <button
                                    type="button"
                                    onClick={() => copyMetaText(`${clip.id}-pin`, meta.pinned_comment)}
                                    className="text-amber-400 hover:underline font-bold"
                                  >
                                    {copiedKey === `${clip.id}-pin` ? "Copied!" : "Copy"}
                                  </button>
                                </div>
                                <p className="text-zinc-300 bg-zinc-900 px-2 py-1 rounded border border-zinc-800/80 select-all">
                                  {meta.pinned_comment}
                                </p>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                      <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                          <span className="text-xs font-mono text-zinc-500">
                            {clip.duration}s
                          </span>
                          <div className="flex items-center gap-1.5">
                            {clip.saved_to_cloud || manuallySavedIds[String(clip.id)] ? (
                              <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                <Check className="w-3 h-3" />
                                Saved
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={savingClipId === String(clip.id)}
                                onClick={() => handleSaveClip(clip)}
                                className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-400 transition"
                              >
                                <FolderHeart className="w-3 h-3" />
                                {savingClipId === String(clip.id) ? "Saving..." : "Save"}
                              </button>
                            )}
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
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Complete User Manual Section */}
            <section
              id="user-manual"
              className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 sm:p-8"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black flex items-center gap-2.5">
                    <BookOpen className="w-6 h-6 text-amber-400" />
                    PeakSlicer AI User Manual
                  </h2>
                  <p className="text-xs sm:text-sm text-zinc-400 mt-1">
                    Everything you need to upload MP4 recordings, locate your
                    video files, and connect your own AI API keys.
                  </p>
                </div>

                {/* Manual Topic Switcher */}
                <div className="flex flex-wrap gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setManualTab("upload")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      manualTab === "upload"
                        ? "bg-amber-400 text-zinc-950"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    1. How to Upload MP4
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualTab("find")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      manualTab === "find"
                        ? "bg-amber-400 text-zinc-950"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <FolderSearch className="w-3.5 h-3.5" />
                    2. Where to Find MP4s
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualTab("api")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      manualTab === "api"
                        ? "bg-amber-400 text-zinc-950"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    3. Custom API Setup
                  </button>
                </div>
              </div>

              {/* Tab 1: How to Upload MP4 Files */}
              {manualTab === "upload" && (
                <div className="pt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80">
                    <div className="text-xs font-black text-amber-400 uppercase mb-1">
                      Step 1
                    </div>
                    <h3 className="font-bold text-sm text-zinc-100 mb-1.5">
                      Select Upload MP4
                    </h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Ensure the <strong>Upload MP4</strong> tab is active at the
                      top of the studio, then click the dashed upload box to
                      pick any <code>.mp4</code>, <code>.mov</code>, or{" "}
                      <code>.mkv</code> file from your PC or phone.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80">
                    <div className="text-xs font-black text-amber-400 uppercase mb-1">
                      Step 2
                    </div>
                    <h3 className="font-bold text-sm text-zinc-100 mb-1.5">
                      Add Your AI API Key
                    </h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Paste your personal Gemini, Groq, Claude, or OpenAI key
                      into the <strong>Bring Your Own AI API Key</strong> box
                      so your clips process immediately without shared server
                      rate limits.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80">
                    <div className="text-xs font-black text-amber-400 uppercase mb-1">
                      Step 3
                    </div>
                    <h3 className="font-bold text-sm text-zinc-100 mb-1.5">
                      Choose Pacing & Count
                    </h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Pick <strong>Dynamic Story Jump-Cut</strong> (stitches
                      setup, climax, and payoff under 58s) or{" "}
                      <strong>Single Continuous Clip</strong>, select how many
                      Shorts you want, and click{" "}
                      <strong>Generate Viral Shorts</strong>.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80">
                    <div className="text-xs font-black text-amber-400 uppercase mb-1">
                      Step 4
                    </div>
                    <h3 className="font-bold text-sm text-zinc-100 mb-1.5">
                      Preview & Download
                    </h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Watch the live progress bar reach 100%. Preview each
                      vertical 9:16 Short with burned-in captions right in your
                      browser and click <strong>Download</strong> to save the
                      ready-to-post MP4.
                    </p>
                  </div>
                </div>
              )}

              {/* Tab 2: Where to Find & Export MP4 Files */}
              {manualTab === "find" && (
                <div className="pt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80">
                    <h3 className="font-bold text-sm text-amber-400 mb-1">
                      OBS Studio Recordings
                    </h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Open <code>C:\Users\&lt;YourName&gt;\Videos</code> on
                      Windows or <code>~/Movies</code> on Mac. If OBS saves as{" "}
                      <code>.mkv</code>, go to{" "}
                      <strong>OBS → File → Remux Recordings</strong> to convert
                      it to <code>.mp4</code> in 2 seconds.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80">
                    <h3 className="font-bold text-sm text-amber-400 mb-1">
                      NVIDIA ShadowPlay / GeForce
                    </h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Press <strong>Alt + Z → Gallery</strong>, or open{" "}
                      <code>
                        C:\Users\&lt;YourName&gt;\Videos\&lt;GameName&gt;
                      </code>
                      . Instant Replay and manual recordings are already saved
                      as standard <code>.mp4</code> files.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80">
                    <h3 className="font-bold text-sm text-amber-400 mb-1">
                      Windows Xbox Game Bar
                    </h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Press <strong>Win + G</strong> to open the overlay or
                      navigate directly to{" "}
                      <code>C:\Users\&lt;YourName&gt;\Videos\Captures</code>{" "}
                      where all screen captures are stored in{" "}
                      <code>.mp4</code> format.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80">
                    <h3 className="font-bold text-sm text-amber-400 mb-1">
                      Your Own YouTube Videos
                    </h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Go to <strong>YouTube Studio → Content</strong>, click
                      the <strong>three dots (⋮)</strong> next to any video
                      you uploaded, and click <strong>Download</strong> to get
                      the official clean <code>.mp4</code> file.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80">
                    <h3 className="font-bold text-sm text-amber-400 mb-1">
                      CapCut / Premiere / DaVinci
                    </h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Export your timeline using{" "}
                      <strong>Format: MP4 (H.264)</strong> at{" "}
                      <strong>720p or 1080p</strong>, then upload that exported
                      file directly into PeakSlicer AI to auto-generate multiple
                      captioned Shorts.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80">
                    <h3 className="font-bold text-sm text-amber-400 mb-1">
                      iPhone & Android Recordings
                    </h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Open your phone&apos;s <strong>Photos / Gallery</strong>{" "}
                      or <strong>Files → DCIM / Movies</strong> folder. Both
                      Android <code>.mp4</code> and iPhone <code>.mov</code>{" "}
                      camera/screen recordings are supported natively.
                    </p>
                  </div>
                </div>
              )}

              {/* Tab 3: Custom API Key Setup (BYOK) */}
              {manualTab === "api" && (
                <div className="pt-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80">
                      <div className="text-[11px] font-black uppercase text-emerald-400 mb-1">
                        Free Option #1 (Recommended)
                      </div>
                      <h3 className="font-bold text-sm text-zinc-100 mb-1.5">
                        Google Gemini API Key
                      </h3>
                      <ol className="text-xs text-zinc-400 space-y-1 list-decimal list-inside">
                        <li>
                          Visit{" "}
                          <a
                            href="https://aistudio.google.com/apikey"
                            target="_blank"
                            rel="noreferrer"
                            className="text-amber-400 underline"
                          >
                            aistudio.google.com/apikey
                          </a>
                          .
                        </li>
                        <li>
                          Click <strong>Create API key</strong> and copy the key
                          starting with <code>AIza...</code>.
                        </li>
                        <li>
                          Paste it into the <strong>Your API Key</strong> field
                          above (auto-detected automatically).
                        </li>
                      </ol>
                    </div>

                    <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80">
                      <div className="text-[11px] font-black uppercase text-emerald-400 mb-1">
                        Free Option #2 (Ultra-Fast)
                      </div>
                      <h3 className="font-bold text-sm text-zinc-100 mb-1.5">
                        Groq Cloud API Key
                      </h3>
                      <ol className="text-xs text-zinc-400 space-y-1 list-decimal list-inside">
                        <li>
                          Visit{" "}
                          <a
                            href="https://console.groq.com/keys"
                            target="_blank"
                            rel="noreferrer"
                            className="text-amber-400 underline"
                          >
                            console.groq.com/keys
                          </a>
                          .
                        </li>
                        <li>
                          Click <strong>Create API Key</strong> and copy the key
                          starting with <code>gsk_...</code>.
                        </li>
                        <li>
                          Paste it above—powers both ultra-fast Whisper
                          transcription and Llama 3.3 clip selection.
                        </li>
                      </ol>
                    </div>

                    <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80">
                      <div className="text-[11px] font-black uppercase text-amber-400 mb-1">
                        Any Provider / Local LLM
                      </div>
                      <h3 className="font-bold text-sm text-zinc-100 mb-1.5">
                        Claude, OpenAI, OpenRouter & Custom
                      </h3>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        Paste any <code>sk-ant-...</code> (Claude),{" "}
                        <code>sk-...</code> (OpenAI), or <code>sk-or-...</code>{" "}
                        (OpenRouter) key. For Together, Fireworks, or local
                        Ollama, choose{" "}
                        <strong>Custom OpenAI-Compatible Endpoint</strong> and
                        enter your Base URL + Model Name.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* 3-Tier Pricing Modal (Free / Pro $10 / Pro Max $50 — All BYOK) */}
      {showPricingModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl my-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-black tracking-tight">
                  Choose Your PeakSlicer AI Plan
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Bring your own AI API key on every tier and scale your MP4
                  rendering capacity and cloud storage.
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
                    Test MP4-to-Shorts jump-cuts and word-level captions with
                    your own AI key.
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
                      <span>Up to 4 Shorts per MP4 video</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Bring Your Own AI Key (Gemini, Groq, etc.)</span>
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
                      <span>Up to 8 Shorts per MP4 video</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Bring Your Own AI Key (all providers)</span>
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
                    Maximum rendering throughput and permanent storage for
                    high-volume channels & agencies.
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
                      <span>Up to 10 Shorts per MP4 video</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-orange-400 shrink-0" />
                      <span>Bring Your Own AI Key + Priority Queue</span>
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
                    ? "Sign In to PeakSlicer AI"
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

      {confirmDeleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-base text-zinc-100">
                  {confirmDeleteTarget.type === "folder"
                    ? "Delete Folder?"
                    : "Delete Saved Clip?"}
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {confirmDeleteTarget.type === "folder"
                    ? `Are you sure you want to delete the folder "${confirmDeleteTarget.folderName}"? Your clips inside will stay in All Clips.`
                    : `Are you sure you want to permanently delete "${confirmDeleteTarget.clip.title}"? This cannot be undone.`}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteTarget(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = confirmDeleteTarget;
                  setConfirmDeleteTarget(null);
                  if (target.type === "folder") {
                    await handleDeleteFolder(target.folderName);
                  } else {
                    await handleDeleteSavedClip(target.clip);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-xs transition"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}