import base64
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
    build_fallback_clips,
    clip_bounds,
    download_and_extract,
    pick_viral_clips,
    render_viral_short,
)
from fastapi import FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

if os.path.exists(".env"):
    with open(".env", "r", encoding="utf-8") as _ef:
        for _line in _ef:
            if "=" in _line and not _line.strip().startswith("#"):
                _k, _v = _line.strip().split("=", 1)
                os.environ.setdefault(_k.strip(), _v.strip())

app = FastAPI(title="PeakSlicer AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

JOBS_DIR = "jobs"
os.makedirs(JOBS_DIR, exist_ok=True)
app.mount("/files", StaticFiles(directory=JOBS_DIR), name="files")

if os.environ.get("YOUTUBE_COOKIES_B64"):
    try:
        decoded_cookies = base64.b64decode(os.environ["YOUTUBE_COOKIES_B64"].strip())
        with open("cookies.txt", "wb") as f:
            f.write(decoded_cookies)
    except Exception as _ce:
        print(f"Warning: Failed to decode YOUTUBE_COOKIES_B64: {_ce}")
elif os.environ.get("YT_COOKIES_TXT") and not os.path.exists("cookies.txt"):
    with open("cookies.txt", "w", encoding="utf-8") as f:
        f.write(os.environ["YT_COOKIES_TXT"])

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
LEMONSQUEEZY_WEBHOOK_SECRET = os.environ.get("LEMONSQUEEZY_WEBHOOK_SECRET", "")
LEMONSQUEEZY_PRO_MAX_VARIANT_ID = os.environ.get("LEMONSQUEEZY_PRO_MAX_VARIANT_ID", "")

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
        "max_clips_window": 100,
        "window_hours": 24,
        "max_per_video": 10,
        "backup_days": None,
    },
}

guest_usage: dict[str, tuple[datetime, int]] = {}
quota_lock = threading.Lock()

job_queue = queue.Queue()
jobs = {}
pending_confirmations = {}


class ConfirmRequest(BaseModel):
    proceed: bool


def add_log(job_id: str, message: str):
    if job_id not in jobs:
        return
    ts = datetime.now().strftime("%H:%M:%S")
    safe_msg = re.sub(r"[A-Za-z]:\\[^\s]+|/tmp/[^\s]+|jobs/[a-f0-9]+/", "", message)
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
    data = json.dumps(body).encode("utf-8") if isinstance(body, dict) else body
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
                extra_headers={"Prefer": "return=minimal"},
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
            body={"clips_used_in_window": max(0, new_total)},
            extra_headers={"Prefer": "return=minimal"},
        )
    except Exception as e:
        print(f"Supabase clips_used_in_window update failed for {user_id}: {e}")


def charge_clips(user_id: str | None, client_ip: str | None, clips_to_charge: int) -> bool:
    """Re-deducts clips when user confirms continuing after 0 AI peaks."""
    if clips_to_charge <= 0:
        return True
    with quota_lock:
        if user_id:
            prof = get_normalized_profile(user_id)
            cfg = PLAN_LIMITS[prof["plan"]]
            used = int(prof.get("clips_used_in_window") or 0)
            if cfg["max_clips_window"] - used < clips_to_charge:
                return False
            increment_user_clips(user_id, used + clips_to_charge)
            return True
        elif client_ip:
            cfg = PLAN_LIMITS["free"]
            now = datetime.now(timezone.utc)
            win_start, used = guest_usage.get(client_ip, (now, 0))
            if now - win_start >= timedelta(hours=cfg["window_hours"]):
                win_start, used = now, 0
            if cfg["max_clips_window"] - used < clips_to_charge:
                return False
            guest_usage[client_ip] = (win_start, used + clips_to_charge)
            return True
    return True


def refund_clips(user_id: str | None, client_ip: str | None, clips_to_refund: int):
    if clips_to_refund <= 0:
        return
    with quota_lock:
        if user_id:
            try:
                prof = get_normalized_profile(user_id)
                current_used = int(prof.get("clips_used_in_window") or 0)
                refunded_total = max(0, current_used - clips_to_refund)
                increment_user_clips(user_id, refunded_total)
            except Exception as e:
                print(f"Quota refund failed for user {user_id}: {e}")
        elif client_ip and client_ip in guest_usage:
            win_start, used = guest_usage[client_ip]
            guest_usage[client_ip] = (win_start, max(0, used - clips_to_refund))


