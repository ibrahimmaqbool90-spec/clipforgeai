from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
import os
import queue
import re
import shutil
import subprocess
import threading
import urllib.request
import uuid
from clip import (
    analyze_audio_and_transcribe,
    build_capcut_ass,
    clip_bounds,
    download_and_extract,
    pick_viral_clips,
    render_viral_short,
)
from fastapi import FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Load local .env file automatically if present
if os.path.exists(".env"):
  with open(".env", "r", encoding="utf-8") as _ef:
    for _line in _ef:
      if "=" in _line and not _line.strip().startswith("#"):
        _k, _v = _line.strip().split("=", 1)
        os.environ.setdefault(_k.strip(), _v.strip())

app = FastAPI(title="ClipForge AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Lock to your Vercel/Next.js domain in production
    allow_methods=["*"],
    allow_headers=["*"],
)

JOBS_DIR = "jobs"
os.makedirs(JOBS_DIR, exist_ok=True)
app.mount("/files", StaticFiles(directory=JOBS_DIR), name="files")

if os.environ.get("YT_COOKIES_TXT") and not os.path.exists("cookies.txt"):
  with open("cookies.txt", "w", encoding="utf-8") as f:
    f.write(os.environ["YT_COOKIES_TXT"])

# Supabase & Lemon Squeezy SaaS configuration
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
LEMONSQUEEZY_WEBHOOK_SECRET = os.environ.get("LEMONSQUEEZY_WEBHOOK_SECRET", "")
LEMONSQUEEZY_PRO_MAX_VARIANT_ID = os.environ.get(
    "LEMONSQUEEZY_PRO_MAX_VARIANT_ID", ""
)

# 3-Tier Plan Configuration (Applies regardless of BYOK)
PLAN_LIMITS = {
    "free": {
        "label": "Free",
        "max_clips_window": 4,
        "window_hours": 48,
        "max_per_video": 4,
        "backup_days": 7,
    },
    "pro": {
        "label": "Pro ($10/mo)",
        "max_clips_window": 20,
        "window_hours": 24,
        "max_per_video": 8,
        "backup_days": 30,
    },
    "pro_max": {
        "label": "Pro Max ($50/mo)",
        "max_clips_window": 100,  # Fair-use daily safeguard for "Unlimited"
        "window_hours": 24,
        "max_per_video": 10,
        "backup_days": None,  # Permanent cloud vault
    },
}

# Guest IP rolling usage tracker: ip -> (window_start_utc, clips_used)
guest_usage: dict[str, tuple[datetime, int]] = {}

job_queue = queue.Queue()
jobs = {}


def add_log(job_id: str, message: str):
  if job_id not in jobs:
    return
  ts = datetime.now().strftime("%H:%M:%S")
  safe_msg = re.sub(
      r"[A-Za-z]:\\[^\s]+|/tmp/[^\s]+|jobs/[a-f0-9]+/", "", message
  )
  jobs[job_id]["logs"].append(f"[{ts}] {safe_msg}")
  if len(jobs[job_id]["logs"]) > 60:
    jobs[job_id]["logs"] = jobs[job_id]["logs"][-60:]


def _supabase_request(
    path: str,
    method: str = "GET",
    body: bytes | dict | None = None,
    content_type: str = "application/json",
    extra_headers: dict | None = None,
):
  if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    return None
  headers = {
      "apikey": SUPABASE_SERVICE_KEY,
      "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
      "Content-Type": content_type,
  }
  if extra_headers:
    headers.update(extra_headers)
  data = (
      json.dumps(body).encode("utf-8") if isinstance(body, dict) else body
  )
  req = urllib.request.Request(
      f"{SUPABASE_URL}{path}", data=data, headers=headers, method=method
  )
  with urllib.request.urlopen(req, timeout=20) as resp:
    raw = resp.read().decode("utf-8")
    return json.loads(raw) if raw else {}


