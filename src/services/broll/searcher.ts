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
  BrollProviderName,
  PlannedScene,
  PlannedShot,
  SelectedBrollScene,
} from '../../types/pipeline';
import { PipelineLogger } from '../logging/logger';
import { CONFIG } from '../../config/index';

/**
 * Normalizes a source or download URL for canonical comparison.
 * Strips protocol, www prefix, query strings, hashes, and trailing slashes.
 */
export function normalizeSourceUrl(url?: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const pathname = parsed.pathname.replace(/\/+$/, '').toLowerCase();
    return `${host}${pathname}`;
  } catch {
    return trimmed
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('?')[0]
      .split('#')[0]
      .replace(/\/+$/, '');
  }
}

/**
 * Tracks assets already selected within the current video generation session.
 * Considers providerAssetId, asset id, and normalized source URLs as duplicates.
 */
export class UsedAssetTracker {
  private usedIds = new Set<string>();
  private usedProviderAssetIds = new Set<string>();
  private usedNormalizedUrls = new Set<string>();

  markSelected(asset: {
    id?: string;
    providerAssetId?: string;
    sourceUrl?: string;
    downloadUrl?: string;
    url?: string;
  }): void {
    if (asset.id && typeof asset.id === 'string' && asset.id.trim().length > 0) {
      this.usedIds.add(asset.id.trim());
    }
    if (
      asset.providerAssetId !== undefined &&
      asset.providerAssetId !== null &&
      String(asset.providerAssetId).trim().length > 0
    ) {
      this.usedProviderAssetIds.add(String(asset.providerAssetId).trim());
    }
    const urls = this.extractNormalizedUrls(asset);
    for (const u of urls) {
      this.usedNormalizedUrls.add(u);
    }
  }

  isDuplicate(candidate: {
    id?: string;
    providerAssetId?: string;
    sourceUrl?: string;
    downloadUrl?: string;
    url?: string;
  }): boolean {
    if (
      candidate.id &&
      typeof candidate.id === 'string' &&
      this.usedIds.has(candidate.id.trim())
    ) {
      return true;
    }
    if (
      candidate.providerAssetId !== undefined &&
      candidate.providerAssetId !== null &&
      this.usedProviderAssetIds.has(String(candidate.providerAssetId).trim())
    ) {
      return true;
    }
    const urls = this.extractNormalizedUrls(candidate);
    for (const u of urls) {
      if (this.usedNormalizedUrls.has(u)) {
        return true;
      }
    }
    return false;
  }

  private extractNormalizedUrls(item: {
    sourceUrl?: string;
    downloadUrl?: string;
    url?: string;
  }): string[] {
    const urls: string[] = [];
    if (item.sourceUrl) {
      const norm = normalizeSourceUrl(item.sourceUrl);
      if (norm) urls.push(norm);
    }
    if (item.downloadUrl) {
      const norm = normalizeSourceUrl(item.downloadUrl);
      if (norm) urls.push(norm);
    }
    if (item.url) {
      const norm = normalizeSourceUrl(item.url);
      if (norm) urls.push(norm);
    }
    return urls;
  }

  getUsedIdsSet(): Set<string> {
    const combined = new Set<string>();
    for (const id of this.usedIds) combined.add(id);
    for (const pid of this.usedProviderAssetIds) combined.add(pid);
    for (const u of this.usedNormalizedUrls) combined.add(u);
    return combined;
  }
}

export interface ScoredCandidateEntry {
  raw: NormalizedBrollVideo;
  eval: ScorerEvaluation;
  query: string;
}

export interface BrollSearcherOptions {
  providers?: BrollProvider[];
  cache?: BrollCache;
  downloader?: (url: string, destPath: string) => Promise<boolean> | boolean;
}

export class BrollSearcher {
  private providers: BrollProvider[];
  private cache: BrollCache;
  private customDownloader?: (url: string, destPath: string) => Promise<boolean> | boolean;

  constructor(
    private logger: PipelineLogger,
    customProvidersOrOptions?: BrollProvider[] | BrollSearcherOptions
  ) {
    if (Array.isArray(customProvidersOrOptions)) {
      this.providers =
        customProvidersOrOptions.length > 0
          ? customProvidersOrOptions
          : [new PexelsProvider(), new PixabayProvider()];
      this.cache = new BrollCache();
    } else if (customProvidersOrOptions && typeof customProvidersOrOptions === 'object') {
      this.providers =
        customProvidersOrOptions.providers && customProvidersOrOptions.providers.length > 0
          ? customProvidersOrOptions.providers
          : [new PexelsProvider(), new PixabayProvider()];
      this.cache = customProvidersOrOptions.cache || new BrollCache();
      this.customDownloader = customProvidersOrOptions.downloader;
    } else {
      this.providers = [new PexelsProvider(), new PixabayProvider()];
      this.cache = new BrollCache();
    }
  }

