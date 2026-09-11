export type EditorialRole =
  | 'hook'
  | 'curiosity'
  | 'question'
  | 'fact'
  | 'statistic'
  | 'claim'
  | 'escalation'
  | 'reveal'
  | 'contrast'
  | 'payoff'
  | 'conclusion';

export type EditorialMotion =
  | 'push_in'
  | 'pull_out'
  | 'punch_in'
  | 'pan_left'
  | 'pan_right'
  | 'tilt_up'
  | 'tilt_down'
  | 'static'
  | 'zoom_in'
  | 'zoom_out';

export type EditorialTransition = 'cut' | 'fade' | 'flash' | 'crossfade';

export type PatternInterruptType =
  | 'punch_in'
  | 'statistic_callout'
  | 'visual_reveal'
  | 'crop_reframe'
  | 'text_flash';

export interface PatternInterrupt {
  type: PatternInterruptType;
  label?: string;
  intensity: 'subtle' | 'bold';
  triggerTimeOffset?: number;
}

export type CaptionTreatmentType =
  | 'standard'
  | 'hook_pop'
  | 'statistic_callout'
  | 'reveal_pop'
  | 'payoff_impact';

export type CropMode = 'standard' | 'punch_in' | 'tight' | 'wide';

export interface EditorialDecision {
  shotId: string;
  sceneIndex: number;
  shotIndex: number;
  selectedCandidateId?: string;
  role: EditorialRole;
  narrationClause: string;
  durationSeconds: number;
  videoSourcePath: string;
  sourceDurationSeconds: number;
  inPoint: number;
  outPoint: number;
  motionEffect: EditorialMotion;
  motionIntensity: 'subtle' | 'moderate' | 'dramatic';
  cropMode: CropMode;
  transition: EditorialTransition;
  captionTreatment: CaptionTreatmentType;
  patternInterrupt?: PatternInterrupt;
  editorialReason: string;
  pacingWeight: number;
  visualDescription?: string;
  visualContrastNote?: string;
  repetitionWarning?: string;
}

export interface EditorialChapter {
  chapterIndex: number;
  title: string;
  startShotIndex: number;
  endShotIndex: number;
  startTime: number;
  endTime: number;
  durationSeconds: number;
  visualTheme?: string;
  pacingStyle?: string;
}

export interface EditorialPlan {
  totalDurationSeconds: number;
  decisions: EditorialDecision[];
  pacingBreakdown: {
    hookDuration: number;
    averageShotDuration: number;
    shotCount: number;
    rapidShotsCount: number;
    holdsCount: number;
    staticHoldsCount: number;
  };
  varietyScore: number;
  patternInterruptCount: number;
  editorialNarrativeArc?: string;
  format?: VideoFormat;
  visualContinuityScore?: number;
  compositionVarietyScore?: number;
  repetitionPenalties?: number;
  chapters?: EditorialChapter[];
}

export interface CandidateVisualReference {
  thumbnailUrl?: string;
  previewUrl?: string;
  composition:
    | 'close_up'
    | 'extreme_close_up'
    | 'medium'
    | 'wide'
    | 'extreme_wide'
    | 'macro'
    | 'aerial'
    | 'portrait';
  dominantSubject: string;
  movementType:
    | 'static'
    | 'slow_drift'
    | 'panning'
    | 'tracking'
    | 'rapid_motion'
    | 'timelapse'
    | 'hyperlapse';
  visualEnergy: 'calm' | 'moderate' | 'high' | 'explosive';
  lightingMood:
    | 'cinematic_dark'
    | 'neon'
    | 'bright_daylight'
    | 'atmospheric'
    | 'cosmic_glow'
    | 'studio';
  visualNoveltyScore: number;
  aestheticScore: number;
  visualDescription: string;
}

export interface CandidateBrollAsset {
  id: string;
  provider: 'pexels' | 'pixabay' | 'procedural' | 'cache';
  providerAssetId: string;
  sourceUrl?: string;
  downloadUrl: string;
  durationSeconds: number;
  width: number;
  height: number;
  aspectRatio: number;
  nativeVertical: boolean;
  tags: string[];
  queryUsed: string;
  targetSceneIndex?: number;
  targetShotId?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  relevanceScore: number;
  semanticDescription?: string;
  visualReference?: CandidateVisualReference;
}

export interface BrollCandidateBoard {
  candidates: CandidateBrollAsset[];
  totalCandidates: number;
  queriesRun: string[];
  previouslySelectedAssetIds?: string[];
  visualThemesSummary?: string[];
}

export interface NicheProfile {
  niche: string;
  format: string;
  audience: string;
  language: string;
  primaryGeography: string;
  contentPillars: string[];
}

export type VideoFormat = 'short' | 'long';

export interface FormatEditorialProfile {
  format: VideoFormat;
  aspectRatio: '9:16' | '16:9';
  targetDurationRange: { min: number; max: number };
  pacingStyle: string;
  shotDurationRange: { min: number; max: number; targetAverage: number };
  hookDurationMax: number;
  patternInterruptCooldownSeconds: number;
  allowFrequentVisualChanges: boolean;
  captionTreatmentIntensity: 'high' | 'moderate' | 'subtle';
  motionPreference: 'dynamic' | 'balanced' | 'cinematic';
  visualHoldMaxDuration?: number;
  repetitionThresholds?: {
    maxConsecutiveSameProvider: number;
    minShotsBeforeSubjectReuse: number;
    requireCompositionContrast: boolean;
  };
  narrativeStructure?: {
    useChapters: boolean;
    chapterCadenceSeconds?: number;
    visualResetIntervalSeconds?: number;
    scrollStopHookRequired: boolean;
  };
  guidelines: string[];
}

export interface AIDirectorInput {
  nicheProfile?: NicheProfile;
  format?: VideoFormat;
  targetDurationSeconds: number;
  script?: import('./pipeline').ScriptOutput;
  narrationText: string;
  narrationDurationSeconds: number;
  scenePlan?: import('./pipeline').ScenePlanOutput;
  candidateBoard: BrollCandidateBoard;
  previouslySelectedAssets?: string[];
  availableMotions?: EditorialMotion[];
  availableCropModes?: CropMode[];
  availableTransitions?: EditorialTransition[];
  availableCaptionTreatments?: CaptionTreatmentType[];
  availablePatternInterrupts?: PatternInterruptType[];
  chapters?: {
    index: number;
    title: string;
    approxStartTime: number;
    approxEndTime: number;
  }[];
}
