export type AudioCueType =
  | 'whoosh'
  | 'impact'
  | 'sub_drop'
  | 'riser'
  | 'glitch'
  | 'pop'
  | 'chime';

export interface SfxCueIntent {
  id: string;
  type: AudioCueType;
  timestampSeconds: number;
  durationSeconds?: number;
  volumeMultiplier?: number;
  label?: string;
  assetPath?: string;
}

export type MusicGenreMood =
  | 'cinematic_ambient'
  | 'dark_pulsing'
  | 'cosmic_synth'
  | 'tense_investigative'
  | 'uplifting_build';

export interface MusicTrackIntent {
  genreMood: MusicGenreMood;
  targetDurationSeconds: number;
  trackPath?: string;
  baseVolume?: number; // default e.g. 0.28
  fadeInSeconds?: number; // default 1.5s
  fadeOutSeconds?: number; // default 2.0s
}

export interface AudioPlan {
  totalDurationSeconds: number;
  music: MusicTrackIntent;
  sfxCues: SfxCueIntent[];
  ducking: {
    enabled: boolean;
    threshold: number; // e.g. 0.07
    ratio: number; // e.g. 4.5
    attackMs: number; // e.g. 25
    releaseMs: number; // e.g. 300
  };
  loudnessTarget: {
    integratedLufs: number; // e.g. -16
    truePeakDb: number; // e.g. -1.5
    loudnessRange: number; // e.g. 11
  };
}
