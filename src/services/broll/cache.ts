import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../../config/index';

export class BrollCache {
  private cacheDir: string;
  private indexPath: string;
  private index: Record<string, { filePath: string; duration: number; query: string }>;

  constructor() {
    this.cacheDir = CONFIG.CACHE_DIR;
    this.indexPath = path.join(this.cacheDir, 'broll_cache_index.json');
    this.index = {};
    this.init();
  }

  private init() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    if (fs.existsSync(this.indexPath)) {
      try {
        this.index = JSON.parse(fs.readFileSync(this.indexPath, 'utf-8'));
      } catch {
        this.index = {};
      }
    }
  }

  get(key: string): string | null {
    const entry = this.index[key];
    if (entry && fs.existsSync(entry.filePath)) {
      return entry.filePath;
    }
    return null;
  }

  set(key: string, filePath: string, duration: number, query: string) {
    this.index[key] = { filePath, duration, query };
    try {
      fs.writeFileSync(this.indexPath, JSON.stringify(this.index, null, 2), 'utf-8');
    } catch {
      // Ignore write errors
    }
  }
}
