import { BrollCandidate } from '../../types/pipeline';

export class BrollScorer {
  static scoreCandidate(
    candidate: {
      width: number;
      height: number;
      duration: number;
    },
    targetDuration: number,
    targetAspectRatio = 9 / 16
  ): number {
    let score = 50;

    // 1. Resolution score
    const totalPixels = candidate.width * candidate.height;
    if (totalPixels >= 1080 * 1920) {
      score += 25;
    } else if (totalPixels >= 720 * 1280) {
      score += 15;
    }

    // 2. Aspect Ratio alignment
    const ratio = candidate.width / candidate.height;
    const diff = Math.abs(ratio - targetAspectRatio);
    if (diff < 0.05) {
      score += 20; // Native vertical
    } else if (diff < 0.3) {
      score += 10;
    } else {
      score += 5; // Landscape that needs smart reframing
    }

    // 3. Duration match: candidate must cover target duration
    if (candidate.duration >= targetDuration) {
      score += 15;
    } else {
      score -= 20;
    }

    return Math.max(0, Math.min(100, score));
  }
}
