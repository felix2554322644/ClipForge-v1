export type PipelineStage =
  | 'queued'
  | 'research'
  | 'script'
  | 'narration'
  | 'scene_planning'
  | 'broll_search'
  | 'broll_selection'
  | 'retention_editing'
  | 'ffmpeg_render'
  | 'ffprobe_validation'
  | 'completed'
  | 'failed';

export interface PipelineInput {
  topic: string;
  desiredDurationSec?: number; // e.g. 15, 20, 30. Defaults to 20
  style?: 'educational' | 'dramatic' | 'curious' | 'high_energy';
  language?: string; // e.g. 'en'
  resolutionProfile?: '1080x1920' | '720x1280' | '540x960'; // Defaults to 1080x1920 (or 540x960 for fast testing)
  targetFps?: number; // Defaults to 30
}

export interface ResearchArtifact {
  topic: string;
  keyFacts: string[];
  importantEntities: string[];
  chronology: string[];
  claims: string[];
  visualOpportunities: string[];
  sources: string[];
  generatedAt: string;
}

export interface ScriptLine {
  id: string;
  text: string;
  estimatedDurationSec: number;
  pacing: 'fast' | 'moderate' | 'dramatic';
  narrativeRole: 'hook' | 'escalation' | 'climax' | 'resolution';
}

export interface ScriptArtifact {
  topic: string;
  hook: string;
  lines: ScriptLine[];
  fullNarrationText: string;
  estimatedTotalDurationSec: number;
  targetAudience: string;
  generatedAt: string;
}

export interface PlannedScene {
  sceneId: string;
  narrationLineId?: string;
  narrationText: string;
  estimatedDurationSec: number;
  visualObjective: string;
  visualDescription: string;
  searchQueries: string[];
  preferredBrollType: 'cinematic' | 'macro' | 'action' | 'landscape' | 'abstract';
  importance: 'high' | 'medium' | 'normal';
  editingGuidance: {
    cameraMotion: 'slow_zoom_in' | 'slow_zoom_out' | 'static' | 'pan';
    cutPacing: 'fast' | 'moderate';
    transition: 'cut' | 'fade';
  };
}

export interface ScenePlanArtifact {
  scenes: PlannedScene[];
  totalPlannedDurationSec: number;
  targetAspectRatio: '9:16';
  generatedAt: string;
}

export interface NarrationSentenceTiming {
  text: string;
  startSec: number;
  endSec: number;
}

export interface NarrationArtifact {
  audioFilePath: string;
  durationSec: number;
  sampleRate: number;
  channels: number;
  format: string;
  ttsEngineUsed: string;
  sentenceTimings: NarrationSentenceTiming[];
  generatedAt: string;
}

export interface BrollCandidate {
  id: string;
  provider: 'pexels' | 'procedural' | 'fixture';
  title: string;
  sourceUrl: string;
  downloadUrl: string;
  width: number;
  height: number;
  durationSec: number;
  aspectRatio: number;
  tags: string[];
}

export interface CandidateEvaluation {
  candidate: BrollCandidate;
  score: number;
  scoreBreakdown: {
    semanticRelevance: number; // 0 - 35
    aspectRatioSuitability: number; // 0 - 25
    durationAdequacy: number; // 0 - 20
    resolutionQuality: number; // 0 - 20
  };
  reasoning: string;
}

export interface SelectedBrollClip {
  sceneId: string;
  searchQueryUsed: string;
  selectedClip: {
    id: string;
    provider: string;
    sourceUrl: string;
    localPath: string;
    originalWidth: number;
    originalHeight: number;
    originalDurationSec: number;
    aspectRatio: number;
    score: number;
    scoreBreakdown: CandidateEvaluation['scoreBreakdown'];
  };
  candidatesEvaluated: number;
  reasoning: string;
}

export interface BrollSelectionArtifact {
  selections: SelectedBrollClip[];
  cacheHits: number;
  downloadsCount: number;
  generatedAt: string;
}

export interface TimelineClip {
  sceneId: string;
  clipPath: string;
  timelineStartSec: number;
  timelineEndSec: number;
  clipDurationSec: number;
  clipTrimStartSec: number;
  clipTrimEndSec: number;
  visualObjective: string;
  editingPrimitives: {
    crop: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    scale: {
      width: number;
      height: number;
    };
    zoomMotion?: {
      startScale: number;
      endScale: number;
      type: 'zoom_in' | 'zoom_out';
    };
    transitionIn?: {
      type: 'fade';
      durationSec: number;
    };
  };
}

export interface TimelineArtifact {
  totalDurationSec: number;
  canvas: {
    width: number;
    height: number;
    fps: number;
    aspectRatio: '9:16';
  };
  narrationAudioPath: string;
  videoClips: TimelineClip[];
  generatedAt: string;
}

export interface RenderReportArtifact {
  outputPath: string;
  renderDurationMs: number;
  ffmpegCommand: string;
  filterGraph: string;
  outputFileSize: number;
  renderedAt: string;
}

export interface ValidationChecks {
  fileExists: boolean;
  hasVideoStream: boolean;
  hasAudioStream: boolean;
  durationValid: boolean;
  resolutionValid: boolean;
  aspectRatioValid: boolean;
  videoCodecValid: boolean;
  audioCodecValid: boolean;
  fpsValid: boolean;
  ffprobeReadable: boolean;
}

export interface ValidationMetrics {
  actualDurationSec: number;
  expectedDurationSec: number;
  width: number;
  height: number;
  videoCodec: string;
  audioCodec: string;
  fps: number;
  fileSizeBytes: number;
}

export interface ValidationArtifact {
  passed: boolean;
  videoPath: string;
  checks: ValidationChecks;
  metrics: ValidationMetrics;
  errors: string[];
  validatedAt: string;
}

export interface JobLogEntry {
  timestamp: string;
  stage: PipelineStage;
  level: 'info' | 'warn' | 'error';
  message: string;
  details?: any;
}

export interface PipelineArtifacts {
  research?: ResearchArtifact;
  script?: ScriptArtifact;
  scenePlan?: ScenePlanArtifact;
  narration?: NarrationArtifact;
  brollSelection?: BrollSelectionArtifact;
  timeline?: TimelineArtifact;
  renderReport?: RenderReportArtifact;
  validation?: ValidationArtifact;
}

export type LogEntry = JobLogEntry;

export interface JobRecord {
  jobId: string;
  input: PipelineInput;
  currentStage: PipelineStage;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number; // 0 - 100
  startedAt: string;
  completedAt?: string;
  error?: {
    stage: PipelineStage;
    message: string;
    details?: any;
  };
  artifacts: PipelineArtifacts;
  finalVideoPath?: string;
  finalVideoUrl?: string;
  logs: JobLogEntry[];
}
