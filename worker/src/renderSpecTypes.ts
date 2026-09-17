/**
 * ClipForge v2 Render Spec Contract (Worker Types)
 */

export interface WordTimestamp {
  word: string;
  startSeconds: number;
  endSeconds: number;
  isEmotionWord?: boolean;
  score?: number;
}

export interface RenderSpecCut {
  shotId: string;
  sceneIndex: number;
  shotIndex: number;
  beat: 'hook' | 'ground_it' | 'escalation' | 'peak_implication' | 'reframe_line';
  narrationClause: string;
  visualSubject: string;
  inPoint: number;
  outPoint: number;
  durationSeconds: number;
  asset: {
    url: string;
    downloadUrl: string;
    provider: 'pexels' | 'pixabay' | 'licensed_stock';
    sourceId: string;
    license: string;
    width: number;
    height: number;
    aspectRatio: number;
    nativeVertical: boolean;
    tags: string[];
  };
  smartCrop?: {
    focalX: number;
    focalY: number;
    cropWidth: number;
    cropHeight: number;
  };
  motion: {
    type: 'zoom_in' | 'zoom_out' | 'pan_foreboding' | 'static_hold' | 'speed_ramp_peak';
    easing: 'easeInOutCubic';
    startScale: number;
    endScale: number;
    panDirection?: 'left' | 'right' | 'up' | 'down';
    speedMultiplier: number;
  };
  grading: {
    pass1Normalize: {
      brightness: number;
      contrast: number;
      saturation: number;
    };
    pass2Mood: {
      mood: 'neutral' | 'tense_cool' | 'resolution_warm' | 'dread_dark';
      colorTempShift: number;
      gamma: number;
      filmGrain: number;
    };
  };
  tonalMatch: {
    targetLuminance: number;
    starkJumpOnPeak: boolean;
  };
  transition: {
    type: 'cut' | 'fade_black' | 'signature_twist_reveal';
    durationSeconds: number;
  };
}

export interface RenderSpecAudio {
  narration: {
    text: string;
    voice: string;
    paceModifier: number;
    wordTimestamps?: WordTimestamp[];
  };
  musicBed: {
    trackName: string;
    genreMood: 'tense_investigative' | 'cinematic_ambient' | 'dark_pulsing' | 'uplifting_build';
    volume: number;
    duckingDb: number;
    fadeInSeconds: number;
    fadeOutSeconds: number;
  };
  ambienceLoops: Array<{
    tag: string;
    name: string;
    volume: number;
    startSeconds: number;
    durationSeconds: number;
  }>;
}

export interface RenderSpecCaptions {
  enabled: boolean;
  words: WordTimestamp[];
  style: {
    typeface: string;
    accentColor: string;
    adaptiveLegibility: boolean;
    position: 'lower_third' | 'middle_safe';
    maxWordsPerCluster: number;
  };
}

export interface RenderSpecRemotionOverlays {
  hookTypography: {
    enabled: boolean;
    headline: string;
    subheadline?: string;
    durationSeconds: number;
  };
  signatureReveal: {
    enabled: boolean;
    triggerTimestampSeconds: number;
    flashIntensity: number;
  };
  endCard: {
    enabled: boolean;
    reframeText: string;
    brandName: string;
    durationSeconds: number;
  };
}

export interface RenderSpecDistribution {
  titleVariants: string[];
  thumbnailHook: string;
  description: string;
  hashtags: string[];
}

export interface RenderSpecDirectorsCommentary {
  narrativeRationale: string;
  visualMotif: string;
  pacingStrategy: string;
  peakTwistExplanation: string;
}

export interface TensionPoint {
  timestampSeconds: number;
  tensionLevel: number;
  beat: string;
  pacing: 'slow' | 'building' | 'fast' | 'held_breath' | 'reframe';
}

export interface RenderSpec {
  version: '2.0.0';
  jobId: string;
  createdAt: string;
  niche: 'what_if_thought_experiment';
  topic: {
    title: string;
    premise: string;
    category: string;
    motif: string;
  };
  targetDurationSeconds: number;
  tensionCurve: TensionPoint[];
  cuts: RenderSpecCut[];
  audio: RenderSpecAudio;
  captions: RenderSpecCaptions;
  remotionOverlays: RenderSpecRemotionOverlays;
  distribution: RenderSpecDistribution;
  directorsCommentary: RenderSpecDirectorsCommentary;
}
