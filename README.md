# Lean AI Video Generator (V1)

Autonomous vertical short-form video generation pipeline powered by Gemini, Pexels, Piper TTS, and FFmpeg.

## Features
- **Local TTS Synthesis**: Runs Piper TTS directly on runner/host with ONNX models (no cloud TTS dependency).
- **Procedural & Stock Footage**: Integrates Pexels portrait search with automatic 9:16 reframing and procedural cosmic footage fallbacks.
- **Dynamic Motion**: Cinematic Ken Burns motion effects (zoom in, zoom out, pan).
- **Full Video Assembly**: Concat filters, AAC audio encoding, and 1080x1920 vertical composition via FFmpeg.
- **Strict Automated Validation**: FFprobe verification of streams, resolution, sample rate, and synchronization.

## GitHub Actions Configuration
The pipeline workflow in `.github/workflows/generate-video.yml` uses:
- Node.js 22 with `cache: 'npm'` using `package-lock.json`
- `npm ci` for reliable and reproducible dependency installation
- Automatic caching for Piper TTS binaries and voice models
- Automated pre-flight voice verification (`npm run verify:piper`)
- Multi-step artifact upload for rendered video, transcripts, and timeline metadata.
