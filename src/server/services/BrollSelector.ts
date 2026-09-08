import { BrollCandidate, CandidateEvaluation, PlannedScene } from '../../types/pipeline.js';

export class BrollSelector {
  public evaluateCandidate(
    candidate: BrollCandidate,
    scene: PlannedScene,
    query: string
  ): CandidateEvaluation {
    const semanticScore = this.scoreSemanticRelevance(candidate, scene, query);
    const aspectScore = this.scoreAspectRatio(candidate);
    const durationScore = this.scoreDuration(candidate, scene.estimatedDurationSec);
    const resolutionScore = this.scoreResolution(candidate);

    const totalScore = parseFloat((semanticScore + aspectScore + durationScore + resolutionScore).toFixed(1));

    const reasoningParts = [
      `Semantic: ${semanticScore}/35`,
      `Aspect: ${aspectScore}/25 (${candidate.aspectRatio.toFixed(2)})`,
      `Duration: ${durationScore}/20 (${candidate.durationSec}s vs req ${scene.estimatedDurationSec}s)`,
      `Resolution: ${resolutionScore}/20 (${candidate.width}x${candidate.height})`,
    ];

    return {
      candidate,
      score: totalScore,
      scoreBreakdown: {
        semanticRelevance: semanticScore,
        aspectRatioSuitability: aspectScore,
        durationAdequacy: durationScore,
        resolutionQuality: resolutionScore,
      },
      reasoning: reasoningParts.join(' | '),
    };
  }

  private scoreSemanticRelevance(candidate: BrollCandidate, scene: PlannedScene, query: string): number {
    const queryTokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    const sceneTokens = scene.visualObjective.toLowerCase().split(/\s+/).filter(t => t.length > 3);
    const candidateText = `${candidate.title} ${candidate.tags.join(' ')}`.toLowerCase();

    let matchedTokens = 0;
    queryTokens.forEach(t => {
      if (candidateText.includes(t)) matchedTokens++;
    });

    let matchedSceneTokens = 0;
    sceneTokens.forEach(t => {
      if (candidateText.includes(t)) matchedSceneTokens++;
    });

    const queryRatio = queryTokens.length ? matchedTokens / queryTokens.length : 0.5;
    const sceneRatio = sceneTokens.length ? Math.min(1, matchedSceneTokens / 3) : 0.5;

    // Scale to 35 max points
    const score = queryRatio * 25 + sceneRatio * 10;
    return parseFloat(Math.min(35, Math.max(10, score)).toFixed(1));
  }

  private scoreAspectRatio(candidate: BrollCandidate): number {
    const targetAspect = 9 / 16; // ~0.5625
    const diff = Math.abs(candidate.aspectRatio - targetAspect);

    if (diff < 0.05) {
      // Native vertical 9:16
      return 25;
    }
    if (candidate.aspectRatio < 1.0) {
      // Portrait but not exact 9:16 (e.g. 4:5 or 3:4)
      return 22;
    }
    if (candidate.height >= 1080) {
      // High-res landscape (16:9 1080p+) - easy to center-crop cleanly without loss of sharpness
      return 19;
    }
    if (candidate.height >= 720) {
      return 15;
    }
    return 10;
  }

  private scoreDuration(candidate: BrollCandidate, requiredDurationSec: number): number {
    if (candidate.durationSec >= requiredDurationSec + 1.0) {
      // Generous length allowing trim to high-interest section
      return 20;
    }
    if (candidate.durationSec >= requiredDurationSec) {
      return 17;
    }
    if (candidate.durationSec >= requiredDurationSec * 0.75) {
      return 12;
    }
    return 7;
  }

  private scoreResolution(candidate: BrollCandidate): number {
    const maxDim = Math.max(candidate.width, candidate.height);
    if (maxDim >= 2160) return 20; // 4K
    if (maxDim >= 1920) return 18; // 1080p
    if (maxDim >= 1280) return 14; // 720p
    return 8;
  }

  public selectBestCandidate(
    candidates: BrollCandidate[],
    scene: PlannedScene,
    query: string
  ): CandidateEvaluation {
    if (!candidates.length) {
      throw new Error(`No candidates available to select for scene ${scene.sceneId}`);
    }

    const evaluations = candidates.map(c => this.evaluateCandidate(c, scene, query));
    evaluations.sort((a, b) => b.score - a.score);
    return evaluations[0];
  }
}

export const brollSelector = new BrollSelector();
