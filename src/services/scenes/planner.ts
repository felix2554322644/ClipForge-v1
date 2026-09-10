import {
  ScriptOutput,
  ScriptScene,
  ScenePlanOutput,
  PlannedScene,
  PlannedShot,
} from '../../types/pipeline';
import { PipelineLogger } from '../logging/logger';

export class ScenePlanner {
  constructor(private logger: PipelineLogger) {}

  /**
   * Plans scenes and visual shots based on narration beats, information density,
   * and authoritative audio duration.
   */
  planScenes(
    script: ScriptOutput,
    durationInput: number[] | number
  ): ScenePlanOutput {
    this.logger.stage('SCENE_PLANNING', `Timing and planning beat-level shots for ${script.scenes.length} narrative scenes`);

    // 1. Determine authoritative scene durations
    let totalAudioDuration: number;
    let targetSceneDurations: number[];

    if (Array.isArray(durationInput)) {
      totalAudioDuration = durationInput.reduce((sum, d) => sum + d, 0);
      targetSceneDurations = [...durationInput];
    } else {
      totalAudioDuration = durationInput;
      targetSceneDurations = this.calculateWeightedSceneDurations(script.scenes, totalAudioDuration);
    }

    const motionCycle: ('zoom_in' | 'static' | 'pan_left' | 'zoom_out' | 'pan_right')[] = [
      'zoom_in',
      'static',
      'pan_left',
      'zoom_out',
      'pan_right',
    ];

    let globalShotIndex = 0;
    const allPlannedShots: PlannedShot[] = [];

    // 2. Plan beat-level shots for each scene
    const plannedScenes: PlannedScene[] = script.scenes.map((scene, sceneIdx) => {
      const sceneDuration = targetSceneDurations[sceneIdx] || 6.0;
      const clauses = this.splitIntoVisualBeats(scene.narration);

      // Generate shots for this scene
      const rawShots: PlannedShot[] = clauses.map((clause, shotIdxInScene) => {
        const shotId = `scene_${scene.index}_shot_${shotIdxInScene}`;
        const pacing = this.determinePacing(clause, sceneIdx, shotIdxInScene, clauses.length);
        const brollQueries = this.generateShotQueries(clause, scene, shotIdxInScene);
        const motionEffect = motionCycle[globalShotIndex % motionCycle.length];
        const transition = shotIdxInScene === 0 && sceneIdx > 0 ? 'fade' : 'cut';

        globalShotIndex++;

        return {
          id: shotId,
          sceneIndex: scene.index,
          shotIndex: shotIdxInScene,
          narrationClause: clause,
          durationSeconds: 0, // Assigned in normalization below
          pacingType: pacing,
          brollQueries,
          motionEffect,
          transition,
          captionText: clause,
        };
      });

      // Distribute sceneDuration among the shots
      this.normalizeShotDurations(rawShots, sceneDuration);
      allPlannedShots.push(...rawShots);

      const computedSceneDuration = Math.round(
        rawShots.reduce((sum, s) => sum + s.durationSeconds, 0) * 100
      ) / 100;

      return {
        index: scene.index,
        narration: scene.narration,
        durationSeconds: computedSceneDuration,
        brollQuery: scene.suggestedKeywords || [],
        motionEffect: rawShots[0]?.motionEffect || 'zoom_in',
        captionText: scene.narration,
        shots: rawShots,
        visualThemes: scene.suggestedKeywords || [],
      };
    });

    const totalDurationSeconds = Math.round(
      plannedScenes.reduce((acc, s) => acc + s.durationSeconds, 0) * 100
    ) / 100;

    this.logger.info(
      `Planned ${plannedScenes.length} scenes containing ${allPlannedShots.length} visual shots. Total timeline: ${totalDurationSeconds.toFixed(2)}s`
    );

    return {
      totalDurationSeconds,
      totalShots: allPlannedShots.length,
      scenes: plannedScenes,
      shots: allPlannedShots,
    };
  }

