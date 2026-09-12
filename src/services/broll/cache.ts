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
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    const fallbackPath = path.join(this.cacheDir, 'broll', `${safeKey}.mp4`);
    if (fs.existsSync(fallbackPath)) {
      return fallbackPath;
    }
    return null;
  }

  set(key: string, filePath: string, duration: number, query: string): string {
    const brollDir = path.join(this.cacheDir, 'broll');
    if (!fs.existsSync(brollDir)) {
      fs.mkdirSync(brollDir, { recursive: true });
    }
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    const cachedFile = path.join(brollDir, `${safeKey}.mp4`);

    let targetPath = filePath;
    try {
      if (fs.existsSync(filePath) && path.resolve(filePath) !== path.resolve(cachedFile)) {
        fs.copyFileSync(filePath, cachedFile);
        targetPath = cachedFile;
      } else if (fs.existsSync(cachedFile)) {
        targetPath = cachedFile;
      }
    } catch {
      targetPath = filePath;
    }

    this.index[key] = { filePath: targetPath, duration, query };
    try {
      fs.writeFileSync(this.indexPath, JSON.stringify(this.index, null, 2), 'utf-8');
    } catch {
      // Ignore write errors
    }
    return targetPath;
  }
}
