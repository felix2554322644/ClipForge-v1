import {
  CandidateBrollAsset,
  CandidateVisualReference,
  EditorialDecision,
  BrollCandidateBoard,
  FormatEditorialProfile,
} from '../../types/editorial';

export interface VisualContrastReport {
  compositionContrastScore: number; // 0-100
  lightingContrastScore: number; // 0-100
  movementContrastScore: number; // 0-100
  overallContrastScore: number; // 0-100
  hasSubjectRepetition: boolean;
  editorialNote: string;
}

export interface VisualRepetitionAssessment {
  isConsecutiveDuplicate: boolean;
  consecutiveProviderCount: number;
  consecutiveCompositionCount: number;
  subjectFatigueDetected: boolean;
  penaltyScore: number;
  recommendedAlternativeId?: string;
  reason?: string;
}

const STOPWORDS = new Set([
  '4k',
  'hd',
  'uhd',
  'video',
  'footage',
  'clip',
  'background',
  'wallpaper',
  'vertical',
  'portrait',
  'landscape',
  'stock',
  'free',
  'commercial',
  'royalty-free',
  'procedural',
  'synthesized',
  'candidate',
]);

export class VisualIntelligenceService {
  /**
   * Synthesizes or evaluates a rich, lightweight visual reference for a candidate B-roll asset.
   * Enables Gemini and the Editorial Director to evaluate actual visual appearance, composition,
   * movement, and mood without heavy video downloads or per-asset LLM queries.
   */
  static evaluateVisualReference(
    candidate: Partial<CandidateBrollAsset>,
    targetTheme?: string
  ): CandidateVisualReference {
    const rawTags = (candidate.tags || []).map((t) => t.toLowerCase().trim());
    const query = (candidate.queryUsed || targetTheme || '').toLowerCase().trim();
    const description = (candidate.semanticDescription || '').toLowerCase();
    const allTokens = [...rawTags, ...query.split(/\s+/), ...description.split(/\s+/)];

    // 1. Composition Detection
    const composition = this.inferComposition(allTokens, candidate);

    // 2. Movement Type Detection
    const movementType = this.inferMovement(allTokens);

    // 3. Dominant Subject
    const dominantSubject = this.inferDominantSubject(rawTags, query, targetTheme);

    // 4. Lighting & Mood Detection
    const lightingMood = this.inferLightingMood(allTokens);

    // 5. Visual Energy Detection
    const visualEnergy = this.inferVisualEnergy(allTokens, movementType);

    // 6. Aesthetic Quality Score (0-100)
    const aestheticScore = this.calculateAestheticScore(candidate);

    // 7. Visual Novelty / Curiosity Score (0-100)
    const visualNoveltyScore = this.calculateNoveltyScore(allTokens, composition, aestheticScore);

    // 8. Human-readable Visual Description
    const visualDescription = this.generateVisualDescription(
      composition,
      dominantSubject,
      movementType,
      lightingMood,
      candidate.provider
    );

    return {
      thumbnailUrl: candidate.thumbnailUrl || candidate.previewUrl,
      previewUrl: candidate.previewUrl || candidate.thumbnailUrl,
      composition,
      dominantSubject,
      movementType,
      visualEnergy,
      lightingMood,
      visualNoveltyScore,
      aestheticScore,
      visualDescription,
    };
  }

  /**
   * Infers shot composition scale.
   */
  private static inferComposition(
    tokens: string[],
    candidate: Partial<CandidateBrollAsset>
  ): CandidateVisualReference['composition'] {
    const hasAny = (keywords: string[]) => keywords.some((kw) => tokens.some((t) => t.includes(kw)));

    if (hasAny(['macro', 'micro', 'microscopic', 'cell', 'molecule', 'atom', 'circuit pathway'])) {
      return 'macro';
    }
    if (hasAny(['extreme close up', 'extreme closeup', 'eye', 'iris', 'pupil', 'detail'])) {
      return 'extreme_close_up';
    }
    if (hasAny(['close up', 'closeup', 'face', 'portrait', 'hand', 'screen'])) {
      return 'close_up';
    }
    if (hasAny(['aerial', 'drone', 'satellite', 'orbit', 'bird eye', 'overhead', 'top down'])) {
      return 'aerial';
    }
    if (
      hasAny([
        'galaxy',
        'nebula',
        'deep space',
        'universe',
        'milky way',
        'solar system',
        'cosmos',
        'extreme wide',
      ])
    ) {
      return 'extreme_wide';
    }
    if (hasAny(['wide', 'landscape', 'cityscape', 'horizon', 'sky', 'observatory', 'panorama'])) {
      return 'wide';
    }
    if (hasAny(['person', 'people', 'engineer', 'scientist', 'laboratory', 'medium', 'desk'])) {
      return 'medium';
    }

    if (candidate.nativeVertical && candidate.aspectRatio && candidate.aspectRatio <= 0.6) {
      return 'portrait';
    }

    return 'wide';
  }

