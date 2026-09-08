import {
  NarrationArtifact,
  ScenePlanArtifact,
  BrollSelectionArtifact,
  TimelineArtifact,
  TimelineClip,
} from '../../types/pipeline.js';
import { EditingPrimitives } from './EditingPrimitives.js';
import { logger } from '../logger.js';

export class TimelineBuilder {
  public buildTimeline(
    jobId: string,
    narration: NarrationArtifact,
    scenePlan: ScenePlanArtifact,
    brollSelections: BrollSelectionArtifact,
    canvas: { width: number; height: number; fps: number }
  ): TimelineArtifact {
    logger.info(jobId, 'retention_editing', `Constructing synchronized timeline from ${narration.durationSec}s narration audio`);

    const actualNarrationDuration = narration.durationSec;
    const plannedTotalSec = scenePlan.totalPlannedDurationSec || actualNarrationDuration;
    const scaleFactor = actualNarrationDuration / (plannedTotalSec > 0 ? plannedTotalSec : actualNarrationDuration);

    const videoClips: TimelineClip[] = [];
    let currentTimelineTime = 0;

    for (let i = 0; i < scenePlan.scenes.length; i++) {
      const scene = scenePlan.scenes[i];
      const selection = brollSelections.selections.find(s => s.sceneId === scene.sceneId) || brollSelections.selections[i];

      if (!selection) {
        throw new Error(`Missing B-roll selection for scene: ${scene.sceneId}`);
      }

      // Proportional scene duration scaled to exact audio length
      const isLastScene = i === scenePlan.scenes.length - 1;
      let sceneDuration = scene.estimatedDurationSec * scaleFactor;

      if (isLastScene) {
        sceneDuration = Math.max(1.0, actualNarrationDuration - currentTimelineTime);
      }

      sceneDuration = parseFloat(sceneDuration.toFixed(2));
      const timelineStartSec = parseFloat(currentTimelineTime.toFixed(2));
      const timelineEndSec = parseFloat((currentTimelineTime + sceneDuration).toFixed(2));

      // Intelligent clip trim: center or early-middle of clip
      const origDur = selection.selectedClip.originalDurationSec || sceneDuration;
      let trimStart = 0;
      if (origDur > sceneDuration + 1.0) {
        // Start 0.5s to 1.5s in to avoid cold-starts in footage
        trimStart = Math.min(1.0, (origDur - sceneDuration) / 2);
      }
      const trimEnd = trimStart + sceneDuration;

      // Vertical reframing computation
      const reframing = EditingPrimitives.computeVerticalReframing(
        selection.selectedClip.originalWidth || canvas.width,
        selection.selectedClip.originalHeight || canvas.height,
        canvas.width,
        canvas.height
      );

      const motion = scene.editingGuidance?.cameraMotion || (i % 2 === 0 ? 'slow_zoom_in' : 'slow_zoom_out');

      videoClips.push({
        sceneId: scene.sceneId,
        clipPath: selection.selectedClip.localPath,
        timelineStartSec,
        timelineEndSec,
        clipDurationSec: sceneDuration,
        clipTrimStartSec: parseFloat(trimStart.toFixed(2)),
        clipTrimEndSec: parseFloat(trimEnd.toFixed(2)),
        visualObjective: scene.visualObjective,
        editingPrimitives: {
          crop: {
            x: reframing.cropX,
            y: reframing.cropY,
            width: canvas.width,
            height: canvas.height,
          },
          scale: {
            width: reframing.scaleWidth,
            height: reframing.scaleHeight,
          },
          zoomMotion: motion !== 'static' ? {
            startScale: motion === 'slow_zoom_in' ? 1.0 : 1.08,
            endScale: motion === 'slow_zoom_in' ? 1.08 : 1.0,
            type: motion === 'slow_zoom_in' ? 'zoom_in' : 'zoom_out',
          } : undefined,
          transitionIn: i > 0 && scene.editingGuidance?.transition === 'fade' ? {
            type: 'fade',
            durationSec: 0.3,
          } : undefined,
        },
      });

      currentTimelineTime += sceneDuration;
    }

    const artifact: TimelineArtifact = {
      totalDurationSec: parseFloat(actualNarrationDuration.toFixed(2)),
      canvas: {
        width: canvas.width,
        height: canvas.height,
        fps: canvas.fps,
        aspectRatio: '9:16',
      },
      narrationAudioPath: narration.audioFilePath,
      videoClips,
      generatedAt: new Date().toISOString(),
    };

    logger.info(jobId, 'retention_editing', `Timeline assembled: ${videoClips.length} clips totaling ${artifact.totalDurationSec}s.`);
    return artifact;
  }
}

export const timelineBuilder = new TimelineBuilder();