  /**
   * Distributes total audio duration to scenes based on word count and punctuation pacing.
   */
  private calculateWeightedSceneDurations(scenes: ScriptScene[], totalDuration: number): number[] {
    const weights = scenes.map((s) => {
      const words = s.narration.trim().split(/\s+/).length;
      const punctuationMarks = (s.narration.match(/[,.;:!?—\-]/g) || []).length;
      return words + punctuationMarks * 1.5;
    });

    const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;

    let allocated = 0;
    const durations = weights.map((w, idx) => {
      if (idx === weights.length - 1) {
        return Math.round((totalDuration - allocated) * 100) / 100;
      }
      const dur = Math.round(((w / totalWeight) * totalDuration) * 100) / 100;
      allocated += dur;
      return dur;
    });

    return durations;
  }

  /**
   * Splits a narration segment into distinct visual beats / clauses.
   */
  private splitIntoVisualBeats(narration: string): string[] {
    const clean = narration.trim();
    if (!clean) return ['Visual shot'];

    // Split on strong punctuation (periods, question marks, colons, dashes, semicolons)
    const sentenceParts = clean.split(/(?<=[.?!;—])\s+/).filter(Boolean);
    const beats: string[] = [];

    for (const part of sentenceParts) {
      // If a sentence has a comma separating substantive clauses, split it
      const clauses = part.split(/,\s+(?=[a-zA-Z])/).filter(Boolean);

      for (const clause of clauses) {
        const words = clause.trim().split(/\s+/);
        // If a clause is still very long (>8 words), look for coordinating conjunctions
        if (words.length >= 8) {
          const subClauses = clause.split(/\s+(?:and|but|with|where|leaving|while)\s+/i);
          if (subClauses.length > 1 && subClauses.every(c => c.trim().split(/\s+/).length >= 3)) {
            beats.push(...subClauses.map(c => c.trim()));
            continue;
          }
        }
        beats.push(clause.trim());
      }
    }

    // Ensure we have at least 2 shots per scene if the text has reasonable length (>= 8 words)
    if (beats.length === 1 && clean.split(/\s+/).length >= 8) {
      const words = clean.split(/\s+/);
      const mid = Math.ceil(words.length / 2);
      return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
    }

    return beats.length > 0 ? beats : [clean];
  }

  /**
   * Determines the pacing archetype for a visual beat.
   */
  private determinePacing(
    clause: string,
    sceneIdx: number,
    shotIdx: number,
    totalShotsInScene: number
  ): 'fast' | 'normal' | 'establishing' {
    const lower = clause.toLowerCase();

    // Opening shot of video is establishing
    if (sceneIdx === 0 && shotIdx === 0) {
      return 'establishing';
    }

    // Number dense, extreme shock words, or climax escalation
    const isInfoDense = /\d+/.test(clause) ||
      /trillion|billion|million|shockwave|explosion|burst|blast|extreme|instant|fraction/i.test(lower);

    if (isInfoDense) {
      return 'fast';
    }

    // Wide cosmic backdrop or transition
    if (/space|cosmos|universe|stars|sky|mystery|secrets/i.test(lower) && shotIdx === 0) {
      return 'establishing';
    }

    return 'normal';
  }

  /**
   * Generates targeted B-roll search queries for a specific visual beat.
   */
  private generateShotQueries(clause: string, scene: ScriptScene, shotIdx: number): string[] {
    const lower = clause.toLowerCase();
    const queries: string[] = [];

    // Semantic subject recognition
    if (/telescope|observatory|astronomer|listen|detect|record|scientist/i.test(lower)) {
      queries.push('radio telescope dish', 'observatory night sky', 'astronomy telescope starry sky', 'satellite dish night');
    } else if (/magnetar|neutron star|dead star|pulsar|core/i.test(lower)) {
      queries.push('spinning neutron star', 'magnetar space', 'pulsar celestial', 'glowing star core');
    } else if (/magnetic field|shockwave|burst|flash|energy|plasma|radiation/i.test(lower)) {
      queries.push('magnetic field lines energy', 'plasma explosion space', 'solar flare shockwave', 'energy burst galaxy');
    } else if (/signal|wave|radio wave|beam|travel|light year/i.test(lower)) {
      queries.push('radio signal wave space', 'light beam galaxy', 'cosmic wave universe', 'deep space travel');
    } else if (/galaxy|nebula|deep space|cosmos|universe/i.test(lower)) {
      queries.push('deep space galaxy nebula', 'spiral galaxy rotating', 'starry cosmos colorful nebula', 'milky way stars');
    } else if (/earth|planet|world|atmosphere/i.test(lower)) {
      queries.push('planet earth from space', 'blue planet atmosphere', 'earth orbit view');
    }

    // Blend with scene's suggested keywords
    if (scene.suggestedKeywords && Array.isArray(scene.suggestedKeywords)) {
      for (const kw of scene.suggestedKeywords) {
        if (!queries.includes(kw)) {
          queries.push(kw);
        }
      }
    }

    // Fallbacks
    if (queries.length === 0) {
      queries.push('astronomy deep space', 'cosmic stars universe');
    }

    return queries.slice(0, 4);
  }