def save_clip_to_cloud(
    user_id: str | None,
    plan: str,
    job_id: str,
    local_mp4_path: str,
    filename: str,
    clip_meta: dict,
) -> str | None:
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
        public_url = f"{SUPABASE_URL}/storage/v1/object/public/shorts/{storage_path}"

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
            extra_headers={"Prefer": "return=minimal"},
        )
        return public_url
    except Exception as e:
        print(f"Cloud clip save error: {e}")
        return f"ERROR:{e}"




def build_social_metadata(clip_obj, transcript_segments: list) -> dict:
    """Builds ready-to-post YouTube Shorts / Reels / TikTok title, description, hashtags, and pinned comment."""
    c_start, c_end, _ = clip_bounds(clip_obj)
    spoken_lines = [
        s.get("text", "").strip()
        for s in transcript_segments
        if s.get("end", 0) >= c_start and s.get("start", 0) <= c_end and s.get("text", "").strip()
    ]
    spoken_excerpt = " ".join(spoken_lines)[:220].strip()

    clean_title = re.sub(r"[_-]+", " ", str(clip_obj.title)).strip().title()
    hook = str(clip_obj.hook_banner).strip().upper()
    arc = str(clip_obj.story_arc).strip()

    post_title = f"{clean_title} ({hook})" if hook and hook.lower() not in clean_title.lower() else clean_title
    post_title = post_title[:70]

    words = re.findall(r"[A-Za-z]{4,}", f"{clean_title} {arc}")
    stop = {"this", "that", "with", "from", "have", "what", "when", "your", "they", "them", "just", "like", "into", "highlight", "segment", "moment"}
    kw_tags = []
    for w in words:
        lw = w.lower()
        if lw not in stop and f"#{lw}" not in kw_tags:
            kw_tags.append(f"#{lw}")
        if len(kw_tags) >= 5:
            break

    hashtags = " ".join(["#shorts", "#reels", "#fyp", "#viral"] + kw_tags)
    desc_body = arc if arc else spoken_excerpt
    if spoken_excerpt and spoken_excerpt.lower() not in desc_body.lower():
        desc_body = f"{desc_body}\n\n'{spoken_excerpt}...'"

    description = f"{hook} ??\n{desc_body}\n\nFollow for daily clips!\n\n{hashtags}"
    pinned_comment = f"Wait for the ending ?? Would you have pulled this off? Drop a ?? if you watched till the end!"

    return {
        "post_title": post_title,
        "description": description,
        "hashtags": hashtags,
        "pinned_comment": pinned_comment,
    }


def cleanup_temp_files(*paths):
    for p in paths:
        if p and os.path.exists(p):
            try:
                os.remove(p)
            except Exception:
                pass


