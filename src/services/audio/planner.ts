import { EditorialPlan, ScriptOutput, ResearchBrief } from '../../types/pipeline';
import { AudioPlan, MusicGenreMood, SfxCueIntent, AudioCueType } from '../../types/audio';

export class AudioPlanner {
  /**
   * Plans the background music bed and strategic SFX cues synchronized with
   * the editorial timeline, story structure, scene cuts, and pattern interrupts.
   */
  static planAudio(params: {
    totalDurationSeconds: number;
    editorialPlan?: EditorialPlan;
    script?: ScriptOutput;
    researchBrief?: ResearchBrief;
  }): AudioPlan {
    const duration = params.totalDurationSeconds || 5.0;
    const mood = this.determineMusicMood(params.researchBrief, params.script);
    const sfxCues = this.planSfxCues(duration, params.editorialPlan);

    return {
      totalDurationSeconds: duration,
      music: {
        genreMood: mood,
        targetDurationSeconds: duration,
        baseVolume: 0.28,
        fadeInSeconds: 1.5,
        fadeOutSeconds: 2.0,
      },
      sfxCues,
      ducking: {
        enabled: true,
        threshold: 0.07,
        ratio: 4.5,
        attackMs: 25,
        releaseMs: 300,
      },
      loudnessTarget: {
        integratedLufs: -16,
        truePeakDb: -1.5,
        loudnessRange: 11,
      },
    };
  }

  private static determineMusicMood(
    brief?: ResearchBrief,
    script?: ScriptOutput
  ): MusicGenreMood {
    const textCorpus = `${brief?.topic || ''} ${brief?.coreAngle || ''} ${script?.hook || ''}`.toLowerCase();

    if (textCorpus.includes('space') || textCorpus.includes('cosmic') || textCorpus.includes('universe') || textCorpus.includes('star') || textCorpus.includes('planet')) {
      return 'cosmic_synth';
    }
    if (textCorpus.includes('mystery') || textCorpus.includes('secret') || textCorpus.includes('dark') || textCorpus.includes('danger') || textCorpus.includes('warning')) {
      return 'dark_pulsing';
    }
    if (textCorpus.includes('how') || textCorpus.includes('why') || textCorpus.includes('investigate') || textCorpus.includes('truth')) {
      return 'tense_investigative';
    }
    if (textCorpus.includes('future') || textCorpus.includes('money') || textCorpus.includes('success') || textCorpus.includes('build')) {
      return 'uplifting_build';
    }
    return 'cinematic_ambient';
  }

  private static planSfxCues(
    totalDuration: number,
    editorialPlan?: EditorialPlan
  ): SfxCueIntent[] {
    const cues: SfxCueIntent[] = [];

    if (!editorialPlan || !editorialPlan.decisions || editorialPlan.decisions.length === 0) {
      // Fallback: Hook whoosh and mid-point impact
      cues.push({
        id: 'sfx_hook_intro',
        type: 'whoosh',
        timestampSeconds: 0.15,
        durationSeconds: 0.5,
        volumeMultiplier: 0.35,
        label: 'Hook entrance whoosh',
      });
      if (totalDuration > 5) {
        cues.push({
          id: 'sfx_midpoint_impact',
          type: 'impact',
          timestampSeconds: Math.min(totalDuration * 0.5, totalDuration - 1.5),
          durationSeconds: 0.6,
          volumeMultiplier: 0.35,
          label: 'Midpoint transition impact',
        });
      }
      return cues;
    }

    let cumulativeTime = 0;
    editorialPlan.decisions.forEach((decision, idx) => {
      const shotStart = cumulativeTime;
      cumulativeTime += decision.durationSeconds;

      // 1. Initial Hook intro SFX
      if (idx === 0) {
        cues.push({
          id: `sfx_hook_${decision.shotId}`,
          type: 'whoosh',
          timestampSeconds: 0.15,
          durationSeconds: 0.5,
          volumeMultiplier: 0.38,
          label: `Hook start: ${decision.role}`,
        });
      } else {
        // 2. Scene/Shot Transition SFX for key editorial moments
        const isSignificantTransition =
          decision.role === 'reveal' ||
          decision.role === 'payoff' ||
          decision.role === 'contrast' ||
          decision.role === 'escalation' ||
          decision.transition === 'flash' ||
          decision.transition === 'fade';

        if (isSignificantTransition && shotStart < totalDuration - 1.0) {
          const cueType: AudioCueType =
            decision.role === 'payoff' || decision.role === 'reveal'
              ? 'impact'
              : 'whoosh';

          cues.push({
            id: `sfx_trans_${idx}_${decision.shotId}`,
            type: cueType,
            timestampSeconds: Math.round(shotStart * 100) / 100,
            durationSeconds: 0.45,
            volumeMultiplier: 0.32,
            label: `Editorial transition to ${decision.role}`,
          });
        }
      }

      // 3. Pattern interrupt SFX
      if (decision.patternInterrupt) {
        const offset = decision.patternInterrupt.triggerTimeOffset || (decision.durationSeconds * 0.4);
        const interruptTimestamp = Math.min(
          shotStart + offset,
          totalDuration - 0.8
        );

        const cueType: AudioCueType =
          decision.patternInterrupt.type === 'punch_in' || decision.patternInterrupt.type === 'statistic_callout'
            ? 'pop'
            : 'glitch';

        cues.push({
          id: `sfx_interrupt_${idx}_${decision.shotId}`,
          type: cueType,
          timestampSeconds: Math.round(interruptTimestamp * 100) / 100,
          durationSeconds: 0.35,
          volumeMultiplier: 0.28,
          label: `Pattern interrupt: ${decision.patternInterrupt.type}`,
        });
      }
    });

    // Enforce min 0.8s gap between consecutive SFX cues so sound does not clutter voice
    const filteredCues: SfxCueIntent[] = [];
    let lastTimestamp = -1;

    for (const cue of cues) {
      if (cue.timestampSeconds >= totalDuration - 0.5) continue;
      if (lastTimestamp < 0 || cue.timestampSeconds - lastTimestamp >= 0.8) {
        filteredCues.push(cue);
        lastTimestamp = cue.timestampSeconds;
      }
    }

    return filteredCues;
  }
}
