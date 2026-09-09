import fs from 'node:fs';
import path from 'node:path';
import { CaptionSegment } from '../../types/pipeline';
import { PipelineLogger } from '../logging/logger';

export class CaptionEngine {
  constructor(private logger?: PipelineLogger) {}

  /**
   * Generates synchronized caption segments and an ASS subtitle file
   * for burning into vertical video.
   */
  generateCaptions(
    narrationText: string,
    totalDurationSeconds: number,
    outputAssPath?: string
  ): { segments: CaptionSegment[]; assPath?: string } {
    this.logger?.stage('CAPTIONS', `Generating synchronized short-form captions (${totalDurationSeconds.toFixed(2)}s)`);

    const chunks = this.chunkText(narrationText);
    if (chunks.length === 0) {
      return { segments: [] };
    }

    // Compute duration weights based on character and word count
    const weights = chunks.map((chunk) => {
      const charCount = chunk.length;
      const wordCount = chunk.split(/\s+/).length;
      return charCount * 1.0 + wordCount * 2.5;
    });

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    const segments: CaptionSegment[] = [];

    let currentTime = 0;
    for (let i = 0; i < chunks.length; i++) {
      const text = chunks[i];
      const isLast = i === chunks.length - 1;
      const allocatedDuration = isLast
        ? Math.max(0.4, totalDurationSeconds - currentTime)
        : (weights[i] / totalWeight) * totalDurationSeconds;

      const roundedDuration = Math.round(allocatedDuration * 100) / 100;
      const startTime = Math.round(currentTime * 100) / 100;
      const endTime = isLast
        ? Math.round(totalDurationSeconds * 100) / 100
        : Math.round((currentTime + roundedDuration) * 100) / 100;

      currentTime = endTime;

      const { hasEmphasis, emphasisWords } = this.detectEmphasis(text);

      segments.push({
        id: `caption_${i}`,
        text,
        startTime,
        endTime,
        duration: Math.round((endTime - startTime) * 100) / 100,
        isEmphasis: hasEmphasis,
        emphasisWords,
      });
    }

    // Write ASS file if path provided
    let assPath: string | undefined;
    if (outputAssPath) {
      assPath = this.writeAssFile(segments, outputAssPath);
      this.logger?.info(`Burn-in subtitle file generated with ${segments.length} chunks: ${assPath}`);
    }

    return { segments, assPath };
  }

  /**
   * Splits continuous narration text into 2-5 word natural spoken phrases.
   */
  private chunkText(text: string): string[] {
    const cleaned = text.trim().replace(/\s+/g, ' ');
    if (!cleaned) return [];

    // First split by punctuation marks that indicate natural pauses
    const clauseRegex = /[^,.;:!?—\-]+[,.;:!?—\-]?/g;
    const rawClauses = cleaned.match(clauseRegex) || [cleaned];

    const resultChunks: string[] = [];

    for (const clause of rawClauses) {
      const words = clause.trim().split(/\s+/).filter(Boolean);
      if (words.length <= 4) {
        if (words.length > 0) {
          resultChunks.push(words.join(' '));
        }
        continue;
      }

      // If clause is longer than 4 words, break into 2-4 word chunks
      let currentChunk: string[] = [];
      for (let i = 0; i < words.length; i++) {
        currentChunk.push(words[i]);

        // Break if we have 3-4 words or if the next word starts a prepositional phrase
        const isLastWord = i === words.length - 1;
        const reachedTargetLength = currentChunk.length >= 3;
        const wordsLeft = words.length - (i + 1);

        if (isLastWord || (reachedTargetLength && wordsLeft >= 2) || currentChunk.length >= 4) {
          resultChunks.push(currentChunk.join(' '));
          currentChunk = [];
        }
      }

      if (currentChunk.length > 0) {
        if (resultChunks.length > 0 && currentChunk.length === 1) {
          // Merge single hanging word into previous chunk
          resultChunks[resultChunks.length - 1] += ' ' + currentChunk[0];
        } else {
          resultChunks.push(currentChunk.join(' '));
        }
      }
    }

    return resultChunks;
  }

  /**
   * Detects words to visually emphasize (numbers, uppercase words, scientific focus).
   */
  private detectEmphasis(text: string): { hasEmphasis: boolean; emphasisWords: string[] } {
    const words = text.split(/\s+/);
    const emphasisWords: string[] = [];

    for (const rawWord of words) {
      const stripped = rawWord.replace(/[^a-zA-Z0-9]/g, '');
      if (!stripped) continue;

      // Check for numbers or words with digits (e.g., "10,000", "300x")
      if (/\d/.test(stripped)) {
        emphasisWords.push(stripped);
        continue;
      }

      // Check for all-caps words of length >= 2 (e.g., "MAGNETAR", "NASA")
      if (stripped.length >= 2 && stripped === stripped.toUpperCase()) {
        emphasisWords.push(stripped);
        continue;
      }

      // Check for key scientific high-impact terms
      const highImpact = ['magnetar', 'trillions', 'billion', 'shockwave', 'supernova', 'galaxy', 'dead star'];
      if (highImpact.includes(stripped.toLowerCase())) {
        emphasisWords.push(stripped);
      }
    }

    return {
      hasEmphasis: emphasisWords.length > 0,
      emphasisWords,
    };
  }

  /**
   * Formats seconds into ASS timecode: H:MM:SS.cs
   */
  private formatAssTime(seconds: number): string {
    const totalCentisecs = Math.round(seconds * 100);
    const cs = totalCentisecs % 100;
    const totalSecs = Math.floor(totalCentisecs / 100);
    const s = totalSecs % 60;
    const totalMins = Math.floor(totalSecs / 60);
    const m = totalMins % 60;
    const h = Math.floor(totalMins / 60);

    const pad = (n: number, z = 2) => String(n).padStart(z, '0');
    return `${h}:${pad(m)}:${pad(s)}.${pad(cs)}`;
  }

  /**
   * Generates and writes ASS subtitle file with vertical video styling and emphasis highlighting.
   */
  private writeAssFile(segments: CaptionSegment[], outPath: string): string {
    const dir = path.dirname(outPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ShortForm,Liberation Sans,68,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,2,0,1,6,3,2,100,100,380,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    const events = segments.map((seg) => {
      const start = this.formatAssTime(seg.startTime);
      const end = this.formatAssTime(seg.endTime);

      let text = seg.text;
      if (seg.isEmphasis && seg.emphasisWords && seg.emphasisWords.length > 0) {
        for (const emp of seg.emphasisWords) {
          const regex = new RegExp(`\\b(${emp})\\b`, 'i');
          // Highlight with high-contrast vibrant cyan/gold accent (&H00D4FF& or &H00FFFF&)
          text = text.replace(regex, '{\\c&H00D4FF&\\b1}$1{\\c&HFFFFFF&\\b0}');
        }
      }

      return `Dialogue: 0,${start},${end},ShortForm,,0,0,0,,${text}`;
    });

    const content = header + events.join('\n') + '\n';
    fs.writeFileSync(outPath, content, 'utf-8');
    return outPath;
  }
}