def verify_supabase_user(auth_header: str | None) -> dict | None:
  if not auth_header or not auth_header.startswith("Bearer "):
    return None
  if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    return None
  token = auth_header.split(" ", 1)[1].strip()
  try:
    req = urllib.request.Request(
        f"{SUPABASE_URL}/auth/v1/user",
        headers={
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {token}",
        },
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
      return json.loads(resp.read().decode("utf-8"))
  except Exception:
    return None


def get_normalized_profile(user_id: str) -> dict:
  """Returns profile with rolling window reset if window_hours has elapsed."""
  now = datetime.now(timezone.utc)
  default_prof = {
      "id": user_id,
      "plan": "free",
      "clips_used_in_window": 0,
      "window_started_at": now.isoformat(),
  }
  if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    return default_prof
  try:
    rows = _supabase_request(
        f"/rest/v1/profiles?id=eq.{user_id}&select=id,plan,clips_used_in_window,window_started_at"
    )
    if not rows:
      return default_prof
    prof = rows[0]
    plan = prof.get("plan") if prof.get("plan") in PLAN_LIMITS else "free"
    cfg = PLAN_LIMITS[plan]
    win_start_raw = prof.get("window_started_at")
    win_start = (
        datetime.fromisoformat(win_start_raw.replace("Z", "+00:00"))
        if win_start_raw
        else now
    )
    if now - win_start >= timedelta(hours=cfg["window_hours"]):
      prof["clips_used_in_window"] = 0
      prof["window_started_at"] = now.isoformat()
      _supabase_request(
          f"/rest/v1/profiles?id=eq.{user_id}",
          method="PATCH",
          body={
              "clips_used_in_window": 0,
              "window_started_at": now.isoformat(),
          },
      )
    prof["plan"] = plan
    return prof
  except Exception:
    return default_prof


def increment_user_clips(user_id: str, new_total: int):
  if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    return
  try:
    _supabase_request(
        f"/rest/v1/profiles?id=eq.{user_id}",
        method="PATCH",
        body={"clips_used_in_window": new_total},
    )
  except Exception:
    pass


def save_clip_to_cloud(
    user_id: str | None,
    plan: str,
    job_id: str,
    local_mp4_path: str,
    filename: str,
    clip_meta: dict,
) -> str | None:
  """Uploads MP4 to Supabase Storage bucket 'shorts' and sets expires_at based on plan."""
  if not user_id or not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    return None
  try:
    storage_path = f"{user_id}/{job_id}/{filename}"
    with open(local_mp4_path, "rb") as f:
      mp4_bytes = f.read()

    _supabase_request(
        f"/storage/v1/object/shorts/{storage_path}",
        method="POST",
        body=mp4_bytes,
        content_type="video/mp4",
        extra_headers={"x-upsert": "true"},
    )
    public_url = (
        f"{SUPABASE_URL}/storage/v1/object/public/shorts/{storage_path}"
    )

    backup_days = PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])["backup_days"]
    expires_at = (
        (datetime.now(timezone.utc) + timedelta(days=backup_days)).isoformat()
        if backup_days is not None
        else None
    )

    _supabase_request(
        "/rest/v1/saved_clips",
        method="POST",
        body={
            "user_id": user_id,
            "hook_banner": clip_meta["hook_banner"],
            "title": clip_meta["title"],
            "story_arc": clip_meta["story_arc"],
            "cuts": clip_meta["cuts"],
            "duration": clip_meta["duration"],
            "video_url": public_url,
            "expires_at": expires_at,
        },
    )
    return public_url
  except Exception as e:
    print(f"Cloud clip save skipped ({e})")
    return None


