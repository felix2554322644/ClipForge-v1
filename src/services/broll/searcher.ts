import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { PexelsClient } from '../pexels/client';
import { BrollScorer } from './scorer';
import { BrollCache } from './cache';
import { VideoReframer } from '../media/reframing';
import { EditingPrimitives } from '../media/primitives';
import {
  BrollCandidate,
  PlannedScene,
  PlannedShot,
  SelectedBrollScene,
} from '../../types/pipeline';
import { PipelineLogger } from '../logging/logger';
import { CONFIG } from '../../config/index';

export class BrollSearcher {
  private pexels: PexelsClient;
  private cache: BrollCache;

  constructor(private logger: PipelineLogger) {
    this.pexels = new PexelsClient();
    this.cache = new BrollCache();
  }

  /**
   * Selects, scores, downloads, reframes, and verifies B-roll for each planned shot.
   */
  async selectBrollForScenes(scenes: PlannedScene[], jobDir: string): Promise<SelectedBrollScene[]> {
    // Extract all shots or treat scenes as single-shot fallbacks
    const shotsToProcess: { sceneIndex: number; shot: PlannedShot }[] = [];

    for (const scene of scenes) {
      if (scene.shots && scene.shots.length > 0) {
        for (const shot of scene.shots) {
          shotsToProcess.push({ sceneIndex: scene.index, shot });
        }
      } else {
        // Backward-compatibility fallback if scene has no shots array
        const fallbackShot: PlannedShot = {
          id: `scene_${scene.index}_shot_0`,
          sceneIndex: scene.index,
          shotIndex: 0,
          narrationClause: scene.narration,
          durationSeconds: scene.durationSeconds,
          pacingType: 'normal',
          brollQueries: scene.brollQuery || ['deep space galaxy'],
          motionEffect: scene.motionEffect || 'zoom_in',
          transition: 'cut',
          captionText: scene.captionText || scene.narration,
        };
        shotsToProcess.push({ sceneIndex: scene.index, shot: fallbackShot });
      }
    }

    this.logger.stage(
      'BROLL_SELECTION',
      `Selecting and scoring B-roll footage for ${shotsToProcess.length} visual shots across ${scenes.length} scenes`
    );

    const footageDir = path.join(jobDir, 'footage');
    if (!fs.existsSync(footageDir)) {
      fs.mkdirSync(footageDir, { recursive: true });
    }

    const selections: SelectedBrollScene[] = [];
    const usedClipIds = new Set<string>();

    for (let i = 0; i < shotsToProcess.length; i++) {
      const { sceneIndex, shot } = shotsToProcess[i];
      const targetDuration = shot.durationSeconds;
      const queries = shot.brollQueries && shot.brollQueries.length > 0
        ? shot.brollQueries
        : ['deep space galaxy', 'space astronomy'];

      this.logger.info(
        `[Shot ${i + 1}/${shotsToProcess.length}] Scene ${sceneIndex} Shot ${shot.shotIndex} (${targetDuration.toFixed(1)}s): Queries=[${queries.slice(0, 2).join(', ')}]`
      );

      let bestCandidate: BrollCandidate | null = null;

      // 1. Search Pexels if available
      if (this.pexels.isAvailable()) {
        try {
          const scoredCandidates: BrollCandidate[] = [];

          for (const query of queries.slice(0, 2)) {
            const videos = await this.pexels.searchVideos(query, 'portrait');
            for (const video of videos.slice(0, 4)) {
              const file = video.video_files.find((f) => f.height >= 1280) ||
                video.video_files.find((f) => f.width >= 720) ||
                video.video_files[0];

              if (!file) continue;

              const evaluation = BrollScorer.evaluateCandidate(
                {
                  id: String(video.id),
                  width: file.width,
                  height: file.height,
                  duration: video.duration,
                  url: file.link,
                },
                targetDuration,
                CONFIG.TARGET_WIDTH / CONFIG.TARGET_HEIGHT,
                usedClipIds,
                query
              );

              scoredCandidates.push({
                id: `pexels_${video.id}`,
                url: file.link,
                videoPath: '',
                originalWidth: file.width,
                originalHeight: file.height,
                aspectRatio: file.width / file.height,
                durationSeconds: video.duration,
                relevanceScore: evaluation.score,
                scoreBreakdown: evaluation.breakdown,
                selectionReason: evaluation.reason,
                source: 'pexels',
              });
            }
          }

          // Sort by highest score
          scoredCandidates.sort((a, b) => b.relevanceScore - a.relevanceScore);

          if (scoredCandidates.length > 0) {
            const selectedMeta = scoredCandidates[0];
            const localClipPath = path.join(footageDir, `${shot.id}_${selectedMeta.id}.mp4`);

            this.logger.info(
              `Downloading candidate ${selectedMeta.id} (Score: ${selectedMeta.relevanceScore}, ${selectedMeta.originalWidth}x${selectedMeta.originalHeight})`
            );

            execSync(`curl -sSL --retry 3 -o "${localClipPath}" "${selectedMeta.url}"`, { stdio: 'pipe' });

            if (fs.existsSync(localClipPath) && fs.statSync(localClipPath).size > 10000) {
              bestCandidate = {
                ...selectedMeta,
                videoPath: localClipPath,
              };
              usedClipIds.add(selectedMeta.id);
            }
          }
        } catch (err) {
          this.logger.warn(`Pexels search for shot ${shot.id} encountered error: ${(err as Error).message}`);
        }
      }

      // 2. Procedural synthesis fallback (offline or when Pexels has no valid results)
      if (!bestCandidate) {
        const theme = queries[0] || 'galaxy space';
        const procPath = path.join(footageDir, `${shot.id}_procedural.mp4`);

        this.logger.info(
          `Synthesizing distinct procedural vertical footage for shot ${shot.id} (Theme: "${theme}")...`
        );

        EditingPrimitives.generateProceduralFootage(
          procPath,
          Math.max(targetDuration + 1.5, 4.0),
          theme,
          CONFIG.TARGET_WIDTH,
          CONFIG.TARGET_HEIGHT,
          CONFIG.TARGET_FPS
        );

        const evaluation = BrollScorer.evaluateCandidate(
          {
            id: `proc_${shot.id}`,
            width: CONFIG.TARGET_WIDTH,
            height: CONFIG.TARGET_HEIGHT,
            duration: targetDuration + 1.5,
          },
          targetDuration,
          CONFIG.TARGET_WIDTH / CONFIG.TARGET_HEIGHT,
          usedClipIds,
          theme
        );

        bestCandidate = {
          id: `proc_${shot.id}`,
          url: `procedural://${encodeURIComponent(theme)}`,
          videoPath: procPath,
          originalWidth: CONFIG.TARGET_WIDTH,
          originalHeight: CONFIG.TARGET_HEIGHT,
          aspectRatio: CONFIG.TARGET_WIDTH / CONFIG.TARGET_HEIGHT,
          durationSeconds: targetDuration + 1.5,
          relevanceScore: evaluation.score,
          scoreBreakdown: evaluation.breakdown,
          selectionReason: evaluation.reason,
          source: 'procedural',
        };
        usedClipIds.add(bestCandidate.id);
      }

      // 3. Reframe if aspect ratio is not vertical
      let finalVideoPath = bestCandidate.videoPath;
      if (bestCandidate.aspectRatio > 0.65) {
        const reframedPath = path.join(footageDir, `${shot.id}_reframed.mp4`);
        this.logger.info(`Reframing landscape clip to 9:16 portrait: ${reframedPath}`);
        VideoReframer.reframeToPortrait(bestCandidate.videoPath, reframedPath);
        finalVideoPath = reframedPath;
      }

      selections.push({
        sceneIndex,
        shotId: shot.id,
        shotIndex: shot.shotIndex,
        broll: bestCandidate,
        inPoint: 0,
        outPoint: targetDuration,
        reframedPath: finalVideoPath,
        scoreBreakdown: bestCandidate.scoreBreakdown,
        selectionReason: bestCandidate.selectionReason,
      });
    }

    this.logger.info(`B-roll selection completed for all ${selections.length} shots`);
    return selections;
  }
}
