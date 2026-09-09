import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { PexelsClient } from '../pexels/client';
import { BrollScorer } from './scorer';
import { BrollCache } from './cache';
import { VideoReframer } from '../media/reframing';
import { EditingPrimitives } from '../media/primitives';
import { BrollCandidate, PlannedScene, SelectedBrollScene } from '../../types/pipeline';
import { PipelineLogger } from '../logging/logger';
import { CONFIG } from '../../config/index';

export class BrollSearcher {
  private pexels: PexelsClient;
  private cache: BrollCache;

  constructor(private logger: PipelineLogger) {
    this.pexels = new PexelsClient();
    this.cache = new BrollCache();
  }

  async selectBrollForScenes(scenes: PlannedScene[], jobDir: string): Promise<SelectedBrollScene[]> {
    this.logger.stage('BROLL_SELECTION', `Finding visual footage for ${scenes.length} scenes`);

    const footageDir = path.join(jobDir, 'footage');
    if (!fs.existsSync(footageDir)) {
      fs.mkdirSync(footageDir, { recursive: true });
    }

    const selections: SelectedBrollScene[] = [];

    for (const scene of scenes) {
      const query = scene.brollQuery[0] || 'space galaxy';
      this.logger.info(`Searching footage for scene ${scene.index} ("${query}")`);

      let candidate: BrollCandidate | null = null;

      // Try Pexels if available
      if (this.pexels.isAvailable()) {
        try {
          const videos = await this.pexels.searchVideos(query, 'portrait');
          if (videos.length > 0) {
            const best = videos[0];
            const file = best.video_files.find((f) => f.height >= 1280) || best.video_files[0];

            if (file) {
              const localClipPath = path.join(footageDir, `scene_${scene.index}_pexels_${best.id}.mp4`);
              this.logger.info(`Downloading Pexels clip ${best.id}...`);

              execSync(`curl -sSL --retry 3 -o "${localClipPath}" "${file.link}"`, { stdio: 'pipe' });

              const score = BrollScorer.scoreCandidate(
                { width: file.width, height: file.height, duration: best.duration },
                scene.durationSeconds
              );

              candidate = {
                id: `pexels_${best.id}`,
                url: file.link,
                videoPath: localClipPath,
                originalWidth: file.width,
                originalHeight: file.height,
                aspectRatio: file.width / file.height,
                durationSeconds: best.duration,
                relevanceScore: score,
                source: 'pexels',
              };
            }
          }
        } catch (err) {
          this.logger.warn(`Pexels retrieval failed: ${(err as Error).message}`);
        }
      }

      // Procedural synthesis fallback
      if (!candidate) {
        this.logger.info(`Synthesizing procedural vertical cinematic footage for scene ${scene.index}...`);
        const procPath = path.join(footageDir, `scene_${scene.index}_procedural.mp4`);
        EditingPrimitives.generateProceduralFootage(
          procPath,
          Math.max(scene.durationSeconds + 2, 6),
          query,
          CONFIG.TARGET_WIDTH,
          CONFIG.TARGET_HEIGHT,
          CONFIG.TARGET_FPS
        );

        candidate = {
          id: `proc_${scene.index}`,
          url: 'procedural://galaxy',
          videoPath: procPath,
          originalWidth: CONFIG.TARGET_WIDTH,
          originalHeight: CONFIG.TARGET_HEIGHT,
          aspectRatio: CONFIG.TARGET_WIDTH / CONFIG.TARGET_HEIGHT,
          durationSeconds: scene.durationSeconds + 2,
          relevanceScore: 90,
          source: 'procedural',
        };
      }

      // If clip is not portrait (ratio > 0.65), reframe it
      let finalPath = candidate.videoPath;
      if (candidate.aspectRatio > 0.65) {
        const reframedPath = path.join(footageDir, `scene_${scene.index}_reframed.mp4`);
        this.logger.info(`Reframing landscape clip to 9:16 portrait: ${reframedPath}`);
        VideoReframer.reframeToPortrait(candidate.videoPath, reframedPath);
        finalPath = reframedPath;
      }

      selections.push({
        sceneIndex: scene.index,
        broll: candidate,
        inPoint: 0,
        outPoint: scene.durationSeconds,
        reframedPath: finalPath,
      });
    }

    return selections;
  }
}
