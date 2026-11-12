import json
import os
import re
import subprocess
import sys
import time
import urllib.request
import wave
import cv2
from faster_whisper import WhisperModel
from google import genai
import numpy as np
from openai import OpenAI
from pydantic import BaseModel, Field
import yt_dlp

# Server Fallback API Keys (Reads from environment variables in cloud, defaults to your keys locally)
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
PROVIDER_CONFIGS = {
    "gemini": {
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "model": "gemini-3.8-flash",
    },
    "claude": {
        "base_url": "https://api.anthropic.com/v1/messages",
        "model": "claude-sonnet-4-5",
    },
    "groq": {
        "base_url": "https://api.groq.com/openai/v1",
        "model": "llama-3.3-70b-versatile",
    },
    "openrouter": {
        "base_url": "https://openrouter.ai/api/v1",
        "model": "openrouter/free",
    },
    "openai": {
        "base_url": "https://api.openai.com/v1",
        "model": "gpt-4o-mini",
    },
    "deepseek": {
        "base_url": "https://api.deepseek.com",
        "model": "deepseek-chat",
    },
}


def resolve_user_llm(
    provider: str,
    api_key: str,
    custom_base_url: str = "",
    custom_model: str = "",
):
  """Normalizes any user API key + provider into (resolved_provider, base_url, api_key, model)."""
  key = (api_key or "").strip()
  prov = (provider or "auto").strip().lower()
  if not key and prov != "custom":
    return None

  if prov == "auto":
    if key.startswith("AIza"):
      prov = "gemini"
    elif key.startswith("sk-ant-"):
      prov = "claude"
    elif key.startswith("gsk_"):
      prov = "groq"
    elif key.startswith("sk-or-"):
      prov = "openrouter"
    elif key.startswith("sk-"):
      prov = "openai"
    else:
      prov = "openrouter"

  if prov == "custom":
    if not custom_base_url.strip():
      return None
    return (
        "custom",
        custom_base_url.strip(),
        key or "not-needed",
        custom_model.strip() or "gpt-4o-mini",
    )

  cfg = PROVIDER_CONFIGS.get(prov, PROVIDER_CONFIGS["openrouter"])
  return (
      prov,
      custom_base_url.strip() or cfg["base_url"],
      key,
      custom_model.strip() or cfg["model"],
  )


class TimeSegment(BaseModel):
  start: float = Field(description="Exact start timestamp in seconds")
  end: float = Field(description="Exact end timestamp in seconds")


class ViralClip(BaseModel):
  hook_banner: str = Field(
      description=(
          "3-5 word uppercase curiosity hook WITHOUT spoiling the ending or"
          " winner"
      )
  )
  title: str = Field(description="Clean filename-safe title")
  story_arc: str = Field(
      description=(
          "Briefly state: (1) Opening stakes/setup, (2) Climax, (3) Final"
          " winner/payoff"
      )
  )
  segments: list[TimeSegment] = Field(
      description=(
          "Ordered chronological sub-segments stitched together to form this"
          " Short (combined duration 18 to 58 seconds)"
      )
  )


class ClipList(BaseModel):
  clips: list[ViralClip]


def download_and_extract(
    url,
    video_path="source.mp4",
    audio_path="audio.wav",
    meta_path="metadata.json",
):
  if os.path.exists(video_path):
    os.remove(video_path)

  print("[1/4] Downloading video & extracting metadata...")
  ydl_opts = {
      "format": (
          "bestvideo[height<=1080][vcodec^=avc1]+bestaudio[ext=m4a]/"
          "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best"
      ),
      "outtmpl": video_path,
      "merge_output_format": "mp4",
      "remote_components": ["ejs:github"],
      "extractor_args": {
          "youtube": {
              "player_client": ["web_creator", "tv", "web"],
          }
      },
  }

  if os.path.exists("cookies.txt"):
    print("   Loaded cookies.txt for authenticated download...")
    ydl_opts["cookiefile"] = "cookies.txt"

  if os.environ.get("YT_PROXY_URL"):
    ydl_opts["proxy"] = os.environ["YT_PROXY_URL"]

  with yt_dlp.YoutubeDL(ydl_opts) as ydl:
    info = ydl.extract_info(url, download=True)

  meta = {
      "title": info.get("title", ""),
      "uploader": info.get("uploader", ""),
      "tags": (info.get("tags") or [])[:15],
  }
  with open(meta_path, "w", encoding="utf-8") as f:
    json.dump(meta, f, indent=2)

  print("[2/4] Extracting 16kHz mono audio...")
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
  return meta