def render_selected_clips(
    job_id: str,
    work_dir: str,
    out_dir: str,
    video_path: str,
    audio_path: str,
    data: dict,
    clips: list,
    num_clips: int,
    user_id: str | None,
    user_plan: str,
    client_ip: str | None,
):
    try:
        results = []
        for idx, c in enumerate(clips, 1):
            c_start, c_end, total_dur = clip_bounds(c)
            jobs[job_id]["step"] = f"Rendering Short {idx}/{len(clips)}: {c.hook_banner}"
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
                "social_meta": build_social_metadata(c, data.get("segments", [])),
            }

            add_log(
                job_id,
                f"ffmpeg [{idx}/{len(clips)}]: Exported 540x960 H.264 MP4 (ready to Save or Download).",
            )

            results.append(clip_record)

        if len(results) < num_clips:
            unused = num_clips - len(results)
            refund_clips(user_id, client_ip, unused)
            add_log(job_id, f"quota: Refunded {unused} unused clip credit(s).")

        jobs[job_id]["status"] = "completed"
        jobs[job_id]["step"] = "Done!"
        jobs[job_id]["progress"] = 100
        jobs[job_id]["clips"] = results
        add_log(job_id, "pipeline: All Shorts rendered and ready for download.")

    except Exception as e:
        refund_clips(user_id, client_ip, num_clips)
        clean_err = re.sub(r"\x1b\[[0-9;]*m", "", str(e))
        clean_err = f"{clean_err} (Clip quota automatically refunded)"
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = clean_err
        add_log(job_id, f"quota: Automatically refunded {num_clips} clip(s).")
        add_log(job_id, f"error: {clean_err}")
    finally:
        cleanup_temp_files(video_path, audio_path)


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
    client_ip: str | None,
):
    work_dir = os.path.join(JOBS_DIR, job_id)
    out_dir = os.path.join(work_dir, "shorts")
    os.makedirs(out_dir, exist_ok=True)

    video_path = uploaded_video or os.path.join(work_dir, "source.mp4")
    audio_path = os.path.join(work_dir, "audio.wav")
    meta_path = os.path.join(work_dir, "metadata.json")
    transcript_path = os.path.join(work_dir, "transcript_data.json")
    paused_for_confirmation = False

    try:
        if url:
            jobs[job_id]["step"] = "Downloading video from URL..."
            jobs[job_id]["progress"] = 15
            add_log(job_id, "yt-dlp: Resolving H.264 stream & metadata...")
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
            proc = subprocess.run(
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
                capture_output=True,
                text=True,
            )
            if proc.returncode != 0:
                raise RuntimeError(f"FFmpeg demux failed: {proc.stderr[-300:]}")
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

        if not clips:
            # Refund credits immediately and ask the user whether to continue with Option 2
            refund_clips(user_id, client_ip, num_clips)
            paused_for_confirmation = True
            pending_confirmations[job_id] = {
                "work_dir": work_dir,
                "out_dir": out_dir,
                "video_path": video_path,
                "audio_path": audio_path,
                "data": data,
                "num_clips": num_clips,
                "user_id": user_id,
                "user_plan": user_plan,
                "client_ip": client_ip,
            }
            jobs[job_id]["status"] = "needs_confirmation"
            jobs[job_id]["step"] = "AI found 0 viral peaks — awaiting your confirmation..."
            jobs[job_id]["error"] = (
                "AI Editor could not detect standout viral peaks in this video "
                "(0 credits charged). Do you wish to continue with auto-selected "
                "highlight slices anyway?"
            )
            add_log(
                job_id,
                f"quota: Refunded {num_clips} clip(s) while awaiting user confirmation.",
            )
            add_log(
                job_id,
                "prompt: Waiting for user to choose Continue (Option 2) or Cancel.",
            )
            return

        add_log(job_id, f"llm: Selected {len(clips)} distinct high-retention clips.")
        render_selected_clips(
            job_id=job_id,
            work_dir=work_dir,
            out_dir=out_dir,
            video_path=video_path,
            audio_path=audio_path,
            data=data,
            clips=clips,
            num_clips=num_clips,
            user_id=user_id,
            user_plan=user_plan,
            client_ip=client_ip,
        )

    except Exception as e:
        refund_clips(user_id, client_ip, num_clips)
        clean_err = re.sub(r"\x1b\[[0-9;]*m", "", str(e))
        if "Sign in to confirm" in clean_err or "bot" in clean_err.lower():
            clean_err = (
                "YouTube temporarily blocked automated fetching for this link. Switch"
                " to the 'Upload MP4' tab above for 100% reliable clipping."
            )
        elif any(k in clean_err.lower() for k in ["429", "rate limit", "resource_exhausted", "quota", "busy", "overloaded", "api key", "unauthorized", "401", "403"]):
            clean_err = (
                "API_BUSY: Our shared AI server is currently busy or rate-limited. "
                "Add your own free Google Gemini or Groq API key to continue instantly."
            )
        clean_err = f"{clean_err} (Clip quota automatically refunded)"
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = clean_err
        add_log(job_id, f"quota: Automatically refunded {num_clips} clip(s).")
        add_log(job_id, f"error: {clean_err}")
    finally:
        if not paused_for_confirmation:
            cleanup_temp_files(video_path, audio_path)


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
            client_ip,
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
            client_ip,
        )
        job_queue.task_done()


threading.Thread(target=worker_loop, daemon=True).start()


