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
}
