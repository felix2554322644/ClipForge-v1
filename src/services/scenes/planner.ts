import { ScriptOutput, ScenePlanOutput, PlannedScene } from '../../types/pipeline';
import { PipelineLogger } from '../logging/logger';

export class ScenePlanner {
  constructor(private logger: PipelineLogger) {}

  planScenes(
    script: ScriptOutput,
    sceneDurations: number[]
  ): ScenePlanOutput {
    this.logger.stage('SCENE_PLANNING', `Timing and planning ${script.scenes.length} scenes`);

    const motionEffects: ('zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right')[] = [
      'zoom_in',
      'zoom_out',
      'pan_left',
      'pan_right',
    ];

    const plannedScenes: PlannedScene[] = script.scenes.map((scene, i) => {
      // Audio duration + 0.4s natural breathing room
      const rawDuration = sceneDurations[i] || scene.approxDurationSeconds || 5.0;
      const duration = Math.max(3.0, rawDuration + 0.4);

      return {
        index: scene.index,
        narration: scene.narration,
        durationSeconds: Math.round(duration * 100) / 100,
        brollQuery: scene.suggestedKeywords,
        motionEffect: motionEffects[i % motionEffects.length],
        captionText: scene.narration,
      };
    });

    const totalDurationSeconds = plannedScenes.reduce((acc, s) => acc + s.durationSeconds, 0);

    this.logger.info(
      `Planned ${plannedScenes.length} scenes, total video timeline: ${totalDurationSeconds.toFixed(2)}s`
    );

    return {
      totalDurationSeconds: Math.round(totalDurationSeconds * 100) / 100,
      scenes: plannedScenes,
    };
  }
}
