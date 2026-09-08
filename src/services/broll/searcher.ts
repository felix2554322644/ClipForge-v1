import path from 'path';
import { BrollSelectionArtifact, ScenePlanArtifact, SelectedBrollClip } from '../../contracts/artifacts';
import { IBrollProvider } from '../pexels/provider';
import { BrollScorer } from './scorer';
import { BrollCache } from './cache';
import { PipelineLogger } from '../logging/logger';

export class BrollSearcher {
  private scorer: BrollScorer;
  private cache: BrollCache;

  constructor(
    private provider: IBrollProvider,
    private cacheDir: string,
    private logger: PipelineLogger
  ) {
    this.scorer = new BrollScorer();
    this.cache = new BrollCache(cacheDir);
  }

  public async selectBrollForScenes(
    scenePlan: ScenePlanArtifact,
    jobArtifactsDir: string
  ): Promise<BrollSelectionArtifact> {
    this.logger.stageStart('broll_selection', `${scenePlan.scenes.length} scenes to source`);

    const brollStorageDir = path.join(this.cacheDir, 'footage');
    const previouslySelectedIds = new Set<string | number>();
    const selections: BrollSelectionArtifact['selections'] = [];
    let cacheHits = 0;
    let downloads = 0;

    for (let i = 0; i < scenePlan.scenes.length; i++) {
      const scene = scenePlan.scenes[i];
      this.logger.stageProgress('broll_selection', `Evaluating B-roll for ${scene.sceneId} (${scene.targetDurationSec}s)`);

      // Search across provided queries
      const allCandidates = [];
      for (const query of scene.pexelsSearchQueries.slice(0, 2)) {
        const results = await this.provider.searchVideos(query, {
          perPage: 5,
          minDurationSec: Math.ceil(scene.targetDurationSec),
        });
        allCandidates.push(...results);
      }

      // Deduplicate candidates
      const uniqueCandidatesMap = new Map();
      for (const c of allCandidates) {
        uniqueCandidatesMap.set(String(c.id), c);
      }
      const uniqueCandidates = Array.from(uniqueCandidatesMap.values());

      // Score all candidates
      const scoredCandidates = uniqueCandidates.map((c) =>
        this.scorer.scoreCandidate(c, scene, previouslySelectedIds)
      );

      // Sort descending by score
      scoredCandidates.sort((a, b) => b.score - a.score);

      // Pick top candidate
      const winningEvaluation = scoredCandidates[0] || {
        id: `fallback_${scene.sceneId}`,
        width: 1080,
        height: 1920,
        duration: Math.max(10, scene.targetDurationSec + 2),
        orientation: 'portrait',
        score: 75,
        factors: { semantic: 70, resolution: 80, orientation: 90, duration: 80, uniqueness: 100 },
        reason: 'Automated fallback selection',
      };

      const winningCandidate = uniqueCandidates.find((c) => String(c.id) === String(winningEvaluation.id)) || {
        id: winningEvaluation.id,
        provider: 'procedural',
        title: `Visual footage for ${scene.sceneId}`,
        width: winningEvaluation.width,
        height: winningEvaluation.height,
        duration: winningEvaluation.duration,
        fps: 30,
        downloadUrl: 'procedural://motion',
        orientation: 'portrait' as const,
        quality: 'hd',
      };

      // Check cache first
      let localPath = '';
      const cached = this.cache.get(winningCandidate.id);
      if (cached) {
        localPath = cached.localPath;
        cacheHits++;
        this.logger.stageProgress('broll_selection', `Cache hit for clip ${winningCandidate.id}`);
      } else {
        localPath = await this.provider.downloadVideo(winningCandidate, brollStorageDir);
        downloads++;
      }

      previouslySelectedIds.add(winningCandidate.id);

      const selectedClip: SelectedBrollClip = {
        id: winningCandidate.id,
        url: winningCandidate.downloadUrl,
        localPath,
        duration: winningCandidate.duration,
        width: winningCandidate.width,
        height: winningCandidate.height,
        fps: winningCandidate.fps,
        orientation: winningCandidate.orientation,
        score: winningEvaluation.score,
        reason: winningEvaluation.reason,
      };

      this.cache.set(selectedClip);

      selections.push({
        sceneId: scene.sceneId,
        selectedClip,
        evaluatedCandidates: scoredCandidates.slice(0, 5),
      });
    }

    const artifact: BrollSelectionArtifact = {
      selections,
      totalSelectedClips: selections.length,
      cacheHits,
      downloads,
      metadata: {
        generatedAt: new Date().toISOString(),
      },
    };

    this.logger.stageCompleted(
      'broll_selection',
      `Selected ${selections.length} clips (${downloads} downloaded, ${cacheHits} cache hits)`
    );

    return artifact;
  }
}
