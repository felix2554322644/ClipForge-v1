import fs from 'node:fs';
import path from 'node:path';
import { CaptionSegment, CaptionTheme, EditorialPlan } from '../../types/pipeline';
import { PipelineLogger } from '../logging/logger';

export const DEFAULT_CAPTION_THEME: CaptionTheme = {
  fontName: 'Liberation Sans',
  fontSize: 78,
  primaryColor: '&H00FFFFFF&', // Crisp White (ASS &HAABBGGRR&)
  outlineColor: '&H00000000&', // Solid Black
  outlineWidth: 8,
  shadowDepth: 4,
  emphasisColor: '&H0000E6FF&', // Vibrant TikTok Golden Yellow (#FFE600)
  emphasisScalePercent: 112, // Subtle 112% pop
  marginVertical: 520, // Lower-middle safe area (well clear of TikTok/Reels UI)
  animationFadeMs: 70, // Fast, punchy phrase transition
};

export class CaptionEngine {
  private theme: CaptionTheme;

  constructor(
    private logger?: PipelineLogger,
    customTheme?: Partial<CaptionTheme>
  ) {
    this.theme = { ...DEFAULT_CAPTION_THEME, ...customTheme };
  }

  /**
   * Generates synchronized short-form social captions (TikTok/Reels/Shorts style)
   * with word-level emphasis and burns them into an ASS subtitle file.
   * Can optionally synchronize styles with an EditorialPlan.
   */
  generateCaptions(
    narrationText: string,
    totalDurationSeconds: number,
    outputAssPath?: string,
    editorialPlan?: EditorialPlan
  ): { segments: CaptionSegment[]; assPath?: string } {
    this.logger?.stage(
      'CAPTIONS',
      `Generating social short-form captions (${totalDurationSeconds.toFixed(2)}s, theme=${this.theme.fontName} ${this.theme.fontSize}px)`
    );

    const rawChunks = this.chunkText(narrationText);

    // Filter out punctuation-only or empty chunks
    const chunks = rawChunks.filter((c) => {
      const alphanumeric = c.replace(/[^a-zA-Z0-9]/g, '');
      return alphanumeric.length > 0;
    });

    if (chunks.length === 0) {
      return { segments: [] };
    }

    // Compute proportional duration weights based on character and word count
    const weights = chunks.map((chunk) => {
      const charCount = chunk.length;
      const wordCount = chunk.split(/\s+/).length;
      return charCount * 1.0 + wordCount * 2.8;
    });

    const totalWeight = weights.reduce((sum, w) => sum + w, 0) || 1;
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
      assPath = this.writeAssFile(segments, outputAssPath, editorialPlan);
      this.logger?.info(
        `Social caption file burned with ${segments.length} phrase chunks: ${assPath}`
      );
    }