def detect_visual_action_peaks(video_path):
  """Keyframe-only FFmpeg scene scan (< 1 second even on 60-minute 1080p60 videos)."""
  try:
    cmd = [
        "ffmpeg",
        "-skip_frame",
        "nokey",
        "-i",
        video_path,
        "-vf",
        "select='gt(scene,0.32)',showinfo",
        "-vsync",
        "vfr",
        "-f",
        "null",
        "-",
    ]
    res = subprocess.run(
        cmd, stderr=subprocess.PIPE, stdout=subprocess.DEVNULL, text=True
    )
    peaks = set()
    for match in re.finditer(r"pts_time:([0-9.]+)", res.stderr):
      peaks.add(int(float(match.group(1))))
    return peaks
  except Exception:
    return set()


def analyze_audio_and_transcribe(
    video_path="source.mp4",
    audio_path="audio.wav",
    meta_path="metadata.json",
    out_json="transcript_data.json",
    user_provider="auto",
    user_api_key="",
):
  resolved = resolve_user_llm(user_provider, user_api_key)
  active_groq = (
      resolved[2] if (resolved and resolved[0] == "groq") else GROQ_API_KEY
  )

  print("[3/4] Step A: Fast scanning audio & keyframe scene peaks...")
  meta = {}
  if os.path.exists(meta_path):
    with open(meta_path, "r", encoding="utf-8") as f:
      meta = json.load(f)

  tags_str = ", ".join(meta.get("tags", []))
  dynamic_prompt = (
      f"{meta.get('uploader', '')} - {meta.get('title', '')}. {tags_str}".strip(
          " -."
      )
  )

  with wave.open(audio_path, "rb") as wf:
    rate = wf.getframerate()
    frames = wf.readframes(wf.getnframes())
    samples = np.frombuffer(frames, dtype=np.int16).astype(np.float32)

  total_sec = len(samples) / rate
  chunk = int(rate * 1.5)
  rms_list = [
      (i / rate, float(np.sqrt(np.mean(samples[i : i + chunk] ** 2))))
      for i in range(0, len(samples), chunk)
      if len(samples[i : i + chunk]) > 0
  ]

  spikes = {}
  if rms_list:
    p75 = np.percentile([r[1] for r in rms_list], 75)
    for idx in range(3, len(rms_list)):
      t, cur = rms_list[idx]
      if t < 15 or t > total_sec - 15:
        continue
      baseline = (
          np.mean(
              [rms_list[idx - 1][1], rms_list[idx - 2][1], rms_list[idx - 3][1]]
          )
          + 1.0
      )
      if cur / baseline > 1.75 and cur > p75:
        spikes[int(t)] = round(cur / baseline, 2)

  action_peaks = sorted(detect_visual_action_peaks(video_path))
  print(
      f"   Found {len(spikes)} audio spikes & {len(action_peaks)} scene action"
      " peaks."
  )

  data = {
      "meta": meta,
      "spikes": spikes,
      "action_peaks": action_peaks,
      "segments": [],
  }

  # FAST PATH: Groq Cloud Whisper (whisper-large-v3-turbo) -> ~3s for a 30-min video
  if active_groq:
    mp3_path = audio_path + ".mp3"
    try:
      print("[3/4] Step B: Transcribing via Groq Cloud Whisper (ultra-fast)...")
      subprocess.run(
          [
              "ffmpeg",
              "-y",
              "-i",
              audio_path,
              "-ar",
              "16000",
              "-ac",
              "1",
              "-b:a",
              "32k",
              mp3_path,
          ],
          stdout=subprocess.DEVNULL,
          stderr=subprocess.DEVNULL,
          check=True,
      )
      if os.path.getsize(mp3_path) < 24 * 1024 * 1024:
        g_client = OpenAI(
            base_url="https://api.groq.com/openai/v1", api_key=active_groq
        )
        with open(mp3_path, "rb") as af:
          tr = g_client.audio.transcriptions.create(
              file=(os.path.basename(mp3_path), af.read()),
              model="whisper-large-v3-turbo",
              response_format="verbose_json",
              timestamp_granularities=["word", "segment"],
              prompt=dynamic_prompt[:200] if dynamic_prompt else None,
          )
        raw_words = getattr(tr, "words", None) or []
        raw_segs = getattr(tr, "segments", None) or []
        for s in raw_segs:
          s_start = round(float(s["start"] if isinstance(s, dict) else s.start), 2)
          s_end = round(float(s["end"] if isinstance(s, dict) else s.end), 2)
          s_text = (s["text"] if isinstance(s, dict) else s.text).strip()
          seg_words = []
          for w in raw_words:
            ws = float(w["start"] if isinstance(w, dict) else w.start)
            we = float(w["end"] if isinstance(w, dict) else w.end)
            wt = (w["word"] if isinstance(w, dict) else w.word).strip()
            if ws >= s_start - 0.1 and we <= s_end + 0.1 and wt:
              seg_words.append(
                  {"start": round(ws, 2), "end": round(we, 2), "word": wt}
              )
          data["segments"].append({
              "start": s_start,
              "end": s_end,
              "text": s_text,
              "words": seg_words,
          })
        if data["segments"]:
          with open(out_json, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
          return data
    except Exception as e:
      print(f"   Groq Whisper unavailable ({e}), falling back to local CPU...")
    finally:
      if os.path.exists(mp3_path):
        os.remove(mp3_path)

  # FALLBACK PATH: Local CPU Faster-Whisper
  print("[3/4] Step B: Transcribing locally with Whisper (tiny.en)...")
  audio_array = samples / 32768.0
  model = WhisperModel(
      "tiny.en",
      device="cpu",
      compute_type="int8",
      cpu_threads=os.cpu_count() or 4,
  )
  segments, _ = model.transcribe(
      audio_array,
      beam_size=1,
      vad_filter=True,
      word_timestamps=True,
      initial_prompt=dynamic_prompt or None,
  )

  for seg in segments:
    words = [
        {
            "start": round(w.start, 2),
            "end": round(w.end, 2),
            "word": w.word.strip(),
        }
        for w in (seg.words or [])
    ]
    data["segments"].append({
        "start": round(seg.start, 2),
        "end": round(seg.end, 2),
        "text": seg.text.strip(),
        "words": words,
    })

  with open(out_json, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
  return data


def clip_bounds(clip: ViralClip):
  """Returns (overall_start, overall_end, combined_duration) for a single- or multi-segment clip."""
  segs = sorted(clip.segments, key=lambda s: s.start)
  return (
      segs[0].start,
      segs[-1].end,
      round(sum(max(0.0, s.end - s.start) for s in segs), 1),
  )


def filter_distinct_clips(clips, min_gap=45.0, dynamic_mode=True):
  """Sanitizes sub-segments, enforces <= 58s total duration, and blocks overlapping story arcs."""
  distinct = []
  for c in clips:
    clean_segs = []
    total_dur = 0.0
    for s in sorted(c.segments, key=lambda x: x.start):
      if s.end <= s.start + 1.5:
        continue
      if clean_segs and s.start < clean_segs[-1].end:
        s.start = clean_segs[-1].end
        if s.end <= s.start + 1.5:
          continue
      remaining = 58.0 - total_dur
      if remaining <= 2.0:
        break
      dur = min(s.end - s.start, remaining)
      clean_segs.append(
          TimeSegment(start=round(s.start, 1), end=round(s.start + dur, 1))
      )
      total_dur += dur
      if not dynamic_mode:
        break

    if not clean_segs or total_dur < 12.0:
      continue

    c.segments = clean_segs
    c_start, c_end, _ = clip_bounds(c)

    if all(
        c_start >= clip_bounds(ex)[1] + min_gap
        or c_end <= clip_bounds(ex)[0] - min_gap
        for ex in distinct
    ):
      distinct.append(c)
  return distinct


def _call_anthropic_claude_json(api_key, model_name, prompt, dynamic_mode=True):
  """Native Anthropic Claude /v1/messages caller for sk-ant-... keys."""
  schema_prompt = (
      prompt
      + "\nReturn ONLY valid JSON (no markdown fences or commentary) matching"
      " this exact schema:\n"
      + json.dumps(ClipList.model_json_schema())
  )
  body = json.dumps({
      "model": model_name,
      "max_tokens": 4096,
      "temperature": 0.3,
      "messages": [{"role": "user", "content": schema_prompt}],
  }).encode("utf-8")

  req = urllib.request.Request(
      "https://api.anthropic.com/v1/messages",
      data=body,
      headers={
          "x-api-key": api_key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
      },
      method="POST",
  )
  with urllib.request.urlopen(req, timeout=60) as resp:
    payload = json.loads(resp.read().decode("utf-8"))
  raw_text = payload["content"][0]["text"].strip()
  json_match = re.search(r"\{.*\}", raw_text, re.DOTALL)
  raw_clips = ClipList.model_validate_json(
      json_match.group(0) if json_match else raw_text
  ).clips
  return filter_distinct_clips(
      raw_clips, min_gap=45.0, dynamic_mode=dynamic_mode
  )


def _call_openai_compatible_json(
    base_url,
    api_key,
    model_name,
    prompt,
    extra_headers=None,
    dynamic_mode=True,
):
  """Calls any OpenAI-compatible endpoint (Gemini, Groq, OpenRouter, OpenAI, DeepSeek, Custom)."""
  client = OpenAI(
      base_url=base_url, api_key=api_key, default_headers=extra_headers or {}
  )
  schema_prompt = (
      prompt
      + "\nReturn ONLY valid JSON (no markdown fences) matching this exact"
      " schema:\n"
      + json.dumps(ClipList.model_json_schema())
  )
  resp = client.chat.completions.create(
      model=model_name,
      temperature=0.3,
      response_format={"type": "json_object"},
      messages=[{"role": "user", "content": schema_prompt}],
  )
  raw_text = resp.choices[0].message.content.strip()
  json_match = re.search(r"\{.*\}", raw_text, re.DOTALL)
  raw_clips = ClipList.model_validate_json(
      json_match.group(0) if json_match else raw_text
  ).clips
  return filter_distinct_clips(
      raw_clips, min_gap=45.0, dynamic_mode=dynamic_mode
  )


def pick_viral_clips(
    data,
    num_clips=4,
    dynamic_mode=True,
    user_provider="auto",
    user_api_key="",
    custom_base_url="",
    custom_model="",
):
  meta = data.get("meta", {})
  spikes = {int(k) for k in data.get("spikes", {}).keys()}
  action_peaks = set(data.get("action_peaks", []))

  lines = []
  for s in data["segments"]:
    st_i = int(s["start"])
    tags = []
    if any(abs(st_i - sp) <= 3 for sp in spikes):
      tags.append("[AUDIO PEAK / REACTION]")
    if any(abs(st_i - ap) <= 2 for ap in action_peaks):
      tags.append("[HIGH SCREEN ACTION]")
    tag_str = (" " + " ".join(tags)) if tags else ""
    lines.append(f"[{s['start']:.1f}s - {s['end']:.1f}s]{tag_str} {s['text']}")

  if dynamic_mode:
    pacing_instructions = """MODE: DYNAMIC STORY JUMP-CUT (Multi-Segment Stitching)
- For long challenges, mini-games, or multi-minute stories, DO NOT return one bloated uncut clip that runs out of time before the winner is revealed!
- Instead, build each Short out of 2 to 4 chronological sub-segments (`segments: [{start, end}, ...]`) that cut out boring middle filler/stalling while preserving the complete story arc:
  * Segment 1 (Setup / Rules / Stakes): 6-14s explaining what the challenge or conflict is.
  * Segment 2 (Escalation / Turning Point): 10-22s showing the peak tension, sabotage, or close call.
  * Segment 3 (Climax / Winner / Payoff): 8-18s showing the final outcome, winner announcement, and reaction.
- If a viral moment is already tight and under 55s without filler, use 1 single sub-segment in `segments`.
- Combined sum of all sub-segments in a clip MUST be between 20 and 58 seconds."""
  else:
    pacing_instructions = """MODE: SINGLE CONTINUOUS CLIP
- Each clip MUST contain exactly 1 continuous sub-segment (`segments: [{start, end}]`) lasting 20 to 58 seconds.
- Capture a complete self-contained moment from setup to punchline/climax without mid-clip cuts."""

  prompt = f"""You are an elite viral Shorts & Reels retention editor.
Video Title: {meta.get('title', 'Unknown')}
Creator: {meta.get('uploader', 'Unknown')}

Select {num_clips} COMPLETELY DISTINCT viral story arcs spread across the entire video timeline for YouTube Shorts / Instagram Reels.

{pacing_instructions}

CRITICAL RETENTION RULES:
1. ZERO OVERLAP BETWEEN CLIPS: Each of the {num_clips} Shorts must cover a different scene/challenge separated by at least 45 seconds.
2. COMPLETE STORY ARC: A viewer who hasn't watched the main video MUST understand what the game/challenge is, feel the middle climax, and see who won or what happened at the end.
3. CURIOSITY HOOK BANNER: Write a 3-5 word uppercase hook_banner that builds tension WITHOUT spoiling the winner or ending.
4. NEVER select channel intros, sponsor/ad reads, or outro subscribe pleas.

TIMELINE:
{chr(10).join(lines)}
"""

  # TIER 0: User's Normalized BYOK Provider (Gemini, Claude, Groq, OpenRouter, OpenAI, DeepSeek, or Custom)
  resolved_user = resolve_user_llm(
      user_provider, user_api_key, custom_base_url, custom_model
  )
  if resolved_user:
    prov_name, base_url, api_key, model_name = resolved_user
    try:
      print(f"[4/4] AI Editor (User BYOK -> {prov_name}: {model_name})...")
      if prov_name == "claude":
        distinct = _call_anthropic_claude_json(
            api_key, model_name, prompt, dynamic_mode=dynamic_mode
        )
      else:
        distinct = _call_openai_compatible_json(
            base_url,
            api_key,
            model_name,
            prompt,
            extra_headers={"X-Title": "ClipForgeAI"},
            dynamic_mode=dynamic_mode,
        )
      if distinct:
        return distinct
    except Exception as e:
      print(
          f"   User BYOK ({prov_name}) failed ({e}), falling back to server"
          " tiers..."
      )

  # TIER 1: Google Gemini Server Free Tier (Flash -> Flash-Lite -> Pro)
  if GEMINI_API_KEY:
    g_client = genai.Client(api_key=GEMINI_API_KEY)
    for attempt, model_name in enumerate(
        ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.8-pro"], 1
    ):
      try:
        print(f"[4/4] AI Editor (Gemini: {model_name}) mapping highlights...")
        resp = g_client.models.generate_content(
            model=model_name,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": ClipList,
                "temperature": 0.3,
            },
        )
        raw_clips = ClipList.model_validate_json(resp.text).clips
        distinct = filter_distinct_clips(
            raw_clips, min_gap=45.0, dynamic_mode=dynamic_mode
        )
        if distinct:
          return distinct
      except Exception as e:
        print(f"   Gemini {model_name} unavailable ({e}), trying next...")
        time.sleep(attempt * 2)

  # TIER 2: Groq Server Free Tier Fallback (Llama 3.3 70B)
  if GROQ_API_KEY:
    try:
      print("[4/4] Gemini busy -> Switching to Groq (llama-3.3-70b-versatile)...")
      distinct = _call_openai_compatible_json(
          "https://api.groq.com/openai/v1",
          GROQ_API_KEY,
          "llama-3.3-70b-versatile",
          prompt,
          dynamic_mode=dynamic_mode,
      )
      if distinct:
        return distinct
    except Exception as e:
      print(f"   Groq unavailable ({e}), switching to OpenRouter...")

  # TIER 3: OpenRouter Server Free Tier Fallback
  if OPENROUTER_API_KEY:
    try:
      print("[4/4] Switching to OpenRouter Free Tier (openrouter/free)...")
      distinct = _call_openai_compatible_json(
          "https://openrouter.ai/api/v1",
          OPENROUTER_API_KEY,
          "openrouter/free",
          prompt,
          extra_headers={"X-Title": "ClipForgeAI"},
          dynamic_mode=dynamic_mode,
      )
      if distinct:
        return distinct
    except Exception as e:
      print(
          f"   OpenRouter unavailable ({e}), falling back to local"
          " peak-editor..."
      )

  # TIER 4: Local Peak-Reaction Fallback (Zero external API dependency)
  print("[4/4] All AI APIs busy -> Using local peak-reaction auto-editor...")
  ranked_peaks = sorted(
      data.get("spikes", {}).items(), key=lambda x: x[1], reverse=True
  )
  fallback = []
  for idx, (sec_str, _) in enumerate(ranked_peaks, 1):
    peak_t = float(sec_str)
    start_t = round(max(0.0, peak_t - 15.0), 1)
    end_t = round(peak_t + 20.0, 1)
    if all(
        start_t >= clip_bounds(c)[1] + 45.0
        or end_t <= clip_bounds(c)[0] - 45.0
        for c in fallback
    ):
      fallback.append(
          ViralClip(
              hook_banner=f"INSANE MOMENT #{idx}",
              title=f"viral_moment_{idx}",
              story_arc="Peak audio & screen reaction highlight",
              segments=[TimeSegment(start=start_t, end=end_t)],
          )
      )
    if len(fallback) == num_clips:
      break
  return fallback


def detect_camera_layout(video_path, start, end):
  """Detects single corner webcam vs multi-cam/full-screen gameplay to prevent double-facecam bugs."""
  if not hasattr(cv2, "CascadeClassifier"):
    return "full_widescreen", None

  cap = cv2.VideoCapture(video_path)
  face_cascade = cv2.CascadeClassifier(
      cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
  )

  zones = {
      "top_left": (0.00, 0.00, 0.32, 0.36),
      "top_right": (0.68, 0.00, 0.32, 0.36),
      "bottom_left": (0.00, 0.64, 0.32, 0.36),
      "bottom_right": (0.68, 0.64, 0.32, 0.36),
  }
  hits = {k: 0 for k in zones}
  multi_face_frames = 0

  for i in range(6):
    t_ms = (start + (end - start) * (i + 0.5) / 6) * 1000
    cap.set(cv2.CAP_PROP_POS_MSEC, t_ms)
    ok, frame = cap.read()
    if not ok:
      continue
    h, w, _ = frame.shape
    gray_full = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    all_faces = face_cascade.detectMultiScale(
        gray_full, 1.15, 5, minSize=(int(w * 0.05), int(w * 0.05))
    )
    if len(all_faces) >= 2:
      multi_face_frames += 1

    for name, (rx, ry, rw, rh) in zones.items():
      roi = gray_full[
          int(h * ry) : int(h * (ry + rh)), int(w * rx) : int(w * (rx + rw))
      ]
      min_face = int(w * 0.045)
      faces = face_cascade.detectMultiScale(
          roi, 1.15, 5, minSize=(min_face, min_face)
      )
      if len(faces) > 0:
        hits[name] += 1

  cap.release()

  if multi_face_frames >= 2:
    return "full_widescreen", None

  best_zone = max(hits, key=hits.get)
  if hits[best_zone] >= 3:
    return best_zone, zones[best_zone]
  return "full_widescreen", None


def map_words_to_stitched_timeline(transcript_segments, clip_segments):
  """Maps original word timestamps onto a single or jump-cut stitched timeline."""
  mapped = []
  offset = 0.0
  for seg_slice in clip_segments:
    s_start, s_end = seg_slice.start, seg_slice.end
    slice_dur = s_end - s_start
    for t_seg in transcript_segments:
      for w in t_seg.get("words", []):
        if w["end"] >= s_start and w["start"] <= s_end:
          rel_s = max(0.0, w["start"] - s_start) + offset
          rel_e = min(slice_dur, w["end"] - s_start) + offset
          if rel_e > rel_s:
            mapped.append(
                {"start": rel_s, "end": rel_e, "word": w["word"].strip()}
            )
    offset += slice_dur

  merged = []
  for w in mapped:
    txt = w["word"]
    if merged and (
        txt.startswith(",") or txt.startswith(".") or txt.lstrip(",.").isdigit()
    ):
      merged[-1]["word"] += txt
      merged[-1]["end"] = w["end"]
    else:
      merged.append(w)

  for w in merged:
    w["word"] = re.sub(r"[,.;:]+$", "", w["word"]).upper()
  return [w for w in merged if w["word"]], offset


def build_capcut_ass(
    transcript_segments, clip_segments, hook_banner, ass_path
):
  header = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Captions,Arial Black,74,&H00FFFFFF,&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,6,2,2,50,50,430,1
Style: Hook,Arial Black,56,&H0000FFFF,&H00FFFFFF,&H00000000,&HCC000000,-1,0,0,0,100,100,0,0,3,14,0,8,60,60,150,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

  def fmt(sec):
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = int(sec % 60)
    cs = int(round((sec - int(sec)) * 100))
    return f"{h}:{m:02}:{s:02}.{cs:02}"

  events = []
  clean_hook = re.sub(r"[^\w\s£$%!?'-]", "", hook_banner).upper()
  events.append(
      "Dialogue: 1,0:00:00.00,0:00:03.50,Hook,,0,0,0,,"
      f"{{\\t(0,120,\\fscx108\\fscy108)\\t(120,240,\\fscx100\\fscy100)}}{clean_hook}"
  )

  words, total_dur = map_words_to_stitched_timeline(
      transcript_segments, clip_segments
  )
  for i in range(0, len(words), 2):
    chunk = words[i : i + 2]
    c_start = max(0.0, chunk[0]["start"])
    c_end = min(total_dur, chunk[-1]["end"], c_start + 1.4)
    if c_end - c_start < 0.12:
      continue

    pop = r"\t(0,90,\fscx114\fscy114)\t(90,180,\fscx100\fscy100)"
    if len(chunk) == 2:
      mid = max(c_start + 0.04, min(c_end - 0.04, chunk[1]["start"]))
      w1, w2 = chunk[0]["word"], chunk[1]["word"]
      events.append(
          f"Dialogue: 0,{fmt(c_start)},{fmt(mid)},Captions,,0,0,0,,"
          f"{{{pop}\\c&H00FFFF&}}{w1} {{\\c&HFFFFFF&}}{w2}"
      )
      events.append(
          f"Dialogue: 0,{fmt(mid)},{fmt(c_end)},Captions,,0,0,0,,"
          f"{{\\c&HFFFFFF&}}{w1} {{\\c&H00FFFF&}}{w2}"
      )
    else:
      w1 = chunk[0]["word"]
      events.append(
          f"Dialogue: 0,{fmt(c_start)},{fmt(c_end)},Captions,,0,0,0,,"
          f"{{{pop}\\c&H00FFFF&}}{w1}"
      )

  with open(ass_path, "w", encoding="utf-8") as f:
    f.write(header + "\n".join(events))


def render_viral_short(video_path, clip_segments, ass_path, out_path):
  safe_ass = ass_path.replace("\\", "/")
  first_seg = clip_segments[0]
  layout_name, box = detect_camera_layout(
      video_path, first_seg.start, first_seg.end
  )
  print(f"   Detected layout: {layout_name} ({len(clip_segments)} segment(s))")

  cmd = ["ffmpeg", "-y"]
  concat_inputs = []
  for idx, seg in enumerate(clip_segments):
    cmd.extend([
        "-ss",
        str(seg.start),
        "-t",
        str(round(seg.end - seg.start, 3)),
        "-i",
        video_path,
    ])
    concat_inputs.append(f"[{idx}:v][{idx}:a]")

  if len(clip_segments) == 1:
    stitch_chain = "[0:v]null[rawv];[0:a]anull[outa];"
  else:
    stitch_chain = (
        f"{''.join(concat_inputs)}concat=n={len(clip_segments)}:v=1:a=1[rawv][outa];"
    )

  bg_chain = (
      "[rawv]split=2[bg_src][fg_src];"
      "[bg_src]scale=270:480:force_original_aspect_ratio=increase,"
      "crop=270:480,boxblur=10:4,scale=1080:1920[bg];"
  )

  if layout_name == "full_widescreen":
    filter_complex = (
        stitch_chain
        + bg_chain
        + "[fg_src]scale=1080:-2[fg];"
        "[bg][fg]overlay=0:(H-h)/2[v];"
        f"[v]ass={safe_ass}[outv]"
    )
  else:
    rx, ry, rw, rh = box
    filter_complex = (
        stitch_chain
        + bg_chain
        + "[fg_src]split=2[cam_src][game_src];"
        f"[cam_src]crop=iw*{rw}:ih*{rh}:iw*{rx}:ih*{ry},"
        "scale=1080:640:force_original_aspect_ratio=increase,crop=1080:640[cam];"
        "[game_src]scale=1080:-2[game];"
        "[bg][cam]overlay=0:0[bg_cam];"
        "[bg_cam][game]overlay=0:640[v];"
        f"[v]ass={safe_ass}[outv]"
    )

  cmd.extend([
      "-filter_complex",
      filter_complex,
      "-map",
      "[outv]",
      "-map",
      "[outa]",
      "-c:v",
      "libx264",
      "-preset",
      "superfast",
      "-crf",
      "21",
      "-threads",
      "0",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      out_path,
  ])

  subprocess.run(
      cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True
  )


if __name__ == "__main__":
  if len(sys.argv) < 2:
    print(
        'Usage:\n  python clip.py "<YOUTUBE_OR_INSTAGRAM_URL>"\n'
        "  python clip.py --reuse"
    )
    sys.exit(1)

  os.makedirs("final_shorts", exist_ok=True)
  if sys.argv[1] == "--reuse" and os.path.exists("source.mp4"):
    if os.path.exists("transcript_data.json"):
      print("[3/4] Loading cached transcript_data.json...")
      with open("transcript_data.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    else:
      data = analyze_audio_and_transcribe()
  else:
    download_and_extract(sys.argv[1])
    data = analyze_audio_and_transcribe()

  clips = pick_viral_clips(data, num_clips=4, dynamic_mode=True)
  for idx, c in enumerate(clips, 1):
    safe_name = re.sub(r"[^a-zA-Z0-9_-]", "_", c.title)[:30]
    ass_file = f"temp_{idx}.ass"
    out_file = f"final_shorts/{idx}_{safe_name}.mp4"
    c_start, c_end, total_dur = clip_bounds(c)
    print(
        f"Rendering [{idx}/{len(clips)}] {c.hook_banner}"
        f" ({total_dur}s across {len(c.segments)} cuts) | {c.story_arc}"
    )
    build_capcut_ass(data["segments"], c.segments, c.hook_banner, ass_file)
    render_viral_short("source.mp4", c.segments, ass_file, out_file)
    if os.path.exists(ass_file):
      os.remove(ass_file)

  print("\nAll viral Shorts saved to 'final_shorts/'!")