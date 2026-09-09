import path from 'node:path';

export const ARTIFACT_FILES = {
  JOB: 'job.json',
  RESEARCH: 'research.json',
  SCRIPT: 'script.json',
  NARRATION_WAV: 'narration.wav',
  NARRATION_JSON: 'narration.json',
  SCENE_PLAN: 'scene-plan.json',
  BROLL_SELECTION: 'broll-selection.json',
  TIMELINE: 'timeline.json',
  CAPTIONS_ASS: 'captions.ass',
  CAPTIONS_JSON: 'captions.json',
  FINAL_VIDEO: 'final-video.mp4',
  RENDER_REPORT: 'render-report.json',
  VALIDATION: 'validation.json',
  PIPELINE_LOG: 'pipeline.log',
} as const;

export function getArtifactPath(jobDir: string, artifactName: keyof typeof ARTIFACT_FILES): string {
  return path.join(jobDir, ARTIFACT_FILES[artifactName]);
}
