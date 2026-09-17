import {
  RenderSpec,
  RenderSpecCut,
  WordTimestamp,
  TensionPoint,
} from '../../contracts/renderSpec';
import { BRAND_BIBLE } from '../../config/brandBible';
import { EditorialPlan, ScriptOutput, ResearchBrief } from '../../types/pipeline';
import { AudioPlan } from '../../types/audio';

export interface RenderSpecBuildInputs {
  jobId: string;
  topic: string;
  durationSeconds: number;
  script: ScriptOutput;
  brief?: ResearchBrief;
  editorialPlan: EditorialPlan;
  audioPlan: AudioPlan;
  masterAudioPath: string;
  narrationAudioPath: string;
  wordTimestamps: WordTimestamp[];
}

export class RenderSpecBuilder {
  static build(inputs: RenderSpecBuildInputs): RenderSpec {
    const {
      jobId,
      topic,
      durationSeconds,
      script,
      brief,
      editorialPlan,
      audioPlan,
      masterAudioPath,
      narrationAudioPath,
      wordTimestamps,
    } = inputs;

    // Convert editorial decisions to RenderSpecCut array
    let currentTimelineSeconds = 0;
    const cuts: RenderSpecCut[] = editorialPlan.decisions.map((dec, idx) => {
      const isBeat4 = dec.shotId.includes('implication') || idx === editorialPlan.decisions.length - 2;

      let beat: RenderSpecCut['beat'] = 'escalation';
      if (idx === 0) beat = 'hook';
      else if (idx === 1) beat = 'ground_it';
      else if (isBeat4) beat = 'peak_implication';
      else if (idx === editorialPlan.decisions.length - 1) beat = 'reframe_line';

      let motionType: RenderSpecCut['motion']['type'] = 'zoom_in';
      if (dec.motionEffect === 'pull_out' || dec.motionEffect === 'zoom_out') motionType = 'zoom_out';
      else if (dec.motionEffect === 'pan_left' || dec.motionEffect === 'pan_right') {
        motionType = 'pan_foreboding';
      } else if (isBeat4) {
        motionType = 'speed_ramp_peak';
      }

      const cut: RenderSpecCut = {
        shotId: dec.shotId || `shot_${idx + 1}`,
        sceneIndex: dec.sceneIndex,
        shotIndex: dec.shotIndex,
        beat,
        narrationClause: dec.narrationClause || '',
        visualSubject: dec.visualDescription || 'Atmospheric cinematic footage',
        inPoint: dec.inPoint,
        outPoint: dec.outPoint,
        durationSeconds: dec.durationSeconds,
        asset: {
          url: dec.videoSourcePath,
          downloadUrl: dec.videoSourcePath,
          provider: 'licensed_stock',
          sourceId: dec.shotId,
          license: 'commercial_full',
          width: 1080,
          height: 1920,
          aspectRatio: 9 / 16,
          nativeVertical: true,
          tags: ['cinematic', dec.role],
        },
        motion: {
          type: motionType,
          easing: 'easeInOutCubic',
          startScale: 1.0,
          endScale: motionType === 'zoom_in' ? 1.07 : motionType === 'zoom_out' ? 0.95 : 1.03,
          speedMultiplier: isBeat4 ? 0.85 : 1.0,
        },
        grading: {
          pass1Normalize: {
            brightness: 0.0,
            contrast: 1.05,
            saturation: 0.98,
          },
          pass2Mood: {
            mood: isBeat4 ? 'dread_dark' : 'tense_cool',
            colorTempShift: isBeat4 ? -25 : -15,
            gamma: 1.02,
            filmGrain: BRAND_BIBLE.colors.filmGrainOpacity || 0.035,
          },
        },
        tonalMatch: {
          targetLuminance: 0.45,
          starkJumpOnPeak: isBeat4,
        },
        transition: {
          type: isBeat4 ? 'signature_twist_reveal' : 'cut',
          durationSeconds: isBeat4 ? 0.33 : 0.0,
        },
      };

      currentTimelineSeconds += dec.durationSeconds;
      return cut;
    });

    const tensionCurve: TensionPoint[] = [
      { timestampSeconds: 0, tensionLevel: 0.4, beat: 'hook', pacing: 'fast' },
      { timestampSeconds: Math.round(durationSeconds * 0.15), tensionLevel: 0.55, beat: 'ground_it', pacing: 'slow' },
      { timestampSeconds: Math.round(durationSeconds * 0.45), tensionLevel: 0.75, beat: 'escalation', pacing: 'building' },
      { timestampSeconds: Math.round(durationSeconds * 0.78), tensionLevel: 0.95, beat: 'peak_implication', pacing: 'held_breath' },
      { timestampSeconds: durationSeconds, tensionLevel: 0.2, beat: 'reframe_line', pacing: 'reframe' },
    ];

    const hookHeadline = script.title || topic;

    return {
      version: '2.0.0',
      jobId,
      createdAt: new Date().toISOString(),
      niche: 'what_if_thought_experiment',
      topic: {
        title: script.title || topic,
        premise: brief?.coreAngle || topic,
        category: 'Everyday Curiosity',
        motif: 'Escalating counterintuitive consequence',
      },
      targetDurationSeconds: durationSeconds,
      tensionCurve,
      cuts,
      audio: {
        narration: {
          text: script.scenes.map((s) => s.narration).join(' '),
          voice: 'piper_en_US_hfc_female',
          paceModifier: 1.0,
          wordTimestamps,
        },
        musicBed: {
          trackName: audioPlan.music.genreMood,
          genreMood: audioPlan.music.genreMood === 'cosmic_synth' ? 'cinematic_ambient' : audioPlan.music.genreMood,
          volume: audioPlan.music.baseVolume || 0.22,
          duckingDb: BRAND_BIBLE.audio.musicDuckingDb,
          fadeInSeconds: 1.0,
          fadeOutSeconds: 2.0,
        },
        ambienceLoops: [
          {
            tag: 'room_tone',
            name: 'Subtle Cinematic Room Tone',
            volume: 0.15,
            startSeconds: 0,
            durationSeconds,
          },
        ],
      },
      captions: {
        enabled: true,
        words: wordTimestamps,
        style: {
          typeface: BRAND_BIBLE.typography.captionFont,
          accentColor: BRAND_BIBLE.colors.brandAccent,
          adaptiveLegibility: true,
          position: 'lower_third',
          maxWordsPerCluster: 4,
        },
      },
      remotionOverlays: {
        hookTypography: {
          enabled: true,
          headline: hookHeadline,
          subheadline: script.scenes[0]?.narration.slice(0, 70),
          durationSeconds: 2.0,
        },
        signatureReveal: {
          enabled: true,
          triggerTimestampSeconds: durationSeconds * 0.75,
          flashIntensity: 0.85,
        },
        endCard: {
          enabled: true,
          reframeText: script.scenes[script.scenes.length - 1]?.narration || 'A new perspective on the ordinary.',
          brandName: BRAND_BIBLE.brandName,
          durationSeconds: 3.0,
        },
      },
      distribution: {
        titleVariants: [script.title || topic],
        thumbnailHook: hookHeadline,
        description: `What if thought experiment exploring ${topic}.`,
        hashtags: ['#whatif', '#curiosity', '#science', '#thoughtexperiment'],
      },
      directorsCommentary: {
        narrativeRationale: 'Escalating ordinary reality rules into counterintuitive psychological and physical implications.',
        visualMotif: 'Moody atmospheric shots with high-contrast color grading.',
        pacingStrategy: 'Rapid hook, measured grounding, accelerating consequences, held peak implication, lingering reframe.',
        peakTwistExplanation: 'The sudden stark lighting change and audio drop emphasize the counterintuitive consequence.',
      },
    };
  }
}