  /**
   * Normalizes shot durations within a scene so they sum strictly to targetDuration
   * while keeping every shot comfortably bounded (0.8s - 4.2s).
   */
  private normalizeShotDurations(shots: PlannedShot[], targetDuration: number): void {
    if (shots.length === 0) return;

    if (shots.length === 1) {
      shots[0].durationSeconds = Math.round(targetDuration * 100) / 100;
      return;
    }

    // Calculate raw target weights according to pacing archetype and word count
    const rawWeights = shots.map((s) => {
      const wordCount = s.narrationClause.split(/\s+/).length;
      let multiplier = 1.0;
      if (s.pacingType === 'fast') multiplier = 0.85;
      if (s.pacingType === 'establishing') multiplier = 1.2;
      return Math.max(1.0, Math.min(6.0, wordCount * 0.5 * multiplier));
    });

    const totalWeight = rawWeights.reduce((sum, w) => sum + w, 0) || 1;

    // Initial proportional assignment
    shots.forEach((s, idx) => {
      s.durationSeconds = (rawWeights[idx] / totalWeight) * targetDuration;
    });

    // Relaxation passes to enforce [0.8s, 4.2s] bounds
    for (let iter = 0; iter < 8; iter++) {
      let excess = 0;
      let adjustableCount = 0;

      for (const s of shots) {
        if (s.durationSeconds > 4.2) {
          excess += s.durationSeconds - 4.2;
          s.durationSeconds = 4.2;
        } else if (s.durationSeconds < 0.8) {
          excess -= 0.8 - s.durationSeconds;
          s.durationSeconds = 0.8;
        } else {
          adjustableCount++;
        }
      }

      if (Math.abs(excess) < 0.01 || adjustableCount === 0) break;

      const adjustPerShot = excess / adjustableCount;
      for (const s of shots) {
        if (s.durationSeconds > 0.8 && s.durationSeconds < 4.2) {
          s.durationSeconds += adjustPerShot;
        }
      }
    }

    // Strict sum rounding: round first N-1 shots and balance remainder into last shot
    let sum = 0;
    for (let i = 0; i < shots.length - 1; i++) {
      shots[i].durationSeconds = Math.round(shots[i].durationSeconds * 100) / 100;
      sum += shots[i].durationSeconds;
    }

    const lastDuration = Math.round((targetDuration - sum) * 100) / 100;
    shots[shots.length - 1].durationSeconds = lastDuration;

    // If rounding pushed the last shot slightly out of bounds, distribute with previous shot
    if (shots[shots.length - 1].durationSeconds > 4.2 && shots.length > 1) {
      const over = Math.round((shots[shots.length - 1].durationSeconds - 4.0) * 100) / 100;
      shots[shots.length - 1].durationSeconds = 4.0;
      shots[0].durationSeconds = Math.round((shots[0].durationSeconds + over) * 100) / 100;
    } else if (shots[shots.length - 1].durationSeconds < 0.8 && shots.length > 1) {
      const under = Math.round((0.8 - shots[shots.length - 1].durationSeconds) * 100) / 100;
      shots[shots.length - 1].durationSeconds = 0.8;
      shots[0].durationSeconds = Math.round((shots[0].durationSeconds - under) * 100) / 100;
    }
  }
}
