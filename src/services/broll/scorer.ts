import { CandidateEvaluation } from '../../contracts/artifacts';
import { SceneShot } from '../../contracts/artifacts';
import { BrollCandidate } from '../pexels/provider';

export class BrollScorer {
  public scoreCandidate(
    candidate: BrollCandidate,
    scene: SceneShot,
    previouslySelectedIds: Set<string | number>
  ): CandidateEvaluation {
    const factors = {
      semantic: this.calculateSemanticScore(candidate, scene),
      resolution: this.calculateResolutionScore(candidate),
      orientation: this.calculateOrientationScore(candidate),
      duration: this.calculateDurationScore(candidate, scene.targetDurationSec),
      uniqueness: this.calculateUniquenessScore(candidate, previouslySelectedIds),
    };

    // Weighted aggregate score: (0 to 100)
    // Semantic: 30%, Resolution: 20%, Orientation: 20%, Duration: 15%, Uniqueness: 15%
    const totalScore = Number(
      (
        factors.semantic * 0.30 +
        factors.resolution * 0.20 +
        factors.orientation * 0.20 +
        factors.duration * 0.15 +
        factors.uniqueness * 0.15
      ).toFixed(2)
    );

    const reasons: string[] = [];
    if (candidate.orientation === 'portrait') reasons.push('Native 9:16 vertical orientation');
    if (candidate.width >= 1920 || candidate.height >= 1920) reasons.push('High-resolution 1080p+ master');
    if (candidate.duration >= scene.targetDurationSec) reasons.push(`Adequate duration (${candidate.duration}s >= ${scene.targetDurationSec}s)`);
    if (factors.uniqueness < 50) reasons.push('Penalized for repetition');

    const reason = reasons.length > 0 ? reasons.join('; ') : 'Balanced criteria match';

    return {
      id: candidate.id,
      width: candidate.width,
      height: candidate.height,
      duration: candidate.duration,
      orientation: candidate.orientation,
      score: totalScore,
      factors,
      reason,
    };
  }

  private calculateSemanticScore(candidate: BrollCandidate, scene: SceneShot): number {
    const textToMatch = `${candidate.title || ''} ${candidate.queryMatched || ''}`.toLowerCase();
    let matches = 0;
    const queries = scene.pexelsSearchQueries.map((q) => q.toLowerCase());

    for (const query of queries) {
      const words = query.split(/\s+/).filter((w) => w.length > 2);
      for (const word of words) {
        if (textToMatch.includes(word)) matches++;
      }
    }

    if (candidate.provider === 'procedural') {
      return 85;
    }

    return Math.min(100, Math.max(50, 60 + matches * 10));
  }

  private calculateResolutionScore(candidate: BrollCandidate): number {
    const maxDim = Math.max(candidate.width, candidate.height);
    if (maxDim >= 3840) return 100; // 4K
    if (maxDim >= 1920) return 90; // 1080p
    if (maxDim >= 1280) return 75; // 720p
    if (maxDim >= 720) return 60;
    return 40;
  }

  private calculateOrientationScore(candidate: BrollCandidate): number {
    // Native portrait is ideal for 9:16 vertical shorts (no cropping needed)
    if (candidate.orientation === 'portrait') return 100;
    // Landscape can be center-cropped without black bars if high resolution
    if (candidate.orientation === 'landscape') {
      return candidate.height >= 1080 ? 80 : 65;
    }
    // Square
    return 70;
  }

  private calculateDurationScore(candidate: BrollCandidate, targetDuration: number): number {
    if (candidate.duration >= targetDuration + 2) return 100;
    if (candidate.duration >= targetDuration) return 85;
    // If clip is shorter than needed, it would need looping or fast cutting
    const ratio = candidate.duration / targetDuration;
    return Math.max(20, Math.round(ratio * 70));
  }

  private calculateUniquenessScore(
    candidate: BrollCandidate,
    previouslySelectedIds: Set<string | number>
  ): number {
    if (previouslySelectedIds.has(candidate.id)) {
      return 15; // Heavy penalty for reusing identical clip
    }
    return 100;
  }
}
