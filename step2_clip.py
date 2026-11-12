import json
import os
import re
import subprocess
from google import genai
from pydantic import BaseModel, Field
import time

import os
from dotenv import load_dotenv

load_dotenv()
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")


class ViralClip(BaseModel):
  title: str = Field(description="Catchy 3-6 word viral Short title")
  start: float = Field(description="Exact start time in seconds (include 4-6s buildup before the punchline)")
  end: float = Field(description="Exact end time in seconds (15 to 45 seconds after start)")
  reason: str = Field(description="Why this moment is funny, hype, or entertaining")


class ClipList(BaseModel):
  clips: list[ViralClip]





def pick_clips_with_ai(data, num_clips=4):
  client = genai.Client(api_key=API_KEY)

  spikes = {int(k) for k in data.get("spikes", {}).keys()}
  lines = []
  for seg in data["segments"]:
    hype = (
        " [LOUD REACTION]"
        if any(abs(int(seg["start"]) - st) <= 3 for st in spikes)
        else ""
    )
    lines.append(f"[{seg['start']:.1f}s - {seg['end']:.1f}s]{hype} {seg['text']}")
  full_transcript = "\n".join(lines)

  prompt = f"""You are a viral gaming Shorts editor (like editors for IShowSpeed, Danny Aarons, and Kai Cenat).
Read the timestamped gaming transcript below and pick the {num_clips} BEST, funniest, most hype, or most shocking standalone moments for YouTube Shorts / Instagram Reels.

STRICT RULES:
1. NEVER pick intros, outros ("thanks for watching", "subscribe"), or sponsor/ad reads ("buy coins", "use code").
2. Each clip MUST have a complete mini-story: start 4-6 seconds BEFORE the setup/pack-opening/play, include the climax/reaction, and end cleanly right after the reaction finishes (18 to 45 seconds total).
3. Prioritize genuine pack walkouts, rage moments, funny fails, crazy luck, or hilarious banter.

TRANSCRIPT:
{full_transcript}
"""

  models_to_try = [
      "gemini-3.8-flash",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
  ]
  for model_name in models_to_try:
    for attempt in range(2):
      try:
        print(f"Asking AI editor ({model_name}) to find the best moments...")
        response = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": ClipList,
                "temperature": 0.4,
            },
        )
        result = ClipList.model_validate_json(response.text)
        return result.clips
      except Exception as e:
        print(f"   {model_name} busy ({e}), retrying...")
        time.sleep(2)

  raise RuntimeError(
      "All Gemini models are temporarily busy—please run again in 30 seconds."
  )


def format_ass_time(sec):
  h = int(sec // 3600)
  m = int((sec % 3600) // 60)
  s = int(sec % 60)
  cs = int(round((sec - int(sec)) * 100))
  return f"{h}:{m:02}:{s:02}.{cs:02}"


def build_viral_ass(segments, clip_start, clip_end, ass_path):
  header = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial Black,64,&H00FFFFFF,&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,5,2,2,60,60,320,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
  words = [
      w
      for seg in segments
      for w in seg.get("words", [])
      if w["end"] >= clip_start and w["start"] <= clip_end
  ]

  events = []
  for i in range(0, len(words), 2):
    chunk = words[i : i + 2]
    c_start = max(0.0, chunk[0]["start"] - clip_start)
    c_end = min(clip_end - clip_start, chunk[-1]["end"] - clip_start)
    if c_end - c_start < 0.15:
      continue

    if len(chunk) == 2:
      mid = max(c_start + 0.05, min(c_end - 0.05, chunk[1]["start"] - clip_start))
      w1, w2 = chunk[0]["word"].upper(), chunk[1]["word"].upper()
      events.append(f"Dialogue: 0,{format_ass_time(c_start)},{format_ass_time(mid)},Default,,0,0,0,,{{\\c&H00FFFF&}}{w1} {{\\c&HFFFFFF&}}{w2}")
      events.append(f"Dialogue: 0,{format_ass_time(mid)},{format_ass_time(c_end)},Default,,0,0,0,,{{\\c&HFFFFFF&}}{w1} {{\\c&H00FFFF&}}{w2}")
    else:
      w1 = chunk[0]["word"].upper()
      events.append(f"Dialogue: 0,{format_ass_time(c_start)},{format_ass_time(c_end)},Default,,0,0,0,,{{\\c&H00FFFF&}}{w1}")

  with open(ass_path, "w", encoding="utf-8") as f:
    f.write(header + "\n".join(events))


def render_clip(video_path, start, end, ass_path, out_path, layout="zoom"):
  duration = end - start
  if layout == "split_right_cam":
    filter_complex = (
        "[0:v]crop=iw*0.30:ih*0.34:iw*0.70:0,scale=1080:690:force_original_aspect_ratio=increase,crop=1080:690[cam];"
        "[0:v]scale=-1:1230,crop=1080:1230[game];"
        "[cam][game]vstack=inputs=2[v];"
        f"[v]ass={ass_path}[outv]"
    )
  else:
    filter_complex = (
        "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=30:8[bg];"
        "[0:v]scale=1460:-2,crop=1080:ih[fg];"
        "[bg][fg]overlay=0:(H-h)/2[v];"
        f"[v]ass={ass_path}[outv]"
    )

  subprocess.run(
      [
          "ffmpeg", "-y", "-ss", str(start), "-t", str(duration), "-i", video_path,
          "-filter_complex", filter_complex, "-map", "[outv]", "-map", "0:a",
          "-c:v", "libx264", "-preset", "fast", "-crf", "21", "-c:a", "aac", "-b:a", "128k",
          out_path,
      ],
      stdout=subprocess.DEVNULL,
      stderr=subprocess.DEVNULL,
      check=True,
  )


if __name__ == "__main__":
  os.makedirs("output_ai", exist_ok=True)
  with open("transcript_data.json", "r", encoding="utf-8") as f:
    data = json.load(f)

  clips = pick_clips_with_ai(data, num_clips=4)
  for idx, clip in enumerate(clips, 1):
    safe_title = re.sub(r"[^a-zA-Z0-9_-]", "_", clip.title)[:30]
    ass_file = f"temp_{idx}.ass"
    out_file = f"output_ai/{idx}_{safe_title}.mp4"
    print(f"\n[{idx}/{len(clips)}] {clip.title} ({clip.start}s -> {clip.end}s)")
    print(f"   Reason: {clip.reason}")
    build_viral_ass(data["segments"], clip.start, clip.end, ass_file)
    render_clip("source.mp4", clip.start, clip.end, ass_file, out_file, layout="zoom")
    if os.path.exists(ass_file):
      os.remove(ass_file)

  print("\nAll AI-picked clips saved to 'output_ai'!")