import {
  FormatEditorialProfile,
  NicheProfile,
  VideoFormat,
} from '../../types/editorial';

/**
 * Hardcoded ClipForge Niche Profile.
 * Grounded in Psychology + Human Behavior + Strange Human Mysteries for curiosity-driven educational entertainment.
 */
export const CLIPFORGE_NICHE_PROFILE: NicheProfile = {
  niche: 'Psychology + Human Behavior + Strange Human Mysteries',
  format: 'Curiosity-driven educational entertainment',
  audience: '18–34, primarily US, UK, Canada, and Australia',
  language: 'English',
  primaryGeography: 'US, UK, Canada, Australia',
  contentPillars: [
    'strange things the human brain does',
    'social behavior and psychology',
    'memory, perception, emotions, habits, attraction, fear, decision-making',
    'unexplained or surprising human behaviors',
    'everyday psychological phenomena',
    'technology-related human behavior when relevant',
  ],
};

/**
 * Short-form profile: 9:16 vertical, 25-60s target, fast curiosity-driven pacing,
 * strong hook, rapid visual cuts, pattern interrupts, retention-first editing.
 */
export const SHORT_FORM_PROFILE: FormatEditorialProfile = {
  format: 'short',
  aspectRatio: '9:16',
  targetDurationRange: { min: 25, max: 60 },
  pacingStyle: 'fast curiosity-driven pacing with strong opening hook and retention-first cuts',
  shotDurationRange: { min: 1.0, max: 3.6, targetAverage: 2.2 },
  hookDurationMax: 2.8,
  patternInterruptCooldownSeconds: 9.0,
  allowFrequentVisualChanges: true,
  captionTreatmentIntensity: 'high',
  motionPreference: 'dynamic',
  visualHoldMaxDuration: 3.6,
  repetitionThresholds: {
    maxConsecutiveSameProvider: 2,
    minShotsBeforeSubjectReuse: 3,
    requireCompositionContrast: true,
  },
  narrativeStructure: {
    useChapters: false,
    scrollStopHookRequired: true,
  },
  guidelines: [
    '9:16 vertical orientation optimized for TikTok, YouTube Shorts, and Reels',
    'Fast curiosity-driven pacing (average shot length 1.5s - 2.8s)',
    'Strong opening hook (< 2.8s) designed to stop viewer scroll instantly: "Would this visual make someone stop scrolling?"',
    'Prioritize visual storytelling using real people, expressive faces, crowds, workplaces, homes, phones, cities, relationships, nature, and everyday environments',
    'Frequent meaningful visual changes to eliminate viewer fatigue without arbitrary rapid cutting',
    'High visual contrast between adjacent shots (e.g. macro facial reaction to wide street crowd, calm observation to dynamic interaction)',
    'Pattern interrupts (punch_in, statistic_callout, visual_reveal) timed to narrative inflection points',
    'Retention-first editing with energetic, animated caption highlights',
  ],
};

/**
 * Long-form profile: designed for substantially longer videos, slower pacing where appropriate,
 * longer visual holds when editorially justified, stronger chapter progression,
 * visual variety without artificial rapid cutting, deeper narrative escalation and payoff.
 */
export const LONG_FORM_PROFILE: FormatEditorialProfile = {
  format: 'long',
  aspectRatio: '9:16',
  targetDurationRange: { min: 60, max: 600 },
  pacingStyle: 'deliberate narrative pacing with thoughtful visual holds and structured escalation',
  shotDurationRange: { min: 2.5, max: 8.0, targetAverage: 4.5 },
  hookDurationMax: 4.5,
  patternInterruptCooldownSeconds: 22.0,
  allowFrequentVisualChanges: false,
  captionTreatmentIntensity: 'subtle',
  motionPreference: 'cinematic',
  visualHoldMaxDuration: 8.0,
  repetitionThresholds: {
    maxConsecutiveSameProvider: 3,
    minShotsBeforeSubjectReuse: 5,
    requireCompositionContrast: false,
  },
  narrativeStructure: {
    useChapters: true,
    chapterCadenceSeconds: 60,
    visualResetIntervalSeconds: 45,
    scrollStopHookRequired: false,
  },
  guidelines: [
    'Designed for substantially longer narrative videos with chapter/section progression',
    'Slower pacing where appropriate with longer visual holds (up to 8.0s) when editorially justified',
    'Visual resets at chapter boundaries using wide establishing visuals or thematic shifts',
    'Less aggressive caption and pattern-interrupt usage for cinematic immersion',
    'Visual variety achieved through narrative contrast rather than artificial rapid cutting',
    'Deeper narrative escalation, visual contemplation, and satisfying editorial payoff',
  ],
};

/**
 * Resolves the appropriate format profile based on the requested format string.
 */
export function getFormatProfile(format?: VideoFormat | string): FormatEditorialProfile {
  if (format && format.toLowerCase().includes('long')) {
    return LONG_FORM_PROFILE;
  }
  return SHORT_FORM_PROFILE;
}

export function isShortForm(format?: VideoFormat | string): boolean {
  return !format || !format.toLowerCase().includes('long');
}

export function isLongForm(format?: VideoFormat | string): boolean {
  return Boolean(format && format.toLowerCase().includes('long'));
}
