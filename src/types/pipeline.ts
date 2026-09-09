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
  visualDescription: string;
  suggestedKeywords: string[];
  approxDurationSeconds?: number;
}

export interface ScriptOutput {
  title: string;
  totalEstimatedSeconds: number;
  scenes: ScriptScene[];
}

export interface NarrationAudioArtifact {
  audioPath: string;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  format: string;
}

export interface PlannedScene {
  index: number;
  narration: string;
  durationSeconds: number;
  brollQuery: string[];
  motionEffect: 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right' | 'static';
  captionText: string;
}

export interface ScenePlanOutput {
  totalDurationSeconds: number;
  scenes: PlannedScene[];
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
  source: 'pexels' | 'cache' | 'procedural';
}

export interface SelectedBrollScene {
  sceneIndex: number;
  broll: BrollCandidate;
  inPoint: number;
  outPoint: number;
  reframedPath?: string;
}

export interface TimelineCut {
  sceneIndex: number;
  videoSourcePath: string;
  inPoint: number;
  outPoint: number;
  durationSeconds: number;
  motionEffect: 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right' | 'static';
  captionText: string;
}

export interface TimelineComposition {
  width: number;
  height: number;
  fps: number;
  totalDurationSeconds: number;
  audioTrackPath: string;
  cuts: TimelineCut[];
}

export interface RenderReport {
  outputPath: string;
  fileSizeBytes: number;
  durationSeconds: number;
  renderTimeMs: number;
  resolution: { width: number; height: number };
  fps: number;
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
  };
}
