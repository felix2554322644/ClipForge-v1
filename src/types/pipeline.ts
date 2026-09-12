import {
  EditorialMotion,
  EditorialTransition,
  CropMode,
  CaptionTreatmentType,
} from './editorial';

export interface ResearchBrief {
  topic: string;
  hook: string;
  coreAngle: string;
  keyFacts: string[];
  visualThemes: string[];
  recommendedPacing: 'fast' | 'moderate' | 'dramatic';
}

export interface ScriptScene {
  index: number;
  narration: string;
  visualDescription?: string;
  suggestedKeywords?: string[];
  approxDurationSeconds?: number;
  brollKeyword?: string;
  durationSeconds?: number;
  type?: string;
}

export interface ScriptOutput {
  title?: string;
  totalEstimatedSeconds?: number;
  estimatedDurationSeconds?: number;
  hook?: string;
  coreMystery?: string;
  payoff?: string;
  closingCall?: string;
  scenes: ScriptScene[];
}

export interface NarrationAudioArtifact {
  audioPath: string;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  format: string;
}

export interface CaptionSegment {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  duration: number;
  isEmphasis?: boolean;
  emphasisWords?: string[];
}

export interface PlannedShot {
  id: string;
  sceneIndex: number;
  shotIndex: number;
  narrationClause: string;
  durationSeconds: number;
  pacingType?: 'fast' | 'normal' | 'establishing';
  brollQueries: string[];
  searchQuery?: string;
  visualDescription?: string;
  motionEffect: EditorialMotion | 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right' | 'static';
  transition: EditorialTransition | 'cut' | 'fade' | 'crossfade';
  captionText?: string;
}

export interface PlannedScene {
  index: number;
  narration: string;
  durationSeconds: number;
  brollQuery: string[];
  motionEffect: EditorialMotion | 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right' | 'static';
  captionText: string;
  shots?: PlannedShot[];
  visualThemes?: string[];
}

export interface ScenePlanOutput {
  totalDurationSeconds: number;
  totalShots?: number;
  scenes: PlannedScene[];
  shots?: PlannedShot[];
  captions?: CaptionSegment[];
}

export type BrollProviderName = 'pexels' | 'pixabay' | 'procedural' | 'cache';

export interface BrollScoreBreakdown {
  portrait: number;
  resolution: number;
  durationMatch: number;
  semantic: number;
  uniqueness: number;
  cropSafety?: number;
  aspectRatio?: number; // compatibility alias for portrait
}

export interface BrollCandidate {
  id: string;
  url: string;
  videoPath: string;
  originalWidth: number;
  originalHeight: number;
  aspectRatio: number;
  durationSeconds: number;
  relevanceScore: number;
  source: BrollProviderName;
  provider?: BrollProviderName;
  providerAssetId?: string;
  nativeVertical?: boolean;
  cropRequired?: boolean;
  cropAmount?: number;
  scoreBreakdown?: BrollScoreBreakdown;
  selectionReason?: string;
  queryUsed?: string;
  sourceUrl?: string;
}

export interface SelectedBrollShot {
  shotId: string;
  sceneIndex: number;
  shotIndex: number;
  queryUsed: string;
  provider?: BrollProviderName;
  providerAssetId?: string;
  nativeVertical?: boolean;
  sourceDimensions?: { width: number; height: number };
  sourceAspectRatio?: number;
  cropRequired?: boolean;
  cropAmount?: number;
  sourceUrl?: string;
  broll: BrollCandidate;
  inPoint: number;
  outPoint: number;
  reframedPath?: string;
  scoreBreakdown?: BrollScoreBreakdown;
  selectionReason?: string;
}

// Backward compatibility alias with enhanced metadata
export interface SelectedBrollScene {
  sceneIndex: number;
  shotId?: string;
  shotIndex?: number;
  provider?: BrollProviderName;
  providerAssetId?: string;
  nativeVertical?: boolean;
  sourceDimensions?: { width: number; height: number };
  sourceAspectRatio?: number;
  cropRequired?: boolean;
  cropAmount?: number;
  queryUsed?: string;
  sourceUrl?: string;
  broll: BrollCandidate;
  inPoint: number;
  outPoint: number;
  reframedPath?: string;
  scoreBreakdown?: BrollScoreBreakdown;
  selectionReason?: string;
}

export interface CaptionTheme {
  fontName: string;
  fontSize: number;
  primaryColor: string; // ASS hex &H00FFFFFF&
  outlineColor: string; // ASS hex &H00000000&
  outlineWidth: number;
  shadowDepth: number;
  emphasisColor: string; // ASS hex e.g. &H0000E6FF&
  emphasisScalePercent: number; // e.g. 112
  marginVertical: number; // Safe area placement e.g. 520
  animationFadeMs: number;
}

export interface TimelineCut {
  shotId?: string;
  sceneIndex: number;
  shotIndex?: number;
  videoSourcePath: string;
  inPoint: number;
  outPoint: number;
  durationSeconds: number;
  motionEffect: EditorialMotion | 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right' | 'static';
  transition?: EditorialTransition | 'cut' | 'fade' | 'crossfade';
  captionText: string;
  cropMode?: CropMode;
  motionIntensity?: 'subtle' | 'moderate' | 'dramatic';
  captionTreatment?: CaptionTreatmentType;
}

export interface TimelineComposition {
  width: number;
  height: number;
  fps: number;
  totalDurationSeconds: number;
  audioTrackPath: string;
  cuts: TimelineCut[];
  captions?: CaptionSegment[];
  captionAssPath?: string;
}

export interface RenderReport {
  outputPath: string;
  fileSizeBytes: number;
  durationSeconds: number;
  renderTimeMs: number;
  resolution: { width: number; height: number };
  fps: number;
  shotCount?: number;
  captionCount?: number;
  captionsBurnedIn?: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  checks: {
    durationMatch: boolean;
    audioSynced: boolean;
    validResolution: boolean;
    validFramerate: boolean;
    noStallFrames: boolean;
    captionsRendered?: boolean;
    durationDifference?: number;
    shotCount?: number;
  };
}

export * from './editorial';
export * from './storyboard';
export * from './audio';