  /**
   * Infers visual movement characteristics.
   */
  private static inferMovement(tokens: string[]): CandidateVisualReference['movementType'] {
    const hasAny = (keywords: string[]) => keywords.some((kw) => tokens.some((t) => t.includes(kw)));

    if (hasAny(['hyperlapse'])) return 'hyperlapse';
    if (hasAny(['timelapse', 'time lapse', 'stars moving', 'night sky rotation'])) return 'timelapse';
    if (hasAny(['rapid', 'speed', 'rush', 'fast', 'action', 'zoom fast', 'explosion', 'warp'])) {
      return 'rapid_motion';
    }
    if (hasAny(['tracking', 'dolly', 'follow', 'camera move', 'forward', 'fly through'])) {
      return 'tracking';
    }
    if (hasAny(['pan', 'panning', 'sweep', 'tilt'])) {
      return 'panning';
    }
    if (hasAny(['static', 'still', 'frozen', 'lockoff', 'tripod'])) {
      return 'static';
    }

    return 'slow_drift';
  }

  /**
   * Extracts clean, prominent subject keyword.
   */
  private static inferDominantSubject(
    tags: string[],
    query: string,
    fallbackTheme?: string
  ): string {
    const filteredTags = tags.filter((t) => !STOPWORDS.has(t) && t.length > 2);
    if (filteredTags.length > 0) {
      // Pick the most specific tag (usually multi-word or non-generic)
      const specific = filteredTags.find((t) => t.includes(' ') || t.length >= 6);
      return specific || filteredTags[0];
    }

    if (query) {
      const queryWords = query
        .split(/\s+/)
        .filter((w) => !STOPWORDS.has(w) && w.length > 2);
      if (queryWords.length > 0) {
        return queryWords.slice(0, 2).join(' ');
      }
    }

    return fallbackTheme || 'scientific subject';
  }

  /**
   * Infers lighting and color mood.
   */
  private static inferLightingMood(tokens: string[]): CandidateVisualReference['lightingMood'] {
    const hasAny = (keywords: string[]) => keywords.some((kw) => tokens.some((t) => t.includes(kw)));

    if (hasAny(['neon', 'cyber', 'laser', 'blue glow', 'hud', 'futuristic glow', 'matrix'])) {
      return 'neon';
    }
    if (hasAny(['cosmic', 'nebula', 'starlight', 'aurora', 'space', 'galaxy', 'celestial'])) {
      return 'cosmic_glow';
    }
    if (hasAny(['dark', 'shadow', 'black hole', 'deep space', 'silhouette', 'night', 'noir'])) {
      return 'cinematic_dark';
    }
    if (hasAny(['sun', 'day', 'daylight', 'bright', 'sunny', 'clean room'])) {
      return 'bright_daylight';
    }
    if (hasAny(['studio', 'isolated', 'white background', 'product', 'clean'])) {
      return 'studio';
    }

    return 'atmospheric';
  }

  /**
   * Infers visual energy level.
   */
  private static inferVisualEnergy(
    tokens: string[],
    movement: CandidateVisualReference['movementType']
  ): CandidateVisualReference['visualEnergy'] {
    const hasAny = (keywords: string[]) => keywords.some((kw) => tokens.some((t) => t.includes(kw)));

    if (hasAny(['explosion', 'collision', 'supernova', 'shockwave', 'blast', 'eruption'])) {
      return 'explosive';
    }
    if (movement === 'rapid_motion' || movement === 'hyperlapse' || hasAny(['energetic', 'rush', 'warp'])) {
      return 'high';
    }
    if (movement === 'static' || hasAny(['calm', 'peaceful', 'gentle', 'serene', 'still'])) {
      return 'calm';
    }

    return 'moderate';
  }

