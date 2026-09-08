import {
  BrollSelectionArtifact,
  NarrationArtifact,
  ScenePlanArtifact,
  TimelineArtifact,
  TimelineClip,
} from '../../contracts/artifacts';
import { VIDEO_PROFILES } from '../../config';
import { ReframingService } from '../media/reframing';
import { PipelineLogger } from '../logging/logger';

export class TimelineBuilder {
  private reframer: ReframingService;

  constructor(private logger: PipelineLogger) {
    this.reframer = new ReframingService();
  }

  public buildTimeline(
    scenePlan: ScenePlanArtifact,
    narration: NarrationArtifact,
    brollSelection: BrollSelectionArtifact,
    profileName: string = 'vertical-1080'
  ): TimelineArtifact {
    this.logger.stageStart('timeline', `Target Profile: ${profileName}, Master Audio Clock: ${narration.audioDurationSec.toFixed(2)}s`);

    const profileConfig = VIDEO_PROFILES[profileName] || VIDEO_PROFILES['vertical-1080'];
    const targetWidth = profileConfig.width;
    const targetHeight = profileConfig.height;
    const actualAudioDurationSec = narration.audioDurationSec;

    const selectionsMap = new Map<string, BrollSelectionArtifact['selections'][0]>();
    for (const s of brollSelection.selections) {
      selectionsMap.set(s.sceneId, s);
    }

    const videoClips: TimelineClip[] = [];
    let currentTimelineTime = 0;

    const scenes = scenePlan.scenes;
    const totalScenes = scenes.length;

    for (let i = 0; i < totalScenes; i++) {
      const scene = scenes[i];
      const isLastScene = i === totalScenes - 1;

      // Master clock synchronization
      let clipDuration: number;
      if (isLastScene) {
        clipDuration = Number((actualAudioDurationSec - currentTimelineTime).toFixed(3));
      } else {
        clipDuration = Number(scene.targetDurationSec.toFixed(3));
      }

      // Safeguard against negative or zero duration
      if (clipDuration <= 0) {
        clipDuration = 2.0;
      }

      const startTime = Number(currentTimelineTime.toFixed(3));
      const endTime = Number((currentTimelineTime + clipDuration).toFixed(3));
      currentTimelineTime = endTime;

      const selection = selectionsMap.get(scene.sceneId);
      const selectedClip = selection?.selectedClip;

      const assetPath = selectedClip?.localPath || '';
      const sourceWidth = selectedClip?.width || 1920;
      const sourceHeight = selectedClip?.height || 1080;

      // Calculate 9:16 reframing without stretching or letterboxing
      const anchor = scene.suggestedCrop === 'focus_left'
        ? 'focus_left'
        : scene.suggestedCrop === 'focus_right'
        ? 'focus_right'
        : scene.suggestedCrop === 'rule_of_thirds'
        ? 'rule_of_thirds'
        : 'center';

      const reframing = this.reframer.calculateReframing(
        sourceWidth,
        sourceHeight,
        targetWidth,
        targetHeight,
        anchor
      );

      // Determine motion type: alternate zoom_in / zoom_out for dynamic retention
      const motionType = scene.suggestedMotion === 'zoom_out' ? 'zoom_out' : 'zoom_in';
      const motion = {
        type: motionType as 'zoom_in' | 'zoom_out' | 'static',
        startZoom: motionType === 'zoom_in' ? 1.0 : 1.10,
        endZoom: motionType === 'zoom_in' ? 1.10 : 1.0,
        duration: clipDuration,
      };

      videoClips.push({
        clipId: `clip_${scene.sceneId}`,
        sceneId: scene.sceneId,
        assetPath,
        startTime,
        endTime,
        duration: clipDuration,
        trimStart: 0,
        trimEnd: clipDuration,
        reframing: {
          sourceWidth: reframing.sourceWidth,
          sourceHeight: reframing.sourceHeight,
          cropX: reframing.cropX,
          cropY: reframing.cropY,
          cropWidth: reframing.cropWidth,
          cropHeight: reframing.cropHeight,
          scaleFactor: reframing.scaleFactor,
          targetWidth: reframing.targetWidth,
          targetHeight: reframing.targetHeight,
        },
        motion,
      });
    }

    const totalVisualDurationSec = Number(currentTimelineTime.toFixed(3));

    const artifact: TimelineArtifact = {
      profile: profileName,
      resolution: {
        width: targetWidth,
        height: targetHeight,
      },
      targetDurationSec: scenePlan.totalEstimatedDurationSec,
      actualAudioDurationSec,
      totalVisualDurationSec,
      tracks: {
        videoClips,
        audioTrack: {
          assetPath: narration.audioPath,
          duration: actualAudioDurationSec,
          sampleRate: narration.sampleRate,
          channels: narration.channels,
        },
      },
      metadata: {
        generatedAt: new Date().toISOString(),
      },
    };

    this.logger.stageCompleted(
      'timeline',
      `Constructed ${videoClips.length} visual cuts, visual: ${totalVisualDurationSec.toFixed(2)}s matches audio ${actualAudioDurationSec.toFixed(2)}s`
    );

    return artifact;
  }
}
