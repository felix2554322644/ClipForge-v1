export type PipelineStage =
  | 'INITIALIZING'
  | 'RESEARCH'
  | 'SCRIPTING'
  | 'NARRATION'
  | 'STORYBOARD'
  | 'SCENE_PLANNING'
  | 'BROLL_SELECTION'
  | 'EDITORIAL_DECISION'
  | 'AUDIO_MIXING'
  | 'TIMELINE_BUILDING'
  | 'RENDERING'
  | 'VALIDATION'
  | 'COMPLETED'
  | 'FAILED';

export interface PipelineJob {
  id: string;
  jobId?: string;
  topic: string;
  topicMode?: 'EXPLICIT' | 'ROTATION' | 'GENERATED';
  duration?: number;
  profile?: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  currentStage: PipelineStage;
  progressPercent: number;
  outputDirectory: string;
  finalVideoPath?: string;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
}
