export type PipelineStage =
  | 'INITIALIZING'
  | 'RESEARCH'
  | 'SCRIPTING'
  | 'NARRATION'
  | 'SCENE_PLANNING'
  | 'BROLL_SELECTION'
  | 'TIMELINE_BUILDING'
  | 'RENDERING'
  | 'VALIDATION'
  | 'COMPLETED'
  | 'FAILED';

export interface PipelineJob {
  id: string;
  topic: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  currentStage: PipelineStage;
  progressPercent: number;
  outputDirectory: string;
  finalVideoPath?: string;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
}
