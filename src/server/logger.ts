import { JobLogEntry, PipelineStage } from '../types/pipeline.js';

export type LogListener = (entry: JobLogEntry) => void;

class Logger {
  private listeners: Map<string, LogListener[]> = new Map();

  public subscribe(jobId: string, listener: LogListener) {
    const list = this.listeners.get(jobId) || [];
    list.push(listener);
    this.listeners.set(jobId, list);
    return () => {
      const current = this.listeners.get(jobId) || [];
      this.listeners.set(jobId, current.filter(l => l !== listener));
    };
  }

  private sanitize(message: string): string {
    return message.replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_KEY]')
                  .replace(/pexels_[0-9A-Za-z-_]+/gi, '[REDACTED_PEXELS]');
  }

  public log(jobId: string, stage: PipelineStage, level: 'info' | 'warn' | 'error', message: string, details?: any): JobLogEntry {
    const entry: JobLogEntry = {
      timestamp: new Date().toISOString(),
      stage,
      level,
      message: this.sanitize(message),
      details,
    };

    const prefix = `[${entry.timestamp}] [${jobId.slice(0, 8)}] [${stage.toUpperCase()}]`;
    if (level === 'error') {
      console.error(`${prefix} ERROR: ${entry.message}`, details || '');
    } else if (level === 'warn') {
      console.warn(`${prefix} WARN: ${entry.message}`, details || '');
    } else {
      console.log(`${prefix} ${entry.message}`);
    }

    const listeners = this.listeners.get(jobId);
    if (listeners) {
      listeners.forEach(l => {
        try {
          l(entry);
        } catch (err) {
          console.error('Error in log listener:', err);
        }
      });
    }

    return entry;
  }

  public info(jobId: string, stage: PipelineStage, message: string, details?: any): JobLogEntry {
    return this.log(jobId, stage, 'info', message, details);
  }

  public warn(jobId: string, stage: PipelineStage, message: string, details?: any): JobLogEntry {
    return this.log(jobId, stage, 'warn', message, details);
  }

  public error(jobId: string, stage: PipelineStage, message: string, details?: any): JobLogEntry {
    return this.log(jobId, stage, 'error', message, details);
  }
}

export const logger = new Logger();
