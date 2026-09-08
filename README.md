# Lean AI Video Generator V1

An autonomous, end-to-end automated pipeline that generates verified vertical MP4 narrated short-form videos from any topic.

---

## Architecture Overview

The system follows a strict, sequential, artifact-driven pipeline:

```
TOPIC INPUT
   │
   ▼
[1] RESEARCH (Gemini API) ─────────────► artifacts/research.json
   │
   ▼
[2] STORY / SCRIPT (Gemini API) ───────► artifacts/script.json
   │
   ▼
[3] NARRATION (Piper / Gemini TTS) ────► artifacts/narration.json + narration.wav
   │                                     (Measured with FFprobe as timing anchor)
   ▼
[4] SCENE PLANNER (Gemini API) ────────► artifacts/scene-plan.json
   │
   ▼
[5] B-ROLL SEARCH (Pexels / Procedural)─► Search candidates
   │
   ▼
[6] B-ROLL SELECTION & SCORING ────────► artifacts/broll-selection.json
   │
   ▼
[7] RETENTION-ORIENTED TIMELINE ───────► artifacts/timeline.json
   │  (Visual cuts synchronized to actual audio, 9:16 vertical reframing)
   ▼
[8] FFMPEG COMPOSITION & RENDER ───────► artifacts/render-report.json + final_output.mp4
   │
   ▼
[9] FFPROBE POST-RENDER VALIDATOR ─────► artifacts/validation.json
   │  (Checks video stream, audio stream, duration tolerance, codecs h264/aac, 9:16)
   ▼
VERIFIED VERTICAL MP4
```

---

## Key Pipeline Principles

1. **Artifact-Driven & Inspectable**: Every single stage outputs a strongly-typed JSON artifact stored in `jobs/<jobId>/artifacts/`. Any stage can be inspected, replayed, or verified independently.
2. **Audio is the Timing Anchor**: The system never assumes estimated script duration equals actual audio duration. Spoken narration is generated first, measured down to the millisecond with `ffprobe`, and its actual measured duration governs the entire visual timeline.
3. **Intelligent B-Roll Selection**: Candidates are evaluated with a multi-factor scoring model based on semantic relevance, aspect ratio, resolution, and duration suitability rather than blindly choosing the first result.
4. **Retention-Oriented Vertical Reframing**: Landscape footage is reframed to vertical 9:16 with zero stretching or distortion, and dynamic camera motion (slow punch-in or punch-out) is applied to keep viewers engaged.
5. **Strict Post-Render Validation**: The pipeline does not consider a video "generated" until FFprobe inspects the final output MP4 and confirms all video, audio, codec (H.264 / AAC), aspect ratio (9:16), and duration specs pass.

---

## Configuration

Set environment variables in `.env` (copy from `.env.example`):

```bash
# Gemini API Key for research, script, and scene planning
GEMINI_API_KEY=your_gemini_api_key

# Pexels API Key for real stock video B-roll
PEXELS_API_KEY=your_pexels_api_key

# Optional: Local Piper TTS binary path and model
PIPER_PATH=piper
PIPER_MODEL=en_US-lessac-medium.onnx

# FFmpeg and FFprobe paths (defaults to system PATH)
FFMPEG_PATH=ffmpeg
FFPROBE_PATH=ffprobe
```

*Note*: If `GEMINI_API_KEY` or `PEXELS_API_KEY` are not set or unavailable, the system automatically falls back to deterministic structured research, scriptwriting, speech cadence audio, and procedural cinematic motion footage so the pipeline runs completely reliably offline or during unit tests.

---

## Running the Pipeline

### 1. Web UI & Dev Server
Start the development server with Vite and Express:
```bash
npm run dev
```
Open `http://localhost:3000` to access the interactive web dashboard, featuring:
- Topic input & duration/style/resolution controls
- Real-time animated pipeline stage stepper
- Vertical 9:16 video player preview
- Real-time log console
- Artifact inspector with raw JSON download endpoints
- Job history drawer

### 2. Command Line Interface (CLI)
Run the pipeline directly from the command line for batch processing or automated workflows:
```bash
npm run generate -- "How black holes destroy stars"
```

### 3. Automated Tests
Run unit tests, editing primitives tests, FFmpeg command generation tests, and the end-to-end pipeline test:
```bash
npm test
```

---

## Pipeline Artifacts Schema

- `research.json`: Key facts, entities, chronology, and visual opportunities.
- `script.json`: Retention hook, spoken sentence lines, pacing, and estimated duration.
- `narration.json`: Audio file path, actual duration (sec), sample rate, channels, and sentence timings.
- `scene-plan.json`: Visual shot list with visual objectives, Pexels search queries, camera motion, and cut pacing.
- `broll-selection.json`: Evaluated candidates, multi-factor scores, reasoning, and local file paths.
- `timeline.json`: Complete timeline with clip start/end timestamps, trim windows, center crop coordinates, and scale factors.
- `render-report.json`: FFmpeg command, filtergraph, render duration, and output file size.
- `validation.json`: FFprobe validation results, video/audio stream verification, codec checks, and exact metrics.

---

## Future Roadmap (Post-V1)

- **Dynamic Background Music**: Ducking audio bed underneath spoken narration.
- **Sound Effects (SFX)**: Cinematic risers, whooshes, and impact hits on scene cuts.
- **Automated Animated Subtitles**: Whisper/word-level timestamping with highlighted karaoke captions.
- **Multimodal Vision Scoring**: Using vision models to verify B-roll clip subject matter before selection.