@app.post("/api/confirm/{job_id}")
def confirm_fallback_generation(job_id: str, body: ConfirmRequest):
    if job_id not in jobs or job_id not in pending_confirmations:
        raise HTTPException(
            status_code=404, detail="Job not found or already resolved."
        )

    ctx = pending_confirmations.pop(job_id)

    if not body.proceed:
        cleanup_temp_files(ctx["video_path"], ctx["audio_path"])
        jobs[job_id]["status"] = "cancelled"
        jobs[job_id]["step"] = "Stopped — 0 credits charged."
        jobs[job_id]["error"] = None
        add_log(job_id, "cancelled: User chose No — stopped with 0 credits charged.")
        return {"status": "cancelled"}

    fallback_clips = build_fallback_clips(ctx["data"], num_clips=ctx["num_clips"])
    if not fallback_clips:
        cleanup_temp_files(ctx["video_path"], ctx["audio_path"])
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = "Video is too short to generate highlight slices (0 credits charged)."
        return {"status": "failed"}

    clips_to_charge = len(fallback_clips)
    if not charge_clips(ctx["user_id"], ctx["client_ip"], clips_to_charge):
        cleanup_temp_files(ctx["video_path"], ctx["audio_path"])
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = "Insufficient clip credits remaining to continue."
        raise HTTPException(status_code=402, detail="Insufficient clip credits remaining.")

    jobs[job_id]["status"] = "processing"
    jobs[job_id]["error"] = None
    jobs[job_id]["step"] = "Continuing with Option 2: Auto-selected highlight slices..."
    add_log(
        job_id,
        f"confirm: User chose Yes — charged {clips_to_charge} clip(s) and rendering {clips_to_charge} highlight slice(s).",
    )

    threading.Thread(
        target=render_selected_clips,
        kwargs={
            "job_id": job_id,
            "work_dir": ctx["work_dir"],
            "out_dir": ctx["out_dir"],
            "video_path": ctx["video_path"],
            "audio_path": ctx["audio_path"],
            "data": ctx["data"],
            "clips": fallback_clips,
            "num_clips": clips_to_charge,
            "user_id": ctx["user_id"],
            "user_plan": ctx["user_plan"],
            "client_ip": ctx["client_ip"],
        },
        daemon=True,
    ).start()

    return {"status": "processing"}


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
    client_ip = (
        request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (request.client.host if request.client else "unknown")
    )

    with quota_lock:
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
        client_ip,
    ))
    return {"job_id": job_id}


@app.get("/api/status/{job_id}")
def get_job_status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs[job_id]


@app.post("/api/save-clip")
async def manual_save_clip(
    request: Request,
    authorization: str | None = Header(default=None),
):
    user = verify_supabase_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Sign in first to save clips to your library.")
    body = await request.json()
    user_id = user["id"]
    prof = get_normalized_profile(user_id)
    user_plan = prof["plan"]

    job_id = str(body.get("job_id") or "manual")
    video_url = str(body.get("video_url") or "")
    if video_url.startswith("http"):
        return {"ok": True, "video_url": video_url, "already_saved": True}

    rel_path = video_url.lstrip("/")
    if rel_path.startswith("files/"):
        local_mp4 = os.path.join(JOBS_DIR, rel_path[len("files/"):])
    else:
        raise HTTPException(status_code=400, detail="Invalid clip file path.")

    if not os.path.exists(local_mp4):
        raise HTTPException(status_code=404, detail="Local clip file expired; please re-generate while signed in.")

    filename = os.path.basename(local_mp4)
    res_url = save_clip_to_cloud(
        user_id=user_id,
        plan=user_plan,
        job_id=job_id,
        local_mp4_path=local_mp4,
        filename=filename,
        clip_meta={
            "hook_banner": body.get("hook_banner", "VIRAL SHORT"),
            "title": body.get("title", "short_clip"),
            "story_arc": body.get("story_arc", ""),
            "cuts": int(body.get("cuts") or 1),
            "duration": float(body.get("duration") or 0),
        },
    )
    if not res_url or str(res_url).startswith("ERROR:"):
        raise HTTPException(status_code=500, detail=f"Could not save to cloud: {res_url}")
    return {"ok": True, "video_url": res_url}


@app.get("/api/my-clips")
def get_user_saved_clips(authorization: str | None = Header(default=None)):
    user = verify_supabase_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Sign in to view saved clips.")
    user_id = user["id"]
    prof = get_normalized_profile(user_id)
    cfg = PLAN_LIMITS[prof["plan"]]
    remaining = max(0, cfg["max_clips_window"] - prof["clips_used_in_window"])

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
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
            extra_headers={"Prefer": "return=minimal"},
        )
    elif user_id and event_name in ("subscription_expired", "subscription_cancelled"):
        _supabase_request(
            f"/rest/v1/profiles?id=eq.{user_id}",
            method="PATCH",
            body={"plan": "free", "clips_used_in_window": 0},
            extra_headers={"Prefer": "return=minimal"},
        )

    return {"ok": True}
