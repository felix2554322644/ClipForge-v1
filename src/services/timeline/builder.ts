import {
  CaptionSegment,
  EditorialPlan,
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

  /**
   * Assembles a final render timeline directly from the typed EditorialPlan.
   * Fully respects source inPoint/outPoint, dynamic pacing, and editorial motion.
   */
  buildTimelineFromEditorial(
    editorialPlan: EditorialPlan,
    masterAudioPath: string,
    captions?: CaptionSegment[],
    captionAssPath?: string
  ): TimelineComposition {
    this.logger.stage(
      'TIMELINE_BUILDING',
      `Assembling timeline from ${editorialPlan.decisions.length} editorial decisions`
    );

    const cuts: TimelineCut[] = editorialPlan.decisions.map((d) => ({
      shotId: d.shotId,
      sceneIndex: d.sceneIndex,
      shotIndex: d.shotIndex,
      videoSourcePath: d.videoSourcePath,
      inPoint: d.inPoint,
      outPoint: d.outPoint,
      durationSeconds: d.durationSeconds,
      motionEffect: d.motionEffect,
      transition: d.transition,
      captionText: d.narrationClause,
      cropMode: d.cropMode,
      motionIntensity: d.motionIntensity,
    }));

    const calculatedTotalDuration =
      Math.round(cuts.reduce((sum, c) => sum + c.durationSeconds, 0) * 100) / 100;

    const timeline: TimelineComposition = {
      width: CONFIG.TARGET_WIDTH,
      height: CONFIG.TARGET_HEIGHT,
      fps: CONFIG.TARGET_FPS,
      totalDurationSeconds: calculatedTotalDuration || editorialPlan.totalDurationSeconds,
      audioTrackPath: masterAudioPath,
      cuts,
      captions,
      captionAssPath,
    };

    this.logger.info(
      `Timeline assembled with ${cuts.length} cuts, total duration: ${timeline.totalDurationSeconds.toFixed(2)}s`
    );
    return timeline;
  }

  /**
   * Backward-compatible timeline assembly from ScenePlanOutput and BrollSelections.
   * Respects source inPoint and outPoint.
   */
  buildTimeline(
    scenePlanOrEditorial: ScenePlanOutput | EditorialPlan,
    brollSelections?: SelectedBrollScene[],
    masterAudioPath?: string,
    captions?: CaptionSegment[],
    captionAssPath?: string
  ): TimelineComposition {
    // If an EditorialPlan was passed in
    if ('decisions' in scenePlanOrEditorial) {
      return this.buildTimelineFromEditorial(
        scenePlanOrEditorial,
        brollSelections as any || masterAudioPath || '',
        captions,
        captionAssPath
      );
    }

    const scenePlan = scenePlanOrEditorial;
    const selections = brollSelections || [];
    const audioPath = masterAudioPath || '';

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
          selections.find((b) => b.shotId === shot.id) ||
          selections.find(
            (b) => b.sceneIndex === shot.sceneIndex && b.shotIndex === shot.shotIndex
          ) ||
          selections[idx] ||
          selections[0];

        const videoSourcePath = broll?.reframedPath || broll?.broll?.videoPath || '';
        const inPoint = typeof broll?.inPoint === 'number' ? broll.inPoint : 0;
        const outPoint =
          typeof broll?.outPoint === 'number'
            ? broll.outPoint
            : inPoint + shot.durationSeconds;

        return {
          shotId: shot.id,
          sceneIndex: shot.sceneIndex,
          shotIndex: shot.shotIndex,
          videoSourcePath,
          inPoint,
          outPoint,
          durationSeconds: shot.durationSeconds,
          motionEffect: shot.motionEffect,
          transition: shot.transition,
          captionText: shot.captionText || shot.narrationClause || '',
        };
      });
    } else {
      // Backward compatibility: 1 cut per scene
      cuts = scenePlan.scenes.map((scene, i) => {
        const broll = selections.find((b) => b.sceneIndex === scene.index) || selections[i];
        const videoSourcePath = broll?.reframedPath || broll?.broll?.videoPath || '';
        const inPoint = typeof broll?.inPoint === 'number' ? broll.inPoint : 0;
        const outPoint =
          typeof broll?.outPoint === 'number'
            ? broll.outPoint
            : inPoint + scene.durationSeconds;

        return {
          sceneIndex: scene.index,
          videoSourcePath,
          inPoint,
          outPoint,
          durationSeconds: scene.durationSeconds,
          motionEffect: scene.motionEffect,
          transition: 'cut',
          captionText: scene.captionText,
        };
      });
    }

    const calculatedTotalDuration =
      Math.round(cuts.reduce((sum, c) => sum + c.durationSeconds, 0) * 100) / 100;

    const timeline: TimelineComposition = {
      width: CONFIG.TARGET_WIDTH,
      height: CONFIG.TARGET_HEIGHT,
      fps: CONFIG.TARGET_FPS,
      totalDurationSeconds: calculatedTotalDuration || scenePlan.totalDurationSeconds,
      audioTrackPath: audioPath,
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