def process_job(
    job_id: str,
    url: str | None,
    uploaded_video: str | None,
    num_clips: int,
    dynamic_mode: bool,
    user_provider: str,
    user_api_key: str,
    custom_base_url: str,
    custom_model: str,
    user_id: str | None,
    user_plan: str,
):
  work_dir = os.path.join(JOBS_DIR, job_id)
  out_dir = os.path.join(work_dir, "shorts")
  os.makedirs(out_dir, exist_ok=True)

  video_path = uploaded_video or os.path.join(work_dir, "source.mp4")
  audio_path = os.path.join(work_dir, "audio.wav")
  meta_path = os.path.join(work_dir, "metadata.json")
  transcript_path = os.path.join(work_dir, "transcript_data.json")

  try:
    if url:
      jobs[job_id]["step"] = "Downloading video from URL..."
      jobs[job_id]["progress"] = 15
      add_log(job_id, "yt-dlp: Resolving 1080p H.264 stream & metadata...")
      download_and_extract(
          url,
          video_path=video_path,
          audio_path=audio_path,
          meta_path=meta_path,
      )
      add_log(job_id, "ffmpeg: Extracted 16kHz mono PCM audio track.")
    else:
      jobs[job_id]["step"] = "Extracting audio from uploaded file..."
      jobs[job_id]["progress"] = 20
      add_log(job_id, "ffmpeg: Demuxing uploaded MP4 audio stream...")
      subprocess.run(
          [
              "ffmpeg",
              "-y",
              "-i",
              video_path,
              "-vn",
              "-acodec",
              "pcm_s16le",
              "-ar",
              "16000",
              "-ac",
              "1",
              audio_path,
          ],
          stdout=subprocess.DEVNULL,
          stderr=subprocess.DEVNULL,
          check=True,
      )
      add_log(job_id, "ffmpeg: Audio extraction complete.")

    jobs[job_id]["step"] = "Scanning gameplay peaks & transcribing speech..."
    jobs[job_id]["progress"] = 45
    add_log(
        job_id,
        "scan: Running keyframe scene-change & RMS audio spike analysis...",
    )
    data = analyze_audio_and_transcribe(
        video_path=video_path,
        audio_path=audio_path,
        meta_path=meta_path,
        out_json=transcript_path,
        user_provider=user_provider,
        user_api_key=user_api_key,
    )
    add_log(
        job_id,
        f"whisper: Transcribed {len(data.get('segments', []))} speech segments"
        f" | Found {len(data.get('spikes', {}))} audio peaks.",
    )

    mode_label = (
        "Dynamic Story Jump-Cuts" if dynamic_mode else "Single Continuous Clips"
    )
    jobs[job_id]["step"] = f"AI Editor mapping {mode_label}..."
    jobs[job_id]["progress"] = 65
    add_log(job_id, f"llm: Mapping viral story arcs ({mode_label})...")
    clips = pick_viral_clips(
        data,
        num_clips=num_clips,
        dynamic_mode=dynamic_mode,
        user_provider=user_provider,
        user_api_key=user_api_key,
        custom_base_url=custom_base_url,
        custom_model=custom_model,
    )
    add_log(job_id, f"llm: Selected {len(clips)} distinct high-retention clips.")

    results = []
    for idx, c in enumerate(clips, 1):
      c_start, c_end, total_dur = clip_bounds(c)
      jobs[job_id][
          "step"
      ] = f"Rendering Short {idx}/{len(clips)}: {c.hook_banner}"
      jobs[job_id]["progress"] = 65 + int((idx / max(1, len(clips))) * 30)
      add_log(
          job_id,
          f"ffmpeg [{idx}/{len(clips)}]: Stitching {len(c.segments)} cut(s)"
          f" ({total_dur}s) + burning ASS captions -> {c.hook_banner}",
      )

      safe_name = re.sub(r"[^a-zA-Z0-9_-]", "_", c.title)[:30]
      ass_file = os.path.join(work_dir, f"temp_{idx}.ass")
      filename = f"{idx}_{safe_name}.mp4"
      out_file = os.path.join(out_dir, filename)

      build_capcut_ass(data["segments"], c.segments, c.hook_banner, ass_file)
      render_viral_short(video_path, c.segments, ass_file, out_file)
      if os.path.exists(ass_file):
        os.remove(ass_file)

      clip_record = {
          "id": idx,
          "hook_banner": c.hook_banner,
          "title": c.title,
          "story_arc": c.story_arc,
          "cuts": len(c.segments),
          "start": c_start,
          "end": c_end,
          "duration": total_dur,
          "video_url": f"/files/{job_id}/shorts/{filename}",
      }

      cloud_url = save_clip_to_cloud(
          user_id, user_plan, job_id, out_file, filename, clip_record
      )
      if cloud_url:
        clip_record["video_url"] = cloud_url
        clip_record["saved_to_cloud"] = True
        retention = (
            "permanently"
            if PLAN_LIMITS[user_plan]["backup_days"] is None
            else f"for {PLAN_LIMITS[user_plan]['backup_days']} days"
        )
        add_log(
            job_id,
            f"cloud [{idx}/{len(clips)}]: Backed up {retention} in user library.",
        )
      else:
        add_log(
            job_id,
            f"ffmpeg [{idx}/{len(clips)}]: Exported 1080x1920 H.264 MP4.",
        )

      results.append(clip_record)

    jobs[job_id]["status"] = "completed"
    jobs[job_id]["step"] = "Done!"
    jobs[job_id]["progress"] = 100
    jobs[job_id]["clips"] = results
    add_log(job_id, "pipeline: All Shorts rendered and ready for download.")

  except Exception as e:
    clean_err = re.sub(r"\x1b\[[0-9;]*m", "", str(e))
    if "Sign in to confirm" in clean_err or "bot" in clean_err.lower():
      clean_err = (
          "YouTube temporarily blocked automated fetching for this link. Switch"
          " to the 'Upload MP4' tab above for 100% reliable clipping."
      )
    jobs[job_id]["status"] = "failed"
    jobs[job_id]["error"] = clean_err
    add_log(job_id, f"error: {clean_err}")
  finally:
    for heavy_file in [video_path, audio_path]:
      if heavy_file and os.path.exists(heavy_file):
        os.remove(heavy_file)


