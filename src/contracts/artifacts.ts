export interface ResearchArtifact {
  topic: string;
  keyFacts: string[];
  importantEntities: string[];
  chronology: Array<{
    step: number;
    title: string;
    description: string;
  }>;
  claims: Array<{
    claim: string;
    context: string;
  }>;
  visualOpportunities: Array<{
    sceneConcept: string;
    visualSubject: string;
    searchKeywords: string[];
  }>;
  researchNotes: string;
  metadata: {
    model: string;
    generatedAt: string;
  };
}

export interface ScriptBeat {
  index: number;
  text: string;
  emotion: string;
  estimatedDurationSec: number;
  visualBeat: string;
}

export interface ScriptArtifact {
  topic: string;
  hook: string;
  spokenLines: ScriptBeat[];
  fullText: string;
  totalWordCount: number;
  targetDurationSec: number;
  estimatedDurationSec: number;
  metadata: {
    model: string;
    generatedAt: string;
  };
}

export interface NarrationLineTiming {
  index: number;
  text: string;
  startTimeSec: number;
  durationSec: number;
}

export interface NarrationArtifact {
  text: string;
  audioPath: string;
  audioDurationSec: number;
  sampleRate: number;
  channels: number;
  voiceConfig: {
    engine: 'piper' | 'fallback_sine' | 'fallback_gemini';
    modelPath?: string;
    voiceName?: string;
  };
  lineTimings: NarrationLineTiming[];
  measuredWith: 'ffprobe';
  metadata: {
    generatedAt: string;
  };
}

export interface SceneShot {
  sceneId: string;
  narrationSegment: string;
  targetDurationSec: number;
  visualObjective: string;
  visualDescription: string;
  pexelsSearchQueries: string[];
  visualPriority: 'high' | 'medium' | 'normal';
  suggestedMotion: 'zoom_in' | 'zoom_out' | 'pan_subtle' | 'static';
  suggestedCrop: 'center' | 'focus_left' | 'focus_right' | 'rule_of_thirds';
  editingGuidance: string;
}

export interface ScenePlanArtifact {
  scenes: SceneShot[];
  totalScenes: number;
  totalEstimatedDurationSec: number;
  metadata: {
    model: string;
    generatedAt: string;
  };
}

export interface CandidateEvaluation {
  id: string | number;
  width: number;
  height: number;
  duration: number;
  orientation: string;
  score: number;
  factors: {
    semantic: number;
    resolution: number;
    orientation: number;
    duration: number;
    uniqueness: number;
  };
  reason: string;
}

export interface SelectedBrollClip {
  id: string | number;
  url: string;
  localPath: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  orientation: 'portrait' | 'landscape' | 'square';
  score: number;
  reason: string;
}

export interface BrollSelectionArtifact {
  selections: Array<{
    sceneId: string;
    selectedClip: SelectedBrollClip;
    evaluatedCandidates: CandidateEvaluation[];
  }>;
  totalSelectedClips: number;
  cacheHits: number;
  downloads: number;
  metadata: {
    generatedAt: string;
  };
}

export interface TimelineClip {
  clipId: string;
  sceneId: string;
  assetPath: string;
  startTime: number;
  endTime: number;
  duration: number;
  trimStart: number;
  trimEnd: number;
  reframing: {
    sourceWidth: number;
    sourceHeight: number;
    cropX: number;
    cropY: number;
    cropWidth: number;
    cropHeight: number;
    scaleFactor: number;
    targetWidth: number;
    targetHeight: number;
  };
  motion: {
    type: 'zoom_in' | 'zoom_out' | 'static';
    startZoom: number;
    endZoom: number;
    duration: number;
  };
}

export interface TimelineArtifact {
  profile: string;
  resolution: {
    width: number;
    height: number;
  };
  targetDurationSec: number;
  actualAudioDurationSec: number;
  totalVisualDurationSec: number;
  tracks: {
    videoClips: TimelineClip[];
    audioTrack: {
      assetPath: string;
      duration: number;
      sampleRate: number;
      channels: number;
    };
  };
  metadata: {
    generatedAt: string;
  };
}

export interface RenderReportArtifact {
  jobId: string;
  renderStartedAt: string;
  renderCompletedAt: string;
  renderDurationSec: number;
  profile: string;
  resolution: {
    width: number;
    height: number;
  };
  ffmpegCommand: string;
  inputAssets: Array<{
    path: string;
    duration: number;
    type: string;
  }>;
  outputPath: string;
  outputSizeBytes: number;
  success: boolean;
  error?: string;
}

export interface ValidationMetrics {
  width: number;
  height: number;
  aspectRatio: string;
  videoCodec: string;
  audioCodec: string;
  videoDurationSec: number;
  audioDurationSec: number;
  durationDeltaSec: number;
  fps: number;
  fileSizeBytes: number;
  hasVideoStream: boolean;
  hasAudioStream: boolean;
}

export interface ValidationArtifact {
  passed: boolean;
  inspectedAt: string;
  targetProfile: string;
  expectedSpecs: {
    width: number;
    height: number;
    aspectRatio: string;
    videoCodec: string;
    audioCodec: string;
    maxDurationDeltaSec: number;
  };
  actualMetrics: ValidationMetrics;
  errors: string[];
  warnings: string[];
}