  /**
   * Calculates aesthetic quality score (0-100) based on resolution, framerate, and native vertical framing.
   */
  private static calculateAestheticScore(candidate: Partial<CandidateBrollAsset>): number {
    let score = 70;

    const width = candidate.width || 1080;
    const height = candidate.height || 1920;
    const pixels = width * height;

    if (pixels >= 3840 * 2160) {
      score += 15; // 4K
    } else if (pixels >= 1920 * 1080) {
      score += 10; // 1080p+
    }

    if (candidate.nativeVertical) {
      score += 10; // Native vertical requires no aggressive zoom cropping
    }

    if (candidate.relevanceScore) {
      score += Math.min(10, Math.round(candidate.relevanceScore * 0.1));
    }

    return Math.min(100, Math.max(40, score));
  }

  /**
   * Calculates novelty / scroll-stopping curiosity score (0-100).
   * Rewards extreme scales (macro, cosmic wide), high-interest physics/tech concepts, and striking lighting.
   */
  private static calculateNoveltyScore(
    tokens: string[],
    composition: CandidateVisualReference['composition'],
    aestheticScore: number
  ): number {
    let score = 65;

    // Scale novelty bonus
    if (composition === 'macro' || composition === 'extreme_close_up') {
      score += 18;
    } else if (composition === 'extreme_wide' || composition === 'aerial') {
      score += 12;
    }

    // Concept novelty bonus
    const highCuriosityKeywords = [
      'magnetar',
      'black hole',
      'neutron star',
      'quantum',
      'singularity',
      'particle',
      'telescope',
      'supernova',
      'aurora',
      'laser',
      'hologram',
      'cybernetic',
      'relativity',
    ];

    if (highCuriosityKeywords.some((kw) => tokens.some((t) => t.includes(kw)))) {
      score += 15;
    }

    // Aesthetic booster
    if (aestheticScore >= 85) {
      score += 5;
    }

    return Math.min(100, Math.max(30, score));
  }

  /**
   * Generates a concise human and AI readable description of the visual scene.
   */
  private static generateVisualDescription(
    composition: CandidateVisualReference['composition'],
    subject: string,
    movement: CandidateVisualReference['movementType'],
    lighting: CandidateVisualReference['lightingMood'],
    provider?: string
  ): string {
    const compLabel = composition.replace(/_/g, ' ');
    const moveLabel = movement.replace(/_/g, ' ');
    const lightLabel = lighting.replace(/_/g, ' ');

    return `${compLabel.toUpperCase()} view of ${subject} with ${lightLabel} lighting and ${moveLabel} motion${
      provider === 'procedural' ? ' (synthesized graphics)' : ''
    }`;
  }

  /**
   * Evaluates visual contrast between two consecutive shots.
   * Good editorial pacing introduces dynamic shifts in composition, movement, and scale.
   */
  static evaluateVisualContrast(
    prev: CandidateBrollAsset,
    next: CandidateBrollAsset
  ): VisualContrastReport {
    const prevVis = prev.visualReference || this.evaluateVisualReference(prev);
    const nextVis = next.visualReference || this.evaluateVisualReference(next);

    // 1. Composition Contrast (0-100)
    let compScore = 30;
    if (prevVis.composition !== nextVis.composition) {
      const isExtremeShift =
        (prevVis.composition === 'macro' && nextVis.composition.includes('wide')) ||
        (prevVis.composition.includes('wide') && nextVis.composition === 'macro') ||
        (prevVis.composition.includes('close') && nextVis.composition.includes('wide'));
      compScore = isExtremeShift ? 100 : 70;
    }

    // 2. Lighting Contrast (0-100)
    let lightScore = 20;
    if (prevVis.lightingMood !== nextVis.lightingMood) {
      lightScore = 80;
    }

    // 3. Movement Contrast (0-100)
    let moveScore = 25;
    if (prevVis.movementType !== nextVis.movementType) {
      moveScore = 75;
    }

    // 4. Subject Repetition
    const hasSubjectRepetition =
      prevVis.dominantSubject.toLowerCase() === nextVis.dominantSubject.toLowerCase() ||
      prev.id === next.id;

    const overall = Math.round(
      compScore * 0.45 + lightScore * 0.25 + moveScore * 0.2 + (hasSubjectRepetition ? -20 : 10)
    );

    return {
      compositionContrastScore: compScore,
      lightingContrastScore: lightScore,
      movementContrastScore: moveScore,
      overallContrastScore: Math.max(0, Math.min(100, overall)),
      hasSubjectRepetition,
      editorialNote: `${prevVis.composition} -> ${nextVis.composition} (${nextVis.movementType})`,
    };
  }