def worker_loop():
  while True:
    (
        job_id,
        url,
        uploaded_video,
        num_clips,
        dynamic_mode,
        user_provider,
        user_api_key,
        custom_base_url,
        custom_model,
        user_id,
        user_plan,
    ) = job_queue.get()
    jobs[job_id]["status"] = "processing"
    process_job(
        job_id,
        url,
        uploaded_video,
        num_clips,
        dynamic_mode,
        user_provider,
        user_api_key,
        custom_base_url,
        custom_model,
        user_id,
        user_plan,
    )
    job_queue.task_done()


threading.Thread(target=worker_loop, daemon=True).start()


@app.post("/api/clip")
async def create_clip_job(
    request: Request,
    authorization: str | None = Header(default=None),
    url: str = Form(default=""),
    num_clips: int = Form(default=4),
    dynamic_mode: bool = Form(default=True),
    user_provider: str = Form(default="auto"),
    user_api_key: str = Form(default=""),
    custom_base_url: str = Form(default=""),
    custom_model: str = Form(default=""),
    file: UploadFile | None = File(default=None),
):
  if not url.strip() and not file:
    raise HTTPException(
        status_code=400, detail="Provide a YouTube URL or upload an MP4 file."
    )

  user = verify_supabase_user(authorization)
  user_id = user.get("id") if user else None
  user_plan = "free"

  # Strictly enforce tier clip quotas regardless of whether BYOK is used
  if user_id:
    prof = get_normalized_profile(user_id)
    user_plan = prof["plan"]
    cfg = PLAN_LIMITS[user_plan]
    requested_clips = min(max(num_clips, 1), cfg["max_per_video"])

    used = int(prof.get("clips_used_in_window") or 0)
    remaining = cfg["max_clips_window"] - used
    if remaining <= 0:
      raise HTTPException(
          status_code=402,
          detail=(
              f"{cfg['label']} limit reached ({cfg['max_clips_window']}"
              f" clips per {cfg['window_hours']}h). Upgrade your plan to"
              " continue!"
          ),
      )
    requested_clips = min(requested_clips, remaining)
    increment_user_clips(user_id, used + requested_clips)
  else:
    cfg = PLAN_LIMITS["free"]
    requested_clips = min(max(num_clips, 1), cfg["max_per_video"])

    client_ip = (
        request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (request.client.host if request.client else "unknown")
    )
    now = datetime.now(timezone.utc)
    win_start, used = guest_usage.get(client_ip, (now, 0))
    if now - win_start >= timedelta(hours=cfg["window_hours"]):
      win_start, used = now, 0
    remaining = cfg["max_clips_window"] - used
    if remaining <= 0:
      raise HTTPException(
          status_code=429,
          detail=(
              "Free tier limit reached (4 clips every 48 hours). Upgrade to"
              " Pro ($10/mo) or Pro Max ($50/mo) to generate more!"
          ),
      )
    requested_clips = min(requested_clips, remaining)
    guest_usage[client_ip] = (win_start, used + requested_clips)

  job_id = uuid.uuid4().hex[:10]
  work_dir = os.path.join(JOBS_DIR, job_id)
  os.makedirs(work_dir, exist_ok=True)

  uploaded_path = None
  if file and file.filename:
    uploaded_path = os.path.join(work_dir, "uploaded_source.mp4")
    with open(uploaded_path, "wb") as f:
      shutil.copyfileobj(file.file, f)

  q_pos = job_queue.qsize() + 1
  jobs[job_id] = {
      "job_id": job_id,
      "status": "queued",
      "step": f"Queued (Position #{q_pos})...",
      "progress": 5,
      "logs": [
          f"[{datetime.now().strftime('%H:%M:%S')}] queue: Job #{job_id}"
          f" queued ({requested_clips} clip(s), {user_plan.upper()} tier)."
      ],
      "clips": [],
      "error": None,
  }
  job_queue.put((
      job_id,
      url.strip() or None,
      uploaded_path,
      requested_clips,
      dynamic_mode,
      user_provider.strip(),
      user_api_key.strip(),
      custom_base_url.strip(),
      custom_model.strip(),
      user_id,
      user_plan,
  ))
  return {"job_id": job_id}


