import {
  CaptionSegment,
  PlannedShot,
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
    masterAudioPath: string,
    captions?: CaptionSegment[],
    captionAssPath?: string
  ): TimelineComposition {
    this.logger.stage('TIMELINE_BUILDING', `Assembling edit decisions for final render`);

    // Collect all shots across scenes, or use scenePlan.shots
    const allShots: PlannedShot[] = [];
    if (scenePlan.shots && scenePlan.shots.length > 0) {
      allShots.push(...scenePlan.shots);
    } else {
      for (const scene of scenePlan.scenes) {
        if (scene.shots && scene.shots.length > 0) {
          allShots.push(...scene.shots);
        }
      }
    }

    let cuts: TimelineCut[];

    if (allShots.length > 0) {
      // Multi-shot beat-level cuts
      cuts = allShots.map((shot, idx) => {
        const broll =
          brollSelections.find((b) => b.shotId === shot.id) ||
          brollSelections.find((b) => b.sceneIndex === shot.sceneIndex && b.shotIndex === shot.shotIndex) ||
          brollSelections[idx] ||
          brollSelections[0];

        const videoSourcePath = broll?.reframedPath || broll?.broll?.videoPath || '';

        return {
          shotId: shot.id,
          sceneIndex: shot.sceneIndex,
          shotIndex: shot.shotIndex,
          videoSourcePath,
          inPoint: 0,
          outPoint: shot.durationSeconds,
          durationSeconds: shot.durationSeconds,
          motionEffect: shot.motionEffect,
          transition: shot.transition,
          captionText: shot.captionText,
        };
      });
    } else {
      // Backward compatibility: 1 cut per scene
      cuts = scenePlan.scenes.map((scene, i) => {
        const broll = brollSelections.find((b) => b.sceneIndex === scene.index) || brollSelections[i];
        const videoSourcePath = broll?.reframedPath || broll?.broll?.videoPath || '';

        return {
          sceneIndex: scene.index,
          videoSourcePath,
          inPoint: 0,
          outPoint: scene.durationSeconds,
          durationSeconds: scene.durationSeconds,
          motionEffect: scene.motionEffect,
          transition: 'cut',
          captionText: scene.captionText,
        };
      });
    }

    const calculatedTotalDuration = Math.round(
      cuts.reduce((sum, c) => sum + c.durationSeconds, 0) * 100
    ) / 100;

    const timeline: TimelineComposition = {
      width: CONFIG.TARGET_WIDTH,
      height: CONFIG.TARGET_HEIGHT,
      fps: CONFIG.TARGET_FPS,
      totalDurationSeconds: calculatedTotalDuration || scenePlan.totalDurationSeconds,
      audioTrackPath: masterAudioPath,
      cuts,
      captions: captions || scenePlan.captions,
      captionAssPath,
    };

    this.logger.info(
      `Timeline assembled with ${cuts.length} cuts, total duration: ${timeline.totalDurationSeconds.toFixed(2)}s`
    );
    return timeline;
  }
}
