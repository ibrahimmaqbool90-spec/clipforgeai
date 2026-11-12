import json
import os
import subprocess
import sys
import wave
from faster_whisper import WhisperModel
import numpy as np
import yt_dlp


def download_video(url, output_video="source.mp4"):
  if os.path.exists(output_video):
    os.remove(output_video)
  ydl_opts = {
      "format": (
          "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
      ),
      "outtmpl": output_video,
      "merge_output_format": "mp4",
  }
  print(f"[1/4] Downloading video...")
  with yt_dlp.YoutubeDL(ydl_opts) as ydl:
    ydl.download([url])


def extract_audio(video_path="source.mp4", audio_path="audio.wav"):
  print("[2/4] Extracting audio...")
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


def get_audio_spikes(audio_path="audio.wav"):
  print("[3/4] Detecting sudden reaction spikes (ignoring intro/outro)...")
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

  # Measure sudden jumps (contrast against previous 4.5s) so constant loud talking/music isn't flagged
  spikes = {}
  for idx in range(3, len(rms_list)):
    t, cur = rms_list[idx]
    if t < 45 or t > total_sec - 45:  # Skip intro and outro
      continue
    baseline = np.mean([rms_list[idx - 1][1], rms_list[idx - 2][1], rms_list[idx - 3][1]]) + 1.0
    ratio = cur / baseline
    if ratio > 1.8 and cur > np.percentile([r[1] for r in rms_list], 75):
      spikes[int(t)] = round(ratio, 2)
  return spikes


def transcribe_words(audio_path="audio.wav", spikes=None, out_json="transcript_data.json"):
  print("[4/4] Transcribing with word-level timestamps...")
  with wave.open(audio_path, "rb") as wf:
    frames = wf.readframes(wf.getnframes())
    audio_array = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0

  model = WhisperModel("base", device="cpu", compute_type="int8")
  segments, _ = model.transcribe(audio_array, beam_size=5, vad_filter=True, word_timestamps=True)

  data = {"spikes": spikes or {}, "segments": []}
  for seg in segments:
    words = [
        {"start": round(w.start, 2), "end": round(w.end, 2), "word": w.word.strip()}
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
  print(f"Done! Saved word-level transcript to '{out_json}'.")


if __name__ == "__main__":
  if len(sys.argv) < 2:
    print('Usage: python step1_extract.py "<URL>"')
    sys.exit(1)
  download_video(sys.argv[1])
  extract_audio()
  sp = get_audio_spikes()
  transcribe_words(spikes=sp)