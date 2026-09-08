export type PipelineStage =
  | 'queued'
  | 'research'
  | 'script'
  | 'narration'
  | 'scene_planning'
  | 'broll_search'
  | 'broll_selection'
  | 'timeline'
  | 'rendering'
  | 'validation'
  | 'completed'
  | 'failed';

export interface PipelineInput {
  topic: string;
  duration?: number;
  profile?: string; // e.g. 'vertical-1080', 'vertical-720', 'vertical-540'
  jobId?: string;
  outputDir?: string;
  skipPexels?: boolean;
}

export interface PipelineOutput {
  jobId: string;
  success: boolean;
  finalVideoPath: string;
  artifactDir: string;
  validationPassed: boolean;
  totalDurationSec: number;
  artifacts: {
    research: string;
    script: string;
    narration: string;
    scenePlan: string;
    brollSelection: string;
    timeline: string;
    renderReport: string;
    validation: string;
  };
}

export class PipelineStageError extends Error {
  public readonly stage: PipelineStage;
  public readonly details?: any;

  constructor(stage: PipelineStage, message: string, details?: any) {
    super(`[${stage.toUpperCase()}] ${message}`);
    this.name = 'PipelineStageError';
    this.stage = stage;
    this.details = details;
  }
}
