import { ScriptOutput } from './pipeline';
import { NicheProfile, VideoFormat, EditorialMotion, EditorialTransition } from './editorial';

export type PreferredVisualType = 'stock' | 'custom' | 'graphic' | 'typography';
export type VisualPriority = 'critical' | 'high' | 'medium' | 'supporting';

export interface StoryboardShot {
  shotId: string;
  sceneIndex: number;
  shotIndex: number;
  narrationStart: number;
  narrationEnd: number;
  durationSeconds: number;
  narrationClause: string;
  visualSubject: string;
  action: string;
  environment: string;
  emotion: string;
  mood?: string;
  framing: string;
  composition?: string;
  cameraMovement: string;
  visualPurpose: string;
  visualPriority: VisualPriority;
  preferredVisualType: PreferredVisualType;
  searchQueries: string[];
  pacingType?: 'fast' | 'normal' | 'establishing';
  suggestedMotionEffect?: EditorialMotion | 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right' | 'static';
  suggestedTransition?: EditorialTransition | 'cut' | 'fade' | 'crossfade' | 'flash';
}

export interface Storyboard {
  title: string;
  totalDurationSeconds: number;
  format: VideoFormat;
  pacingSummary?: string;
  visualThemes?: string[];
  shots: StoryboardShot[];
  totalShots: number;
  generatedBy: 'gemini' | 'deterministic_fallback';
}

export interface StoryboardInput {
  script: ScriptOutput;
  narrationText: string;
  narrationDurationSeconds: number;
  format?: VideoFormat;
  nicheProfile?: NicheProfile;
}
