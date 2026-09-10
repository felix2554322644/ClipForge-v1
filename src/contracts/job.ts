export type PipelineStage =
  | 'INITIALIZING'
  | 'RESEARCH'
  | 'SCRIPTING'
  | 'NARRATION'
  | 'SCENE_PLANNING'
  | 'BROLL_SELECTION'
  | 'EDITORIAL_DECISION'
  | 'TIMELINE_BUILDING'
  | 'RENDERING'
  | 'VALIDATION'
  | 'COMPLETED'
  | 'FAILED';

export interface PipelineJob {
  id: string;
  jobId?: string;
  topic: string;
  topicMode?: 'EXPLICIT' | 'ROTATION';
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
