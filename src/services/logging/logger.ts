import fs from 'node:fs';
import path from 'node:path';

export class PipelineLogger {
  private logFilePath?: string;

  constructor(outputDir?: string) {
    if (outputDir) {
      this.setLogDirectory(outputDir);
    }
  }

  setLogDirectory(outputDir: string) {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    this.logFilePath = path.join(outputDir, 'pipeline.log');
  }

  info(message: string, meta?: any) {
    this.log('INFO', message, meta);
  }

  warn(message: string, meta?: any) {
    this.log('WARN', message, meta);
  }

  error(message: string, meta?: any) {
    this.log('ERROR', message, meta);
  }

  stage(stageName: string, detail?: string) {
    const line = `\n=== STAGE: [${stageName}] ${detail ? '- ' + detail : ''} ===`;
    console.log(line);
    this.appendToFile(line);
  }

  private log(level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: any) {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${typeof meta === 'object' ? JSON.stringify(meta) : meta}` : '';
    const formatted = `[${timestamp}] [${level}] ${message}${metaStr}`;

    if (level === 'ERROR') {
      console.error(formatted);
    } else if (level === 'WARN') {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }

    this.appendToFile(formatted);
  }

  private appendToFile(line: string) {
    if (this.logFilePath) {
      try {
        fs.appendFileSync(this.logFilePath, line + '\n', 'utf-8');
      } catch {
        // Ignore file write errors during early shutdown
      }
    }
  }
}