  /**
   * Scores scroll-stopping potential for Short-Form opening hooks (Shot 1).
   * Evaluates whether the visual will make someone stop scrolling immediately.
   */
  static scoreScrollStopPotential(candidate: CandidateBrollAsset): number {
    const vis = candidate.visualReference || this.evaluateVisualReference(candidate);
    let score = vis.visualNoveltyScore * 0.5 + vis.aestheticScore * 0.3;

    // Extra weight for extreme visual scales
    if (vis.composition === 'macro' || vis.composition === 'extreme_wide' || vis.composition === 'extreme_close_up') {
      score += 15;
    }
    // Extra weight for cosmic glow or neon
    if (vis.lightingMood === 'cosmic_glow' || vis.lightingMood === 'neon') {
      score += 10;
    }

    return Math.min(100, Math.round(score));
  }

  /**
   * Evaluates repetition and visual fatigue against prior decisions.
   */
  static detectVisualRepetition(
    history: EditorialDecision[],
    candidate: CandidateBrollAsset,
    board: BrollCandidateBoard,
    profile?: FormatEditorialProfile
  ): VisualRepetitionAssessment {
    if (history.length === 0) {
      return {
        isConsecutiveDuplicate: false,
        consecutiveProviderCount: 1,
        consecutiveCompositionCount: 1,
        subjectFatigueDetected: false,
        penaltyScore: 0,
      };
    }

    const lastDecision = history[history.length - 1];
    const isConsecutiveDuplicate = lastDecision.selectedCandidateId === candidate.id;

    // Track consecutive provider count
    let consecutiveProvider = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      const priorCandidate = board.candidates.find((c) => c.id === history[i].selectedCandidateId);
      if (priorCandidate && priorCandidate.provider === candidate.provider) {
        consecutiveProvider++;
      } else {
        break;
      }
    }

    // Track consecutive composition
    const thisVis = candidate.visualReference || this.evaluateVisualReference(candidate);
    let consecutiveComp = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      const priorCandidate = board.candidates.find((c) => c.id === history[i].selectedCandidateId);
      if (priorCandidate) {
        const priorVis = priorCandidate.visualReference || this.evaluateVisualReference(priorCandidate);
        if (priorVis.composition === thisVis.composition) {
          consecutiveComp++;
        } else {
          break;
        }
      }
    }

    // Check subject fatigue (used > 2 times in recent 4 shots)
    const recentHistory = history.slice(-4);
    let subjectUses = 0;
    for (const h of recentHistory) {
      const priorCandidate = board.candidates.find((c) => c.id === h.selectedCandidateId);
      if (priorCandidate) {
        const priorVis = priorCandidate.visualReference || this.evaluateVisualReference(priorCandidate);
        if (priorVis.dominantSubject.toLowerCase() === thisVis.dominantSubject.toLowerCase()) {
          subjectUses++;
        }
      }
    }
    const subjectFatigueDetected = subjectUses >= 2;

    let penaltyScore = 0;
    let reason = '';

    if (isConsecutiveDuplicate) {
      penaltyScore += 50;
      reason = `Consecutive duplicate asset "${candidate.id}"`;
    }
    if (consecutiveProvider >= (profile?.repetitionThresholds?.maxConsecutiveSameProvider || 3)) {
      penaltyScore += 20;
      reason = (reason ? reason + '; ' : '') + `Provider "${candidate.provider}" repeated ${consecutiveProvider} times`;
    }
    if (consecutiveComp >= 3) {
      penaltyScore += 15;
      reason = (reason ? reason + '; ' : '') + `Composition "${thisVis.composition}" held across 3 shots`;
    }
    if (subjectFatigueDetected) {
      penaltyScore += 25;
      reason = (reason ? reason + '; ' : '') + `Subject "${thisVis.dominantSubject}" repeated in recent cuts`;
    }

    // Recommend alternative candidate if penalty is severe
    let recommendedAlternativeId: string | undefined;
    if (penaltyScore >= 40) {
      const usedIds = new Set(history.map((h) => h.selectedCandidateId));
      const alternative = board.candidates.find((c) => !usedIds.has(c.id) && c.id !== candidate.id);
      if (alternative) {
        recommendedAlternativeId = alternative.id;
      }
    }

    return {
      isConsecutiveDuplicate,
      consecutiveProviderCount: consecutiveProvider,
      consecutiveCompositionCount: consecutiveComp,
      subjectFatigueDetected,
      penaltyScore,
      recommendedAlternativeId,
      reason: reason || undefined,
    };
  }
}
