import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { BrollProvider, NormalizedBrollVideo } from './provider';
import { PexelsProvider } from '../pexels/provider';
import { PixabayProvider } from '../pixabay/provider';
import { BrollScorer, ScorerEvaluation } from './scorer';
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
  private providers: BrollProvider[];
  private cache: BrollCache;

  constructor(
    private logger: PipelineLogger,
    customProviders?: BrollProvider[]
  ) {
    if (customProviders && customProviders.length > 0) {
      this.providers = customProviders;
    } else {
      this.providers = [new PexelsProvider(), new PixabayProvider()];
    }
    this.cache = new BrollCache();
  }

  /**
   * Selects, cross-scores, downloads, and reframes native vertical B-roll
   * from multiple providers (Pexels, Pixabay) with procedural fallback.
   */
  async selectBrollForScenes(
    scenes: PlannedScene[],
    jobDir: string
  ): Promise<SelectedBrollScene[]> {
    const shotsToProcess: { sceneIndex: number; shot: PlannedShot }[] = [];

    for (const scene of scenes) {
      if (scene.shots && scene.shots.length > 0) {
        for (const shot of scene.shots) {
          shotsToProcess.push({ sceneIndex: scene.index, shot });
        }
      } else {
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

    const availableProviders = this.providers
      .filter((p) => p.isAvailable())
      .map((p) => p.name);

    this.logger.stage(
      'BROLL_SELECTION',
      `Selecting native vertical B-roll for ${shotsToProcess.length} shots across ${scenes.length} scenes (Active providers: ${availableProviders.join(', ') || 'Procedural only'})`
    );

    const footageDir = path.join(jobDir, 'footage');
    if (!fs.existsSync(footageDir)) {
      fs.mkdirSync(footageDir, { recursive: true });
    }

    const selections: SelectedBrollScene[] = [];
    const usedClipKeys = new Set<string>();

    for (let i = 0; i < shotsToProcess.length; i++) {
      const { sceneIndex, shot } = shotsToProcess[i];
      const targetDuration = shot.durationSeconds;
      const initialQueries =
        shot.brollQueries && shot.brollQueries.length > 0
          ? shot.brollQueries
          : ['deep space galaxy', 'space astronomy'];

      // Build expanded query set to find native vertical footage if specific term yields no portrait
      const expandedQueries = this.expandQueries(initialQueries);

      this.logger.info(
        `[Shot ${i + 1}/${shotsToProcess.length}] Scene ${sceneIndex} Shot ${shot.shotIndex} (${targetDuration.toFixed(1)}s): Queries=[${initialQueries.slice(0, 2).join(', ')}]`
      );

      let bestCandidate: BrollCandidate | null = null;
      let queryUsed = initialQueries[0];

      // 1. Cross-provider search across Pexels and Pixabay
      const scoredCandidates: {
        raw: NormalizedBrollVideo;
        eval: ScorerEvaluation;
        query: string;
      }[] = [];

      for (const query of expandedQueries) {
        for (const provider of this.providers) {
          if (!provider.isAvailable()) continue;

          try {
            const results = await provider.searchVideos(query, 'portrait');

            for (const item of results) {
              // Hard landscape rejection check
              if (item.width > item.height && !CONFIG.ALLOW_LANDSCAPE_FALLBACK) {
                continue;
              }

              const evaluation = BrollScorer.evaluateCandidate(
                {
                  id: item.id,
                  provider: item.provider,
                  providerAssetId: item.providerAssetId,
                  width: item.width,
                  height: item.height,
                  duration: item.durationSeconds,
                  url: item.downloadUrl,
                  tags: item.tags,
                },
                targetDuration,
                CONFIG.TARGET_WIDTH / CONFIG.TARGET_HEIGHT,
                usedClipKeys,
                query
              );

              if (evaluation.isRejected) {
                continue;
              }

              scoredCandidates.push({
                raw: item,
                eval: evaluation,
                query,
              });
            }
          } catch (err: any) {
            this.logger.warn(`Provider ${provider.name} query "${query}" failed: ${err.message}`);
          }
        }

        // If we found strong vertical candidates for initial queries, avoid extra network calls
        if (scoredCandidates.length >= 3 && scoredCandidates.some((c) => c.eval.score >= 70)) {
          break;
        }
      }

      // Sort by highest score (combining native portrait, resolution, duration, uniqueness)
      scoredCandidates.sort((a, b) => b.eval.score - a.eval.score);

      if (scoredCandidates.length > 0) {
        // Download best candidate
        for (const candidateEntry of scoredCandidates) {
          const item = candidateEntry.raw;
          const localClipPath = path.join(
            footageDir,
            `${shot.id}_${item.provider}_${item.providerAssetId}.mp4`
          );

          this.logger.info(
            `Selected ${item.provider.toUpperCase()} candidate ${item.providerAssetId} (Score: ${candidateEntry.eval.score}, ${item.width}x${item.height} ${item.nativeVertical ? 'Native 9:16' : 'Portrait'})`
          );

          try {
            execSync(`curl -sSL --retry 3 -o "${localClipPath}" "${item.downloadUrl}"`, {
              stdio: 'pipe',
            });

            if (fs.existsSync(localClipPath) && fs.statSync(localClipPath).size > 10000) {
              const targetRatio = CONFIG.TARGET_WIDTH / CONFIG.TARGET_HEIGHT;
              const cropRequired = Math.abs(item.aspectRatio - targetRatio) > 0.05;
              const cropAmount = cropRequired
                ? Math.round(Math.abs(item.aspectRatio - targetRatio) * 100)
                : 0;

              bestCandidate = {
                id: item.id,
                url: item.downloadUrl,
                videoPath: localClipPath,
                originalWidth: item.width,
                originalHeight: item.height,
                aspectRatio: item.aspectRatio,
                durationSeconds: item.durationSeconds,
                relevanceScore: candidateEntry.eval.score,
                source: item.provider,
                provider: item.provider,
                providerAssetId: item.providerAssetId,
                nativeVertical: item.nativeVertical,
                cropRequired,
                cropAmount,
                scoreBreakdown: candidateEntry.eval.breakdown,
                selectionReason: candidateEntry.eval.reason,
                queryUsed: candidateEntry.query,
              };

              queryUsed = candidateEntry.query;
              usedClipKeys.add(item.id);
              usedClipKeys.add(item.providerAssetId);
              break;
            }
          } catch (dlErr: any) {
            this.logger.warn(
              `Failed downloading ${item.provider} clip ${item.providerAssetId}: ${dlErr.message}`
            );
          }
        }
      }

      // 2. Procedural Fallback if no provider candidate was available or downloadable
      if (!bestCandidate) {
        const theme = initialQueries[0] || 'galaxy space';
        const procPath = path.join(footageDir, `${shot.id}_procedural.mp4`);

        this.logger.info(
          `Synthesizing native 1080x1920 vertical procedural footage for shot ${shot.id} (Theme: "${theme}")...`
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
            provider: 'procedural',
            providerAssetId: shot.id,
            width: CONFIG.TARGET_WIDTH,
            height: CONFIG.TARGET_HEIGHT,
            duration: targetDuration + 1.5,
          },
          targetDuration,
          CONFIG.TARGET_WIDTH / CONFIG.TARGET_HEIGHT,
          usedClipKeys,
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
          source: 'procedural',
          provider: 'procedural',
          providerAssetId: shot.id,
          nativeVertical: true,
          cropRequired: false,
          cropAmount: 0,
          scoreBreakdown: evaluation.breakdown,
          selectionReason: evaluation.reason,
          queryUsed: theme,
        };
        usedClipKeys.add(bestCandidate.id);
      }

      // 3. Reframe if aspect ratio requires minor crop to reach exact 9:16 (e.g. 4:5 to 9:16)
      let finalVideoPath = bestCandidate.videoPath;
      if (bestCandidate.aspectRatio > 0.65) {
        const reframedPath = path.join(footageDir, `${shot.id}_reframed.mp4`);
        this.logger.info(`Reframing clip to 9:16 portrait: ${reframedPath}`);
        VideoReframer.reframeToPortrait(bestCandidate.videoPath, reframedPath);
        finalVideoPath = reframedPath;
      }

      selections.push({
        sceneIndex,
        shotId: shot.id,
        shotIndex: shot.shotIndex,
        provider: bestCandidate.provider || bestCandidate.source,
        providerAssetId: bestCandidate.providerAssetId || bestCandidate.id,
        nativeVertical: bestCandidate.nativeVertical,
        sourceDimensions: {
          width: bestCandidate.originalWidth,
          height: bestCandidate.originalHeight,
        },
        sourceAspectRatio: Math.round(bestCandidate.aspectRatio * 1000) / 1000,
        cropRequired: bestCandidate.cropRequired,
        cropAmount: bestCandidate.cropAmount,
        queryUsed,
        broll: bestCandidate,
        inPoint: Math.max(0, bestCandidate.durationSeconds > targetDuration + 1.0 ? 0.8 : 0),
        outPoint: Math.round((Math.max(0, bestCandidate.durationSeconds > targetDuration + 1.0 ? 0.8 : 0) + targetDuration) * 100) / 100,
        reframedPath: finalVideoPath,
        scoreBreakdown: bestCandidate.scoreBreakdown,
        selectionReason: bestCandidate.selectionReason,
      });
    }

    this.logger.info(
      `Native vertical B-roll selection complete: ${selections.length} shots processed`
    );
    return selections;
  }

  /**
   * Intelligently expands visual search queries if narrow terms fail to return portrait footage.
   */
  private expandQueries(queries: string[]): string[] {
    const expanded = new Set<string>();

    for (const q of queries) {
      expanded.add(q);
      const lower = q.toLowerCase();

      if (lower.includes('magnetar') || lower.includes('pulsar')) {
        expanded.add('neutron star space');
        expanded.add('spinning star core');
        expanded.add('cosmic energy burst');
      } else if (lower.includes('telescope') || lower.includes('observatory')) {
        expanded.add('radio dish night sky');
        expanded.add('astronomy starry night');
      } else if (lower.includes('signal') || lower.includes('radio wave')) {
        expanded.add('cosmic light beam');
        expanded.add('deep space stars');
      } else {
        expanded.add('deep space galaxy');
        expanded.add('starry nebula universe');
      }
    }

    return Array.from(expanded).slice(0, 4);
  }
}
