import { PipelineStage } from './pipeline';

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface JobRecord {
  jobId: string;
  topic: string;
  requestedDuration: number;
  profile: string;
  status: JobStatus;
  currentStage: PipelineStage;
  progress: number;
  startedAt: string;
  completedAt?: string;
  artifactDir: string;
  outputPath?: string;
  errorInfo?: {
    stage: PipelineStage;
    message: string;
    details?: any;
  };
}
