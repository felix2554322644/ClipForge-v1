import fs from 'fs';
import path from 'path';
import { SelectedBrollClip } from '../../contracts/artifacts';

export interface BrollCacheEntry {
  id: string | number;
  provider: string;
  localPath: string;
  fileSizeBytes: number;
  width: number;
  height: number;
  duration: number;
  downloadedAt: string;
}

export class BrollCache {
  private cacheIndexFile: string;
  private memoryIndex: Map<string, BrollCacheEntry> = new Map();

  constructor(private cacheDir: string) {
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    this.cacheIndexFile = path.join(cacheDir, 'broll_cache_index.json');
    this.loadIndex();
  }

  private loadIndex() {
    if (fs.existsSync(this.cacheIndexFile)) {
      try {
        const raw = fs.readFileSync(this.cacheIndexFile, 'utf-8');
        const list: BrollCacheEntry[] = JSON.parse(raw);
        for (const item of list) {
          if (fs.existsSync(item.localPath)) {
            this.memoryIndex.set(String(item.id), item);
          }
        }
      } catch {
        // ignore corrupted cache file
      }
    }
  }

  private persistIndex() {
    try {
      const list = Array.from(this.memoryIndex.values());
      fs.writeFileSync(this.cacheIndexFile, JSON.stringify(list, null, 2));
    } catch {
      // ignore write failures
    }
  }

  public get(id: string | number): BrollCacheEntry | null {
    const entry = this.memoryIndex.get(String(id));
    if (entry && fs.existsSync(entry.localPath)) {
      return entry;
    }
    return null;
  }

  public set(clip: SelectedBrollClip) {
    if (!fs.existsSync(clip.localPath)) return;
    const stats = fs.statSync(clip.localPath);
    const entry: BrollCacheEntry = {
      id: clip.id,
      provider: 'pexels',
      localPath: clip.localPath,
      fileSizeBytes: stats.size,
      width: clip.width,
      height: clip.height,
      duration: clip.duration,
      downloadedAt: new Date().toISOString(),
    };
    this.memoryIndex.set(String(clip.id), entry);
    this.persistIndex();
  }
}
