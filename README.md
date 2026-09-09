# Lean AI Video Generator (V1.2)

Autonomous vertical short-form video generation pipeline powered by Gemini, Pexels, Pixabay, Piper TTS, and FFmpeg.

## What's New in V1.2

### 1. Social Short-Form Captions (TikTok / Reels / Shorts Style)
- **Bold Typography & High Legibility**: Styled with large 78px bold sans-serif text (`Liberation Sans`), a thick solid 8px black outline, and soft 4px shadow to guarantee readability over complex footage.
- **Safe Zone Positioning**: Captions sit in the lower-middle region (MarginV: 520px in 1080x1920), preserving clearance from native mobile UI elements (handles, captions, audio badges, action buttons).
- **Word-Level Emphasis**: Automatically detects numbers, capitalized scientific acronyms, and high-impact terms (e.g. `MAGNETAR`, `10,000`, `DEAD STAR`, `TRILLIONS`) and pops them with a vibrant golden-yellow accent (`#FFE600` / `&H0000E6FF&`) and subtle font scale pop (`112%`).
- **Clean Phrase Chunking**: Rhythmic 2–5 word spoken chunks synchronized to Piper voice synthesis. Punctuation-only chunks (e.g. `"."` or `"-"`) are strictly purged.
- **Subtle Animation**: Uses smooth phrase entry/exit tags (`\fad(70,70)`) for a modern, energetic feel.

### 2. Native Vertical B-Roll Selection (9:16 First)
- **Hard Landscape Filter**: Landscape source clips (`width > height`) are rejected by default (`ALLOW_LANDSCAPE_FALLBACK=false`). The pipeline does not crop or zoom landscape videos into 9:16.
- **Portrait Quality Scoring**: Aspect ratio is one of the highest weighted factors (30 pts for native 9:16, 22 pts for near-9:16 portrait, 14 pts for 4:5 portrait, 4 pts for square, 0 pts for landscape).
- **Intelligent Query Expansion**: If narrow search terms yield no vertical footage, the query engine expands terms (e.g. `magnetar` → `neutron star space`, `spinning star core`, `cosmic energy burst`) before falling back to native vertical procedural synthesis.
- **Duplicate Clip Penalty**: Reusing an asset ID incurs a heavy -35 point penalty in `broll-selection.json`.

### 3. Dual Provider Architecture (Pexels + Pixabay)
- **Provider Abstraction**: Unified `BrollProvider` interface normalizing results into a common `NormalizedBrollVideo` structure across both Pexels and Pixabay.
- **Cross-Provider Quality Comparison**: Evaluates candidates from both platforms based on resolution, native vertical framing, duration, and semantic relevance, choosing the highest total score.

---

## API Keys & Configuration

Set the following in `.env` (or GitHub Actions Secrets):

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes (Production) | Google AI Studio API Key for research & scripting |
| `GEMINI_MODEL` | No | Default: `gemini-3.6-flash` |
| `PEXELS_API_KEY` | Yes (Stock Video) | Pexels API Key for portrait B-roll |
| `PIXABAY_API_KEY` | Optional / Recommended | Pixabay API Key for video search ([Get a key](https://pixabay.com/api/docs/)) |
| `VIDEO_TOPIC` | No | Topic for generation |
| `ALLOW_FALLBACKS` | No | Default `false` in CI |
| `ALLOW_LANDSCAPE_FALLBACK` | No | Default `false` (enforces native vertical footage only) |

### Obtaining a Pixabay API Key
1. Sign up for a free account at [Pixabay](https://pixabay.com).
2. Visit the [Pixabay API Documentation](https://pixabay.com/api/docs/).
3. Copy your unique API key from the documentation page and configure `PIXABAY_API_KEY`.

---

## Local Setup & Testing

1. Install dependencies:
   ```bash
   npm ci
   ```

2. Download and verify Piper voice model:
   ```bash
   bash scripts/setup-piper.sh
   npm run verify:piper
   ```

3. Run verification tests (mocked providers, no live API keys needed):
   ```bash
   npm test
   ```

4. Run typecheck & build:
   ```bash
   npm run lint
   npm run build
   ```

5. Run video generation pipeline:
   ```bash
   npm run generate
   ```

---

## Font Requirements

The ASS caption engine uses `Liberation Sans` by default, which is pre-installed on Debian/Ubuntu and standard GitHub Actions runners (`ubuntu-latest`). On macOS or Windows, standard bold sans-serif fonts (such as Arial or Helvetica) will render if Liberation Sans is absent.

---

## GitHub Actions Workflow

The automated workflow in `.github/workflows/generate-video.yml`:
- Runs on Node 22 with cached npm dependencies.
- Sets up FFmpeg and caches Piper TTS voice models.
- Executes full unit and E2E verification suites.
- Performs autonomous video generation and uploads MP4, transcripts, and timeline metadata as artifacts.
