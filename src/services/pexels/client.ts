import fs from 'fs';
import path from 'path';
import { spawnSync, execSync } from 'child_process';
import { BrollCandidate, BrollSearchOptions, IBrollProvider } from './provider';
import { AppConfig } from '../../config';
import { PipelineLogger } from '../logging/logger';

export class PexelsProvider implements IBrollProvider {
  readonly name = 'pexels';

  constructor(private config: AppConfig, private logger: PipelineLogger) {}

  public isAvailable(): boolean {
    return Boolean(this.config.pexelsApiKey);
  }

  public async searchVideos(query: string, options?: BrollSearchOptions): Promise<BrollCandidate[]> {
    if (!this.isAvailable()) {
      this.logger.info('broll_search', `Pexels API key not configured. Using procedural footage provider for query: "${query}"`);
      return this.generateProceduralCandidates(query, options);
    }

    const perPage = options?.perPage || 8;
    const orientationParam = options?.orientation ? `&orientation=${options.orientation}` : '';
    const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${perPage}${orientationParam}`;

    try {
      this.logger.stageProgress('broll_search', `Searching Pexels API: "${query}" (perPage: ${perPage})`);
      const response = await fetch(url, {
        headers: {
          Authorization: this.config.pexelsApiKey!,
        },
      });

      if (!response.ok) {
        throw new Error(`Pexels API responded with status ${response.status}: ${response.statusText}`);
      }

      const data: any = await response.json();
      const videos = Array.isArray(data.videos) ? data.videos : [];

      const candidates: BrollCandidate[] = [];

      for (const v of videos) {
        const videoFiles = Array.isArray(v.video_files) ? v.video_files : [];
        // Filter for MP4 files
        const mp4Files = videoFiles.filter((f: any) => f.file_type === 'video/mp4' && f.link);
        if (mp4Files.length === 0) continue;

        // Prefer HD (1080p or 720p)
        mp4Files.sort((a: any, b: any) => {
          const resA = (a.width || 0) * (a.height || 0);
          const resB = (b.width || 0) * (b.height || 0);
          return resB - resA;
        });

        const selectedFile = mp4Files.find((f: any) => (f.width >= 1080 || f.height >= 1080)) || mp4Files[0];
        const width = selectedFile.width || v.width || 1920;
        const height = selectedFile.height || v.height || 1080;
        const orientation: 'portrait' | 'landscape' | 'square' =
          height > width ? 'portrait' : height === width ? 'square' : 'landscape';

        candidates.push({
          id: v.id,
          provider: 'pexels',
          title: v.user?.name ? `Video by ${v.user.name}` : `Pexels video ${v.id}`,
          width,
          height,
          duration: v.duration || 10,
          fps: selectedFile.fps || 30,
          downloadUrl: selectedFile.link,
          thumbnailUrl: v.image,
          orientation,
          quality: selectedFile.quality || 'hd',
          queryMatched: query,
        });
      }

      if (candidates.length === 0) {
        this.logger.warn('broll_search', `No Pexels candidates for "${query}". Using procedural candidate.`);
        return this.generateProceduralCandidates(query, options);
      }

      return candidates;
    } catch (err: any) {
      this.logger.stageError('broll_search', err);
      if (this.config.allowFallbacks) {
        this.logger.warn('broll_search', `Pexels query "${query}" failed; falling back to procedural candidate.`);
        return this.generateProceduralCandidates(query, options);
      }
      throw err;
    }
  }

  public async downloadVideo(candidate: BrollCandidate, destinationDir: string): Promise<string> {
    if (!fs.existsSync(destinationDir)) {
      fs.mkdirSync(destinationDir, { recursive: true });
    }

    const localFileName = `clip_${candidate.id}_${candidate.width}x${candidate.height}.mp4`;
    const localFilePath = path.join(destinationDir, localFileName);

    if (fs.existsSync(localFilePath) && fs.statSync(localFilePath).size > 1000) {
      try {
        execSync(`${this.config.ffprobeBin} -v error "${localFilePath}"`, { stdio: 'pipe' });
        this.logger.stageProgress('broll_search', `Using cached B-roll file: ${localFilePath}`);
        return localFilePath;
      } catch {
        this.logger.warn('broll_search', `Corrupted cached file detected at ${localFilePath}, regenerating...`);
        try { fs.unlinkSync(localFilePath); } catch {}
      }
    }

    if (candidate.provider === 'procedural') {
      return this.renderProceduralVideoFile(candidate, localFilePath);
    }

    this.logger.stageProgress('broll_search', `Downloading B-roll candidate ${candidate.id} from ${candidate.downloadUrl.slice(0, 40)}...`);

    const res = await fetch(candidate.downloadUrl);
    if (!res.ok) {
      throw new Error(`Failed to download B-roll clip ${candidate.id}: HTTP ${res.status}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const tempFilePath = `${localFilePath}.tmp_${Date.now()}`;
    fs.writeFileSync(tempFilePath, buffer);
    fs.renameSync(tempFilePath, localFilePath);
    this.logger.stageProgress('broll_search', `Saved clip ${candidate.id} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
    return localFilePath;
  }

  private generateProceduralCandidates(query: string, options?: BrollSearchOptions): BrollCandidate[] {
    const minDur = options?.minDurationSec || 12;
    return [
      {
        id: `proc_${Buffer.from(query).toString('hex').slice(0, 8)}_a`,
        provider: 'procedural',
        title: `Procedural Cosmic Motion: ${query}`,
        width: 1080,
        height: 1920,
        duration: minDur,
        fps: 30,
        downloadUrl: 'procedural://motion_a',
        orientation: 'portrait',
        quality: 'procedural_hd',
        queryMatched: query,
      },
      {
        id: `proc_${Buffer.from(query).toString('hex').slice(0, 8)}_b`,
        provider: 'procedural',
        title: `Procedural Stellar Field: ${query}`,
        width: 1920,
        height: 1080,
        duration: minDur,
        fps: 30,
        downloadUrl: 'procedural://motion_b',
        orientation: 'landscape',
        quality: 'procedural_hd',
        queryMatched: query,
      },
    ];
  }

  private renderProceduralVideoFile(candidate: BrollCandidate, targetPath: string): string {
    const duration = candidate.duration || 10;
    const width = candidate.width;
    const height = candidate.height;
    const isPortrait = height > width;

    // Generate clean animated visual pattern using fast FFmpeg test filters
    const filter = isPortrait
      ? `testsrc=size=${width}x${height}:rate=30,drawbox=x=100:y=200:w=${width - 200}:h=${height - 400}:color=navy@0.7:t=fill,boxblur=luma_radius=12:luma_power=2`
      : `testsrc=size=${width}x${height}:rate=30,drawbox=x=200:y=100:w=${width - 400}:h=${height - 200}:color=midnightblue@0.7:t=fill,boxblur=luma_radius=12:luma_power=2`;

    const tempPath = `${targetPath}.tmp_${Date.now()}.mp4`;
    const args = [
      '-y',
      '-f', 'lavfi',
      '-i', filter,
      '-t', String(duration),
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'ultrafast',
      tempPath,
    ];

    const res = spawnSync(this.config.ffmpegBin, args, { stdio: 'pipe' });
    if (res.status !== 0 || !fs.existsSync(tempPath)) {
      try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
      throw new Error(`Failed to generate procedural video: ${res.stderr?.toString()}`);
    }

    fs.renameSync(tempPath, targetPath);
    return targetPath;
  }
}