  /**
   * Helper to normalize source URL
   */
  public static normalizeSourceUrl(url?: string): string {
    return normalizeSourceUrl(url);
  }

  /**
   * Ranks candidates prioritizing semantic relevance and visual quality.
   * When candidates are of comparable quality (scores within comparableDelta),
   * preference is given to alternating between Pexels and Pixabay.
   */
  public static rankCandidates<T extends ScoredCandidateEntry>(
    candidates: T[],
    lastSelectedProvider: BrollProviderName | null = null,
    comparableDelta = 5.0
  ): T[] {
    const getCandidateEffectiveScore = (cand: T): number => {
      const isAlternate =
        Boolean(lastSelectedProvider) &&
        (lastSelectedProvider === 'pexels' || lastSelectedProvider === 'pixabay') &&
        cand.raw.provider !== lastSelectedProvider &&
        cand.raw.provider !== 'procedural';

      return cand.eval.score + (isAlternate ? comparableDelta + 0.1 : 0);
    };

    return [...candidates].sort((a, b) => {
      const effA = getCandidateEffectiveScore(a);
      const effB = getCandidateEffectiveScore(b);
      const effDiff = effB - effA;

      if (Math.abs(effDiff) > 0.001) {
        return effDiff;
      }
      const baseDiff = b.eval.score - a.eval.score;
      if (Math.abs(baseDiff) > 0.001) {
        return baseDiff;
      }
      return (b.eval.breakdown.semantic || 0) - (a.eval.breakdown.semantic || 0);
    });
  }

