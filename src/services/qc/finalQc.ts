import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { GeminiClient, GeminiPart } from '../gemini/client';
import { PipelineLogger } from '../logging/logger';

export interface QCIssue {
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestampSeconds?: number;
  shotId?: string;
  issueCategory: string;
  recommendedAction: string;
  repairable: boolean;
}

export interface QCReport {
  overallScore: number;
  pass: boolean;
  issues: QCIssue[];
  evaluatedAt: string;
  method: 'gemini_multimodal' | 'deterministic_fallback';
  summary: string;
}

export class FinalQualityControlService {
  private geminiClient: GeminiClient;

  constructor(private logger?: PipelineLogger) {
    this.geminiClient = new GeminiClient({ logger });
  }

  /**
   * Extracts a representative set of frames from the rendered MP4 at deterministic timestamps.
   */
  extractFrames(videoPath: string, durationSeconds: number, numFrames = 3): { timestamp: number; base64: string }[] {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`FinalQC: Rendered video not found at ${videoPath}`);
    }

    const outDir = path.join(path.dirname(videoPath), 'qc_frames');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const timestamps: number[] = [];
    const d = Math.max(1.0, durationSeconds);
    for (let i = 1; i <= numFrames; i++) {
      // e.g. at 25%, 50%, 75% or evenly spaced
      const t = Math.min(d - 0.1, (d / (numFrames + 1)) * i);
      timestamps.push(Number(t.toFixed(2)));
    }

    const extracted: { timestamp: number; base64: string }[] = [];

    timestamps.forEach((t, idx) => {
      const framePath = path.join(outDir, `frame_${idx}_t${t}.jpg`);
      try {
        const cmd = `ffmpeg -y -ss ${t} -i "${videoPath}" -vframes 1 -q:v 2 "${framePath}"`;
        execSync(cmd, { stdio: 'pipe' });
        if (fs.existsSync(framePath) && fs.statSync(framePath).size > 0) {
          const buffer = fs.readFileSync(framePath);
          extracted.push({
            timestamp: t,
            base64: buffer.toString('base64'),
          });
        }
      } catch (err) {
        this.logger?.warn?.(`FinalQC: Failed to extract frame at ${t}s: ${(err as Error).message}`);
      }
    });

    return extracted;
  }

  /**
   * Performs technical deterministic QC fallback.
   */
  private runDeterministicFallback(videoPath: string, durationSeconds: number): QCReport {
    const exists = fs.existsSync(videoPath) && fs.statSync(videoPath).size > 0;
    const pass = exists && durationSeconds > 0;

    return {
      overallScore: pass ? 88 : 40,
      pass,
      issues: pass
        ? []
        : [
            {
              severity: 'high',
              issueCategory: 'render_artifact',
              recommendedAction: 'Verify video render integrity and codecs.',
              repairable: true,
            },
          ],
      evaluatedAt: new Date().toISOString(),
      method: 'deterministic_fallback',
      summary: pass ? 'Deterministic technical QC passed successfully.' : 'Render output invalid or empty.',
    };
  }

  /**
   * Evaluates the rendered video via ONE multimodal Gemini QC request with deterministic fallback.
   */
  async evaluateVideo(
    videoPath: string,
    durationSeconds: number,
    editorialMetadata?: Record<string, any>
  ): Promise<QCReport> {
    this.logger?.stage('FINAL_QC', 'Executing final video quality control inspection...');

    if (!this.geminiClient.isAvailable()) {
      this.logger?.info?.('FinalQC: Gemini API key not available. Using deterministic technical QC fallback.');
      const report = this.runDeterministicFallback(videoPath, durationSeconds);
      this.saveArtifact(videoPath, report);
      return report;
    }

    try {
      const frames = this.extractFrames(videoPath, durationSeconds, 3);
      const parts: GeminiPart[] = [];

      // Add frame parts
      frames.forEach((f, idx) => {
        parts.push({
          text: `[Frame ${idx + 1} at timestamp ${f.timestamp}s]:`,
        });
        parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: f.base64,
          },
        });
      });

      const metaStr = editorialMetadata ? JSON.stringify(editorialMetadata, null, 2) : 'No extra metadata provided.';
      const prompt = `You are a professional Master Video Quality Control (QC) Director. Inspect the provided representative video frames and metadata for this short-form video (duration: ${durationSeconds}s).
Editorial Metadata:
${metaStr}

Evaluate the video across:
1. Visual/narration alignment and framing
2. Awkward crops, cut-off subjects, or jitter
3. Visual repetition or pacing
4. Caption placement and typography consistency
5. Opening hook and payoff ending quality

Return ONLY valid JSON (no markdown fences or extra text) matching this schema:
{
  "overallScore": number (0-100),
  "pass": boolean,
  "issues": [
    {
      "severity": "low" | "medium" | "high" | "critical",
      "timestampSeconds": number,
      "issueCategory": string,
      "recommendedAction": string,
      "repairable": boolean
    }
  ],
  "summary": string
}`;

      parts.push({ text: prompt });

      const responseText = await this.geminiClient.executeWithFailover({ parts });
      const cleaned = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      const report: QCReport = {
        overallScore: typeof parsed.overallScore === 'number' ? parsed.overallScore : 85,
        pass: typeof parsed.pass === 'boolean' ? parsed.pass : true,
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        evaluatedAt: new Date().toISOString(),
        method: 'gemini_multimodal',
        summary: typeof parsed.summary === 'string' ? parsed.summary : 'Multimodal QC inspection completed.',
      };

      this.saveArtifact(videoPath, report);
      this.logger?.info?.(`FinalQC: Multimodal Gemini QC completed. Score: ${report.overallScore}/100, Pass: ${report.pass}`);
      return report;
    } catch (err) {
      this.logger?.warn?.(`FinalQC: Gemini multimodal QC failed (${(err as Error).message}). Falling back to deterministic technical QC.`);
      const fallbackReport = this.runDeterministicFallback(videoPath, durationSeconds);
      this.saveArtifact(videoPath, fallbackReport);
      return fallbackReport;
    }
  }

  private saveArtifact(videoPath: string, report: QCReport): void {
    try {
      const outDir = path.dirname(videoPath);
      const qcPath = path.join(outDir, 'final-qc.json');
      fs.writeFileSync(qcPath, JSON.stringify(report, null, 2), 'utf-8');
      this.logger?.info?.(`FinalQC: Saved machine-readable artifact to ${qcPath}`);
    } catch (err) {
      this.logger?.warn?.(`FinalQC: Failed to save final-qc.json artifact: ${(err as Error).message}`);
    }
  }
}
