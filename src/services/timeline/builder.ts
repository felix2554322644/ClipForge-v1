import {
  ScenePlanOutput,
  SelectedBrollScene,
  TimelineComposition,
  TimelineCut,
} from '../../types/pipeline';
import { PipelineLogger } from '../logging/logger';
import { CONFIG } from '../../config/index';

export class TimelineBuilder {
  constructor(private logger: PipelineLogger) {}

  buildTimeline(
    scenePlan: ScenePlanOutput,
    brollSelections: SelectedBrollScene[],
    masterAudioPath: string
  ): TimelineComposition {
    this.logger.stage('TIMELINE_BUILDING', `Assembling edit decisions for final render`);

    const cuts: TimelineCut[] = scenePlan.scenes.map((scene, i) => {
      const broll = brollSelections.find((b) => b.sceneIndex === scene.index) || brollSelections[i];
      const videoSourcePath = broll?.reframedPath || broll?.broll.videoPath || '';

      return {
        sceneIndex: scene.index,
        videoSourcePath,
        inPoint: 0,
        outPoint: scene.durationSeconds,
        durationSeconds: scene.durationSeconds,
        motionEffect: scene.motionEffect,
        captionText: scene.captionText,
      };
    });

    const timeline: TimelineComposition = {
      width: CONFIG.TARGET_WIDTH,
      height: CONFIG.TARGET_HEIGHT,
      fps: CONFIG.TARGET_FPS,
      totalDurationSeconds: scenePlan.totalDurationSeconds,
      audioTrackPath: masterAudioPath,
      cuts,
    };

    this.logger.info(`Timeline assembled with ${cuts.length} cuts, total ${timeline.totalDurationSeconds}s`);
    return timeline;
  }
}