@app.get("/api/status/{job_id}")
def get_job_status(job_id: str):
  if job_id not in jobs:
    raise HTTPException(status_code=404, detail="Job not found")
  return jobs[job_id]


@app.get("/api/my-clips")
def get_user_saved_clips(authorization: str | None = Header(default=None)):
  """Fetches active non-expired saved Shorts + plan quota stats for the signed-in user."""
  user = verify_supabase_user(authorization)
  if not user:
    raise HTTPException(status_code=401, detail="Sign in to view saved clips.")
  user_id = user["id"]
  prof = get_normalized_profile(user_id)
  cfg = PLAN_LIMITS[prof["plan"]]
  remaining = max(0, cfg["max_clips_window"] - prof["clips_used_in_window"])

  now_iso = datetime.now(timezone.utc).isoformat()
  clips = (
      _supabase_request(
          f"/rest/v1/saved_clips?user_id=eq.{user_id}"
          f"&or=(expires_at.is.null,expires_at.gt.{now_iso})"
          "&order=created_at.desc"
      )
      or []
  )
  return {
      "profile": {
          "plan": prof["plan"],
          "clips_remaining": remaining,
          "window_hours": cfg["window_hours"],
          "max_clips_window": cfg["max_clips_window"],
          "backup_days": cfg["backup_days"],
      },
      "clips": clips,
  }


@app.post("/api/webhooks/lemonsqueezy")
async def lemonsqueezy_webhook(request: Request):
  """Upgrades user to Pro ($10/mo) or Pro Max ($50/mo) when Lemon Squeezy payment succeeds."""
  raw_body = await request.body()
  signature = request.headers.get("X-Signature", "")
  if LEMONSQUEEZY_WEBHOOK_SECRET:
    digest = hmac.new(
        LEMONSQUEEZY_WEBHOOK_SECRET.encode("utf-8"), raw_body, hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(digest, signature):
      raise HTTPException(status_code=401, detail="Invalid webhook signature")

  payload = json.loads(raw_body.decode("utf-8"))
  event_name = payload.get("meta", {}).get("event_name", "")
  custom_data = payload.get("meta", {}).get("custom_data") or {}
  user_id = custom_data.get("user_id")
  attrs = payload.get("data", {}).get("attributes") or {}
  variant_id = str(attrs.get("variant_id", ""))
  variant_name = str(attrs.get("variant_name", "")).lower()

  target_plan = custom_data.get("plan")
  if target_plan not in ("pro", "pro_max"):
    if (
        LEMONSQUEEZY_PRO_MAX_VARIANT_ID
        and variant_id == LEMONSQUEEZY_PRO_MAX_VARIANT_ID
    ) or "max" in variant_name:
      target_plan = "pro_max"
    else:
      target_plan = "pro"

  if user_id and event_name in (
      "order_created",
      "subscription_created",
      "subscription_payment_success",
  ):
    sub_id = str(payload.get("data", {}).get("id", ""))
    _supabase_request(
        f"/rest/v1/profiles?id=eq.{user_id}",
        method="PATCH",
        body={
            "plan": target_plan,
            "clips_used_in_window": 0,
            "window_started_at": datetime.now(timezone.utc).isoformat(),
            "subscription_id": sub_id,
        },
    )
  elif user_id and event_name in ("subscription_expired", "subscription_cancelled"):
    _supabase_request(
        f"/rest/v1/profiles?id=eq.{user_id}",
        method="PATCH",
        body={"plan": "free", "clips_used_in_window": 0},
    )

  return {"ok": True}