  /**
   * Selects, cross-scores, downloads, and reframes native vertical B-roll
   * from multiple providers (Pexels, Pixabay) with procedural fallback.
   * Enforces strict duplicate exclusion across providerAssetId, id, and sourceUrl.
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
    const usedAssetTracker = new UsedAssetTracker();
    let lastSelectedProvider: BrollProviderName | null = null;

    for (let i = 0; i < shotsToProcess.length; i++) {
      const { sceneIndex, shot } = shotsToProcess[i];
      const targetDuration = shot.durationSeconds;
      const initialQueries =
        shot.brollQueries && shot.brollQueries.length > 0
          ? shot.brollQueries
          : ['deep space galaxy', 'space astronomy'];

      // Build expanded query set to find native vertical footage
      const expandedQueries = this.expandQueries(initialQueries);

      this.logger.info(
        `[Shot ${i + 1}/${shotsToProcess.length}] Scene ${sceneIndex} Shot ${shot.shotIndex} (${targetDuration.toFixed(1)}s): Queries=[${initialQueries.slice(0, 2).join(', ')}]`
      );

      let bestCandidate: BrollCandidate | null = null;
      let queryUsed = initialQueries[0];

      // 1. Cross-provider search across Pexels and Pixabay with expanded candidate pool
      const scoredCandidates: ScoredCandidateEntry[] = [];
      const seenCandidateKeys = new Set<string>();

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

              // HARD REJECT duplicate assets already selected in this video before scoring or pooling
              if (usedAssetTracker.isDuplicate(item)) {
                continue;
              }

              // Avoid duplicate identical candidate within the same shot across multiple query terms
              const candidateKey = `${item.provider}_${item.providerAssetId || item.id}`;
              if (seenCandidateKeys.has(candidateKey)) {
                continue;
              }
              seenCandidateKeys.add(candidateKey);

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
                usedAssetTracker.getUsedIdsSet(),
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

        // Expanded candidate collection: do NOT stop early on only 3 candidates.
        // Only stop if we have gathered an abundant pool of distinct vertical alternatives.
        if (
          scoredCandidates.length >= 20 &&
          scoredCandidates.filter((c) => c.eval.score >= 75).length >= 8
        ) {
          break;
        }
      }

      // Rank candidates: primary semantic quality, with provider alternation when quality is comparable
      const rankedCandidates: ScoredCandidateEntry[] = BrollSearcher.rankCandidates(
        scoredCandidates,
        lastSelectedProvider
      );

      if (rankedCandidates.length > 0) {
        for (const candidateEntry of rankedCandidates) {
          const item = candidateEntry.raw;

          // HARD-REJECT duplicate selected assets before final selection
          if (usedAssetTracker.isDuplicate(item)) {
            this.logger.info(
              `Hard-rejecting duplicate candidate ${item.id} (${item.providerAssetId})`
            );
            continue;
          }

          const localClipPath = path.join(
            footageDir,
            `${shot.id}_${item.provider}_${item.providerAssetId}.mp4`
          );

          this.logger.info(
            `Selected ${item.provider.toUpperCase()} candidate ${item.providerAssetId} (Score: ${candidateEntry.eval.score}, ${item.width}x${item.height} ${item.nativeVertical ? 'Native 9:16' : 'Portrait'})`
          );

          const downloaded = await this.downloadFootage(item, localClipPath, candidateEntry.query);

          if (downloaded) {
            const targetRatio = CONFIG.TARGET_WIDTH / CONFIG.TARGET_HEIGHT;
            const cropRequired = Math.abs(item.aspectRatio - targetRatio) > 0.05;
            const cropAmount = cropRequired
              ? Math.round(Math.abs(item.aspectRatio - targetRatio) * 100)
              : 0;

            bestCandidate = {
              id: item.id,
              url: item.downloadUrl,
              sourceUrl: item.sourceUrl,
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
            usedAssetTracker.markSelected(item);
            usedAssetTracker.markSelected(bestCandidate);
            lastSelectedProvider = item.provider;
            break;
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
          usedAssetTracker.getUsedIdsSet(),
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
        usedAssetTracker.markSelected(bestCandidate);
        lastSelectedProvider = 'procedural';
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
        sourceUrl: bestCandidate.sourceUrl,
        broll: bestCandidate,
        inPoint: Math.max(0, bestCandidate.durationSeconds > targetDuration + 1.0 ? 0.8 : 0),
        outPoint:
          Math.round(
            (Math.max(0, bestCandidate.durationSeconds > targetDuration + 1.0 ? 0.8 : 0) +
              targetDuration) *
              100
          ) / 100,
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
   * Resolves footage file: checking custom downloader, local paths, BrollCache, and network download.
   */
  private async downloadFootage(
    item: NormalizedBrollVideo,
    localClipPath: string,
    query: string
  ): Promise<boolean> {
    const cacheKey = item.providerAssetId ? `${item.provider}_${item.providerAssetId}` : item.id;

    // 1. Check custom downloader (for testing or external fetching)
    if (this.customDownloader) {
      try {
        const ok = await this.customDownloader(item.downloadUrl, localClipPath);
        if (ok && fs.existsSync(localClipPath) && fs.statSync(localClipPath).size > 0) {
          return true;
        }
      } catch (err: any) {
        this.logger.warn(`Custom downloader failed for ${item.id}: ${err.message}`);
      }
    }

    // 2. Direct local file or file protocol
    if (fs.existsSync(item.downloadUrl)) {
      try {
        fs.copyFileSync(item.downloadUrl, localClipPath);
        return true;
      } catch {}
    }
    if (item.downloadUrl.startsWith('file://')) {
      const localP = item.downloadUrl.replace(/^file:\/\//, '');
      if (fs.existsSync(localP)) {
        try {
          fs.copyFileSync(localP, localClipPath);
          return true;
        } catch {}
      }
    }

    // 3. Test / mock protocol
    if (item.downloadUrl.startsWith('test://') || item.downloadUrl.startsWith('mock://')) {
      try {
        fs.writeFileSync(localClipPath, Buffer.alloc(15000, 1));
        return true;
      } catch {}
    }

    // 4. Check BrollCache
    const cachedPath = this.cache.get(cacheKey);
    if (cachedPath && fs.existsSync(cachedPath)) {
      try {
        fs.copyFileSync(cachedPath, localClipPath);
        this.logger.info(`Loaded candidate ${item.providerAssetId} from BrollCache: ${cachedPath}`);
        return true;
      } catch {}
    }

    // 5. Download over network via curl
    try {
      execSync(`curl -sSL --retry 3 -o "${localClipPath}" "${item.downloadUrl}"`, {
        stdio: 'pipe',
      });

      if (fs.existsSync(localClipPath) && fs.statSync(localClipPath).size > 10000) {
        this.cache.set(cacheKey, localClipPath, item.durationSeconds, query);
        return true;
      }
    } catch (dlErr: any) {
      this.logger.warn(
        `Failed downloading ${item.provider} clip ${item.providerAssetId}: ${dlErr.message}`
      );
    }

    return false;
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