    return { segments, assPath };
  }

  /**
   * Splits continuous narration text into 2-5 word natural spoken phrase chunks,
   * strictly preventing punctuation-only fragments or single-letter words.
   */
  private chunkText(text: string): string[] {
    const cleaned = text.trim().replace(/\s+/g, ' ');
    if (!cleaned) return [];

    // Split by major punctuation pauses (. , ; : ! ? — -)
    const clauseRegex = /[^,.;:!?—\-]+[,.;:!?—\-]?/g;
    const rawClauses = cleaned.match(clauseRegex) || [cleaned];

    const resultChunks: string[] = [];

    for (const rawClause of rawClauses) {
      // Strip trailing punctuation from clause to prevent punctuation artifacts
      const cleanClause = rawClause.trim();
      const words = cleanClause.split(/\s+/).filter(Boolean);

      if (words.length <= 4) {
        const joined = words.join(' ');
        // Check that it's not purely punctuation
        if (joined.replace(/[^a-zA-Z0-9]/g, '').length > 0) {
          resultChunks.push(joined);
        }
        continue;
      }

      // Break longer clauses into 2-4 word rhythmic chunks
      let currentChunk: string[] = [];
      for (let i = 0; i < words.length; i++) {
        currentChunk.push(words[i]);

        const isLastWord = i === words.length - 1;
        const reachedTargetLength = currentChunk.length >= 3;
        const wordsLeft = words.length - (i + 1);

        if (isLastWord || (reachedTargetLength && wordsLeft >= 2) || currentChunk.length >= 4) {
          const chunkStr = currentChunk.join(' ');
          if (chunkStr.replace(/[^a-zA-Z0-9]/g, '').length > 0) {
            resultChunks.push(chunkStr);
          }
          currentChunk = [];
        }
      }

      if (currentChunk.length > 0) {
        const chunkStr = currentChunk.join(' ');
        if (chunkStr.replace(/[^a-zA-Z0-9]/g, '').length > 0) {
          if (resultChunks.length > 0 && currentChunk.length === 1) {
            // Merge single hanging word into previous chunk
            resultChunks[resultChunks.length - 1] += ' ' + currentChunk[0];
          } else {
            resultChunks.push(chunkStr);
          }
        }
      }
    }

    // Final sanitation pass: remove any lingering punctuation-only entries
    return resultChunks.filter((chunk) => chunk.replace(/[^a-zA-Z0-9]/g, '').length > 0);
  }

  /**
   * Detects high-impact words to visually pop (numbers, uppercase terms, scientific focus).
   */
  public detectEmphasis(text: string): { hasEmphasis: boolean; emphasisWords: string[] } {
    const words = text.split(/\s+/);
    const emphasisWords: string[] = [];

    const highImpactTerms = new Set([
      'magnetar',
      'magnetars',
      'trillion',
      'trillions',
      'billion',
      'billions',
      'million',
      'millions',
      'thousand',
      'thousands',
      'shockwave',
      'supernova',
      'dead star',
      'neutron',
      'light years',
      'extreme',
      'burst',
      'bursts',
      'radio',
      'signal',
      'signals',
      'earth',
      'cosmic',
      'galaxy',
      'mysterious',
      'powerful',
    ]);

    for (const rawWord of words) {
      const stripped = rawWord.replace(/[^a-zA-Z0-9]/g, '');
      if (!stripped) continue;

      // 1. Numbers / quantities (e.g. "10,000", "1,000x", "300")
      if (/\d/.test(stripped)) {
        emphasisWords.push(stripped);
        continue;
      }

      // 2. All-caps terms of 2+ letters (e.g. "FRB", "NASA", "MAGNETAR")
      if (stripped.length >= 2 && stripped === stripped.toUpperCase()) {
        emphasisWords.push(stripped);
        continue;
      }

      // 3. High-impact keywords
      if (highImpactTerms.has(stripped.toLowerCase())) {
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
   * Generates and writes ASS subtitle file with modern social short-form typography,
   * safe-zone margin, accent color pop, and subtle entry animation.
   */
  private writeAssFile(
    segments: CaptionSegment[],
    outPath: string,
    editorialPlan?: EditorialPlan
  ): string {
    const dir = path.dirname(outPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const {
      fontName,
      fontSize,
      primaryColor,
      outlineColor,
      outlineWidth,
      shadowDepth,
      emphasisColor: defaultEmphasisColor,
      emphasisScalePercent: defaultScalePercent,
      marginVertical,
      animationFadeMs,
    } = this.theme;

    const header = `[Script Info]
Title: TikTok / Reels Social Captions
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: SocialCaptions,${fontName},${fontSize},${primaryColor},&H000000FF,${outlineColor},&H80000000,-1,0,0,0,100,100,2,0,1,${outlineWidth},${shadowDepth},2,80,80,${marginVertical},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    // Map cumulative shot time windows if editorial plan is present
    const shotWindows: { start: number; end: number; treatment: string }[] = [];
    if (editorialPlan && editorialPlan.decisions.length > 0) {
      let t = 0;
      for (const d of editorialPlan.decisions) {
        shotWindows.push({
          start: t,
          end: t + d.durationSeconds,
          treatment: d.captionTreatment || 'standard',
        });
        t += d.durationSeconds;
      }
    }

    const events = segments.map((seg) => {
      const start = this.formatAssTime(seg.startTime);
      const end = this.formatAssTime(seg.endTime);

      let activeTreatment = 'standard';
      if (shotWindows.length > 0) {
        const matched = shotWindows.find(
          (w) => seg.startTime >= w.start - 0.1 && seg.startTime < w.end
        );
        if (matched) activeTreatment = matched.treatment;
      }

      let activeEmphasisColor = defaultEmphasisColor;
      let activeScale = defaultScalePercent;

      if (activeTreatment === 'hook_pop') {
        activeEmphasisColor = '&H0000E6FF&'; // Vibrant Golden Yellow
        activeScale = 116;
      } else if (activeTreatment === 'statistic_callout') {
        activeEmphasisColor = '&H00FFFF00&'; // Electric Cyan
        activeScale = 114;
      } else if (activeTreatment === 'reveal_pop') {
        activeEmphasisColor = '&H0033E6FF&'; // Radiant Amber
        activeScale = 115;
      } else if (activeTreatment === 'payoff_impact') {
        activeEmphasisColor = '&H0000FF66&'; // Neon Green
        activeScale = 116;
      }

      let text = seg.text;

      // Word-level emphasis with accent color and scale pop
      if (seg.isEmphasis && seg.emphasisWords && seg.emphasisWords.length > 0) {
        for (const emp of seg.emphasisWords) {
          const regex = new RegExp(`\\b(${emp})\\b`, 'i');
          text = text.replace(
            regex,
            `{\\c${activeEmphasisColor}\\b1\\fscx${activeScale}\\fscy${activeScale}}$1{\\c${primaryColor}\\b1\\fscx100\\fscy100}`
          );
        }
      }

      // Subtle phrase entry/exit fade animation
      const animTag = `{\\fad(${animationFadeMs},${animationFadeMs})}`;

      return `Dialogue: 0,${start},${end},SocialCaptions,,0,0,0,,${animTag}${text}`;
    });

    const content = header + events.join('\n') + '\n';
    fs.writeFileSync(outPath, content, 'utf-8');
    return outPath;
  }
}
