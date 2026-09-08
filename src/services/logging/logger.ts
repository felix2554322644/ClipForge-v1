import fs from 'fs';
import path from 'path';
import { PipelineStage } from '../../contracts/pipeline';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface StructuredLog {
  timestamp: string;
  jobId: string;
  stage: PipelineStage | 'SYSTEM';
  level: LogLevel;
  message: string;
  data?: any;
}

export class PipelineLogger {
  private jobId: string;
  private logFilePath?: string;

  constructor(jobId: string, artifactDir?: string) {
    this.jobId = jobId;
    if (artifactDir) {
      if (!fs.existsSync(artifactDir)) {
        fs.mkdirSync(artifactDir, { recursive: true });
      }
      this.logFilePath = path.join(artifactDir, 'pipeline.log');
    }
  }

  private sanitize(str: string): string {
    // Strip possible API keys or tokens
    return str
      .replace(/([a-zA-Z0-9_-]{20,})([a-zA-Z0-9_-]{8})/g, (match) => {
        if (match.startsWith('AIza') || match.length >= 32) {
          return `${match.slice(0, 4)}...[REDACTED]`;
        }
        return match;
      });
  }

  private emit(stage: PipelineStage | 'SYSTEM', level: LogLevel, message: string, data?: any) {
    const timestamp = new Date().toISOString();
    const cleanMsg = this.sanitize(message);

    const logEntry: StructuredLog = {
      timestamp,
      jobId: this.jobId,
      stage,
      level,
      message: cleanMsg,
      data,
    };

    const prefix = `[${timestamp}] [JOB ${this.jobId}] [${stage.toUpperCase()}]`;
    const formatted = `${prefix} ${cleanMsg}`;

    if (level === 'error') {
      console.error(formatted);
      if (data) console.error(JSON.stringify(data, null, 2));
    } else if (level === 'warn') {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }

    if (this.logFilePath) {
      try {
        fs.appendFileSync(this.logFilePath, `${formatted}\n`);
      } catch {
        // Ignore file append failures
      }
    }

    return logEntry;
  }

  public stageStart(stage: PipelineStage, detail?: string) {
    this.emit(stage, 'info', `Starting ${detail ? `(${detail})` : ''}`);
  }

  public stageProgress(stage: PipelineStage, message: string, data?: any) {
    this.emit(stage, 'info', message, data);
  }

  public stageCompleted(stage: PipelineStage, summary?: string) {
    this.emit(stage, 'info', `Completed ${summary ? `: ${summary}` : ''}`);
  }

  public stageError(stage: PipelineStage, error: Error | string, details?: any) {
    const msg = error instanceof Error ? error.message : error;
    this.emit(stage, 'error', `ERROR: ${msg}`, details);
  }

  public warn(stage: PipelineStage | 'SYSTEM', message: string) {
    this.emit(stage, 'warn', message);
  }

  public info(stage: PipelineStage | 'SYSTEM', message: string) {
    this.emit(stage, 'info', message);
  }
}
