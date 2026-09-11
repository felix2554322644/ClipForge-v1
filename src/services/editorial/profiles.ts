import {
  FormatEditorialProfile,
  NicheProfile,
  VideoFormat,
} from '../../types/editorial';

/**
 * Hardcoded ClipForge Niche Profile.
 * Grounded in AI + Technology + Science + Future for high-retention educational entertainment.
 */
export const CLIPFORGE_NICHE_PROFILE: NicheProfile = {
  niche: 'AI + Technology + Science + Future',
  format: 'Curiosity-driven educational entertainment',
  audience: '18–34, core 18–29',
  language: 'English',
  primaryGeography: 'US, UK, Canada, Australia',
  contentPillars: [
    'AI and emerging technology',
    'space and physics',
    'incredible science',
    'future technology, engineering and robotics',
    'human + technology mysteries',
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
  guidelines: [
    '9:16 vertical orientation optimized for TikTok, YouTube Shorts, and Reels',
    'Fast curiosity-driven pacing (average shot length 1.5s - 2.8s)',
    'Strong opening hook (< 2.8s) designed to stop viewer scroll instantly',
    'Frequent meaningful visual changes to eliminate viewer fatigue',
    'Pattern interrupts (punch_in, statistic_callout, visual_reveal) when useful',
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
  guidelines: [
    'Designed for substantially longer narrative videos with chapter/section progression',
    'Slower pacing where appropriate with longer visual holds when editorially justified',
    'Less aggressive caption and pattern-interrupt usage',
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
