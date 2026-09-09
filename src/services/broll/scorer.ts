import { BrollScoreBreakdown } from '../../types/pipeline';

export interface ScorerEvaluation {
  score: number;
  breakdown: BrollScoreBreakdown;
  reason: string;
}

export class BrollScorer {
  /**
   * Evaluates a candidate clip and returns detailed scoring breakdown and selection reason.
   */
  static evaluateCandidate(
    candidate: {
      id?: string;
      width: number;
      height: number;
      duration: number;
      url?: string;
    },
    targetDuration: number,
    targetAspectRatio = 9 / 16,
    previousClipIds: string[] | Set<string> = [],
    query?: string
  ): ScorerEvaluation {
    const usedIds = previousClipIds instanceof Set ? previousClipIds : new Set(previousClipIds);
    const reasons: string[] = [];

    // 1. Resolution score (0 - 25)
    let resolution = 5;
    const totalPixels = candidate.width * candidate.height;
    if (totalPixels >= 1080 * 1920) {
      resolution = 25;
      reasons.push('Full HD+ resolution');
    } else if (totalPixels >= 720 * 1280) {
      resolution = 15;
      reasons.push('720p HD resolution');
    } else {
      reasons.push('Sub-HD resolution');
    }

    // 2. Aspect ratio score (0 - 20)
    let aspectRatio = 5;
    const ratio = candidate.width / candidate.height;
    const diff = Math.abs(ratio - targetAspectRatio);
    if (diff < 0.05) {
      aspectRatio = 20;
      reasons.push('Native 9:16 vertical framing');
    } else if (diff < 0.35) {
      aspectRatio = 10;
      reasons.push('Near-vertical framing');
    } else {
      aspectRatio = 5;
      reasons.push('Landscape framing (requires smart crop/reframe)');
    }

    // 3. Duration match score (0 - 20)
    let durationMatch = 0;
    if (candidate.duration >= targetDuration + 1.5) {
      durationMatch = 20;
      reasons.push(`Ample duration (${candidate.duration.toFixed(1)}s for ${targetDuration.toFixed(1)}s shot)`);
    } else if (candidate.duration >= targetDuration) {
      durationMatch = 15;
      reasons.push(`Exact duration match (${candidate.duration.toFixed(1)}s)`);
    } else {
      durationMatch = -20;
      reasons.push(`Insufficient duration (${candidate.duration.toFixed(1)}s < ${targetDuration.toFixed(1)}s)`);
    }

    // 4. Semantic score (0 - 25)
    let semantic = 20;
    if (query) {
      const queryTerms = query.toLowerCase().split(/\s+/);
      const urlMatches = candidate.url ? queryTerms.some((t) => candidate.url?.toLowerCase().includes(t)) : false;
      if (urlMatches) {
        semantic = 25;
        reasons.push(`Direct query match for "${query}"`);
      }
    }

    // 5. Uniqueness / Variety penalty (0 - 10)
    let uniqueness = 10;
    if (candidate.id && usedIds.has(candidate.id)) {
      uniqueness = -35;
      reasons.push('Penalized: clip was already used in an earlier shot');
    } else {
      reasons.push('Unique candidate clip');
    }

    // Compute aggregate score
    const rawScore = resolution + aspectRatio + durationMatch + semantic + uniqueness;
    const score = Math.max(0, Math.min(100, rawScore));

    const breakdown: BrollScoreBreakdown = {
      resolution,
      aspectRatio,
      durationMatch,
      semantic,
      uniqueness,
    };

    const reason = reasons.join('; ');

    return {
      score,
      breakdown,
      reason,
    };
  }

  /**
   * Compatibility score helper returning a pure numeric score (0-100).
   */
  static scoreCandidate(
    candidate: {
      id?: string;
      width: number;
      height: number;
      duration: number;
      url?: string;
    },
    targetDuration: number,
    targetAspectRatio = 9 / 16,
    previousClipIds: string[] | Set<string> = [],
    query?: string
  ): number {
    return this.evaluateCandidate(candidate, targetDuration, targetAspectRatio, previousClipIds, query).score;
  }
}
