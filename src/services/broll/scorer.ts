import { BrollScoreBreakdown } from '../../types/pipeline';
import { CONFIG } from '../../config/index';

export interface ScorerEvaluation {
  score: number;
  breakdown: BrollScoreBreakdown;
  reason: string;
  isRejected?: boolean;
  rejectReason?: string;
}

export class BrollScorer {
  /**
   * Evaluates a candidate clip and returns detailed scoring breakdown, selection reason,
   * and hard landscape rejection status.
   */
  static evaluateCandidate(
    candidate: {
      id?: string;
      provider?: string;
      providerAssetId?: string;
      width: number;
      height: number;
      duration: number;
      url?: string;
      tags?: string[];
    },
    targetDuration: number,
    targetAspectRatio = CONFIG.TARGET_WIDTH / CONFIG.TARGET_HEIGHT, // ~0.5625
    previousClipIds: string[] | Set<string> = [],
    query?: string,
    allowLandscape = CONFIG.ALLOW_LANDSCAPE_FALLBACK
  ): ScorerEvaluation {
    const usedIds = previousClipIds instanceof Set ? previousClipIds : new Set(previousClipIds);
    const reasons: string[] = [];

    const isLandscape = candidate.width > candidate.height;
    const ratio = candidate.width / candidate.height;

    // HARD LANDSCAPE FILTER: Reject landscape by default
    if (isLandscape && !allowLandscape) {
      return {
        score: 0,
        isRejected: true,
        rejectReason: `Landscape footage rejected by hard vertical filter (${candidate.width}x${candidate.height}, ratio=${ratio.toFixed(2)})`,
        breakdown: {
          portrait: 0,
          resolution: 0,
          durationMatch: 0,
          semantic: 0,
          uniqueness: 0,
          cropSafety: 0,
          aspectRatio: 0,
        },
        reason: 'REJECTED: Non-portrait footage',
      };
    }

    // 1. Aspect Ratio / Native Portrait Suitability (0 - 30 pts)
    let portrait = 0;
    const diff = Math.abs(ratio - targetAspectRatio);

    if (diff <= 0.05) {
      // Native 9:16 (0.5125 to 0.6125)
      portrait = 30;
      reasons.push('Native 9:16 vertical framing (ideal)');
    } else if (ratio <= 0.65) {
      // Excellent portrait (e.g. 9:14, 10:16)
      portrait = 22;
      reasons.push('Excellent near-9:16 portrait framing');
    } else if (ratio <= 0.85) {
      // Acceptable portrait (e.g. 3:4, 4:5)
      portrait = 14;
      reasons.push('Acceptable portrait framing (modest vertical crop)');
    } else if (ratio <= 1.05) {
      // Square (1:1)
      portrait = 4;
      reasons.push('Square framing (sub-optimal for vertical)');
    } else {
      // Landscape fallback mode (if allowed)
      portrait = 0;
      reasons.push('Landscape framing (requires heavy crop)');
    }

    // 2. Crop Safety Score (0 - 5 pts)
    let cropSafety = 0;
    if (diff <= 0.05) {
      cropSafety = 5;
    } else if (ratio <= 0.65) {
      cropSafety = 4;
    } else if (ratio <= 0.85) {
      cropSafety = 2;
    } else {
      cropSafety = 0;
    }

    // 3. Resolution Score (0 - 20 pts)
    let resolution = 5;
    const totalPixels = candidate.width * candidate.height;
    const targetPixels = CONFIG.TARGET_WIDTH * CONFIG.TARGET_HEIGHT;

    if (totalPixels >= targetPixels) {
      resolution = 20;
      reasons.push(`Full HD+ resolution (${candidate.width}x${candidate.height})`);
    } else if (totalPixels >= 720 * 1280) {
      resolution = 14;
      reasons.push(`720p HD resolution (${candidate.width}x${candidate.height})`);
    } else {
      resolution = 5;
      reasons.push(`Sub-HD resolution (${candidate.width}x${candidate.height})`);
    }

    // 4. Duration Match Score (-25 to 15 pts)
    let durationMatch = 0;
    if (candidate.duration >= targetDuration + 1.5) {
      durationMatch = 15;
      reasons.push(`Ample duration (${candidate.duration.toFixed(1)}s for ${targetDuration.toFixed(1)}s shot)`);
    } else if (candidate.duration >= targetDuration) {
      durationMatch = 10;
      reasons.push(`Exact duration match (${candidate.duration.toFixed(1)}s)`);
    } else {
      durationMatch = -25;
      reasons.push(`Insufficient duration (${candidate.duration.toFixed(1)}s < ${targetDuration.toFixed(1)}s)`);
    }

    // 5. Semantic Match Score (0 - 25 pts)
    let semantic = 12;
    if (query) {
      const queryTerms = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 2);

      let matchCount = 0;
      const checkString = `${candidate.url || ''} ${(candidate.tags || []).join(' ')}`.toLowerCase();

      for (const term of queryTerms) {
        if (checkString.includes(term)) {
          matchCount++;
        }
      }

      if (matchCount >= 2) {
        semantic = 25;
        reasons.push(`Strong semantic keyword match for "${query}"`);
      } else if (matchCount === 1) {
        semantic = 20;
        reasons.push(`Semantic keyword match for "${query}"`);
      } else {
        semantic = 14;
        reasons.push(`General thematic alignment for "${query}"`);
      }
    }

    // 6. Uniqueness / Repetition Penalty (-35 to 10 pts)
    let uniqueness = 10;
    const clipKey = candidate.id || candidate.providerAssetId || '';
    if (clipKey && usedIds.has(clipKey)) {
      uniqueness = -35;
      reasons.push('Penalized: asset already used in earlier shot');
    } else {
      reasons.push('Unique candidate asset');
    }

    // Aggregate score bounded [0, 100]
    const rawScore = portrait + cropSafety + resolution + durationMatch + semantic + uniqueness;
    const score = Math.max(0, Math.min(100, rawScore));

    const breakdown: BrollScoreBreakdown = {
      portrait,
      aspectRatio: portrait,
      cropSafety,
      resolution,
      durationMatch,
      semantic,
      uniqueness,
    };

    return {
      score,
      breakdown,
      reason: reasons.join('; '),
      isRejected: false,
    };
  }

  /**
   * Returns a numeric score (0-100) for candidate selection.
   */
  static scoreCandidate(
    candidate: {
      id?: string;
      provider?: string;
      providerAssetId?: string;
      width: number;
      height: number;
      duration: number;
      url?: string;
      tags?: string[];
    },
    targetDuration: number,
    targetAspectRatio = CONFIG.TARGET_WIDTH / CONFIG.TARGET_HEIGHT,
    previousClipIds: string[] | Set<string> = [],
    query?: string,
    allowLandscape = CONFIG.ALLOW_LANDSCAPE_FALLBACK
  ): number {
    return this.evaluateCandidate(
      candidate,
      targetDuration,
      targetAspectRatio,
      previousClipIds,
      query,
      allowLandscape
    ).score;
  }
}
