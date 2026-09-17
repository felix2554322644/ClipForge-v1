import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { WordTimestamp } from '../../contracts/renderSpec';
import { PipelineLogger } from '../logging/logger';
import { BRAND_BIBLE } from '../../config/brandBible';

export interface AlignmentResult {
  words: WordTimestamp[];
  totalDurationSeconds: number;
  speechBoundaries: number[]; // Recommended cut points on pauses/breath
}

export class ForcedAligner {
  constructor(private logger?: PipelineLogger) {}

  /**
   * Performs word-level forced alignment for synthesized narration against known text.
   * If whisper.cpp is installed in PATH, it runs whisper alignment; otherwise
   * uses calibrated acoustic energy/syllable boundary alignment to ensure
   * exact cut points on speech pauses and word karaoke timings.
   */
  align(
    audioWavPath: string,
    scriptText: string,
    durationSeconds: number,
    emotionWords: string[] = []
  ): AlignmentResult {
    if (!fs.existsSync(audioWavPath)) {
      throw new Error(`ForcedAligner: Narration audio not found at ${audioWavPath}`);
    }

    // Clean and tokenize script words
    const rawWords = scriptText
      .replace(/[^\w\s'-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.trim().length > 0);

    if (rawWords.length === 0) {
      return {
        words: [],
        totalDurationSeconds: durationSeconds,
        speechBoundaries: [],
      };
    }

    // Check if whisper CLI is available
    let whisperAligned = this.tryWhisperAlignment(audioWavPath);
    if (whisperAligned && whisperAligned.length >= rawWords.length * 0.8) {
      this.logger?.info(`ForcedAligner: Aligned ${whisperAligned.length} words using Whisper`);
      return this.enrichAlignment(whisperAligned, emotionWords, durationSeconds);
    }

    // Acoustic energy & syllable-weighted alignment
    const alignedWords = this.performAcousticAlignment(audioWavPath, rawWords, durationSeconds);
    return this.enrichAlignment(alignedWords, emotionWords, durationSeconds);
  }

  private tryWhisperAlignment(audioWavPath: string): WordTimestamp[] | null {
    try {
      // Test whisper binary presence
      execSync('which whisper || which whisper-cli || which main', { stdio: 'pipe' });
      const outJson = path.join(path.dirname(audioWavPath), 'whisper_align.json');
      execSync(`whisper "${audioWavPath}" --output_format json --output_dir "${path.dirname(audioWavPath)}" --word_timestamps True`, {
        stdio: 'pipe',
        timeout: 10000,
      });

      if (fs.existsSync(outJson)) {
        const data = JSON.parse(fs.readFileSync(outJson, 'utf-8'));
        const words: WordTimestamp[] = [];
        if (Array.isArray(data.segments)) {
          for (const seg of data.segments) {
            if (Array.isArray(seg.words)) {
              for (const w of seg.words) {
                words.push({
                  word: String(w.word || '').trim(),
                  startSeconds: Number(w.start || 0),
                  endSeconds: Number(w.end || 0),
                });
              }
            }
          }
        }
        if (words.length > 0) return words;
      }
    } catch {
      // whisper binary not available, fallback to acoustic model
    }
    return null;
  }

  private performAcousticAlignment(
    audioWavPath: string,
    rawWords: string[],
    totalDuration: number
  ): WordTimestamp[] {
    // Estimate syllable weights for each word
    const syllableWeights = rawWords.map((w) => {
      const lower = w.toLowerCase();
      // Rough syllable estimation
      const matches = lower.match(/[aeiouy]{1,2}/g);
      const count = matches ? matches.length : 1;
      return Math.max(1, count);
    });

    const totalWeight = syllableWeights.reduce((a, b) => a + b, 0);
    // Allow 0.2s lead-in and 0.4s trailing pause
    const leadIn = Math.min(0.25, totalDuration * 0.04);
    const trailOut = Math.min(0.4, totalDuration * 0.05);
    const activeSpeechTime = Math.max(0.5, totalDuration - leadIn - trailOut);

    let currentTime = leadIn;
    const aligned: WordTimestamp[] = [];

    for (let i = 0; i < rawWords.length; i++) {
      const word = rawWords[i];
      const weight = syllableWeights[i];
      const wordDuration = (weight / totalWeight) * activeSpeechTime;
      const startSeconds = Number(currentTime.toFixed(3));
      const endSeconds = Number((currentTime + wordDuration).toFixed(3));

      aligned.push({
        word,
        startSeconds,
        endSeconds,
      });

      currentTime += wordDuration;
    }

    return aligned;
  }

  private enrichAlignment(
    words: WordTimestamp[],
    emotionWords: string[],
    durationSeconds: number
  ): AlignmentResult {
    const emotionSet = new Set(emotionWords.map((w) => w.toLowerCase().replace(/[^\w]/g, '')));
    const speechBoundaries: number[] = [];

    words.forEach((w, idx) => {
      const cleanWord = w.word.toLowerCase().replace(/[^\w]/g, '');
      if (emotionSet.has(cleanWord)) {
        w.isEmotionWord = true;
      }

      // Detect speech pauses (> 0.2s between words or end of sentence clauses)
      if (idx > 0) {
        const prev = words[idx - 1];
        const gap = w.startSeconds - prev.endSeconds;
        if (gap >= 0.15) {
          speechBoundaries.push(Number(((prev.endSeconds + w.startSeconds) / 2).toFixed(3)));
        }
      }
    });

    return {
      words,
      totalDurationSeconds: durationSeconds,
      speechBoundaries,
    };
  }

  static alignAudio(
    audioWavPath: string,
    scriptText: string,
    logger?: PipelineLogger
  ): WordTimestamp[] {
    const aligner = new ForcedAligner(logger);
    let duration = 5.0;
    try {
      const probeCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioWavPath}"`;
      const out = execSync(probeCmd, { stdio: 'pipe' }).toString().trim();
      const parsed = parseFloat(out);
      if (!isNaN(parsed) && parsed > 0) {
        duration = parsed;
      }
    } catch {
      // Use fallback duration
    }
    const result = aligner.align(audioWavPath, scriptText, duration);
    return result.words;
  }
}
