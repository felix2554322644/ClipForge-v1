import {
  Storyboard,
  StoryboardShot,
  StoryboardInput,
  VisualPriority,
  PreferredVisualType,
} from '../../types/storyboard';
import { ScriptScene } from '../../types/pipeline';
import { VideoFormat, EditorialMotion, EditorialTransition } from '../../types/editorial';

export class DeterministicStoryboardEngine {
  /**
   * Generates a rich, story-driven storyboard deterministically from script and measured duration.
   */
  generateStoryboard(input: StoryboardInput): Storyboard {
    const format: VideoFormat = input.format === 'long' ? 'long' : 'short';
    const totalDuration = Math.max(1.0, input.narrationDurationSeconds);
    const scenes = input.script.scenes || [];
    const maxDur = format === 'long' ? 8.0 : 4.5;

    const rawShots: StoryboardShot[] = [];
    let globalShotIndex = 0;

    const motionCycle: EditorialMotion[] = [
      'zoom_in',
      'pan_left',
      'static',
      'zoom_out',
      'pan_right',
    ];

    for (let sceneIdx = 0; sceneIdx < scenes.length; sceneIdx++) {
      const scene = scenes[sceneIdx];
      const visualBeats = this.extractStoryBeats(scene, sceneIdx, scenes.length, format);

      for (let beatIdx = 0; beatIdx < visualBeats.length; beatIdx++) {
        const beat = visualBeats[beatIdx];
        const shotId = `shot_${sceneIdx}_${beatIdx}`;
        const motionEffect = motionCycle[globalShotIndex % motionCycle.length];
        const transition: EditorialTransition =
          beatIdx === 0 && sceneIdx > 0 ? (sceneIdx % 3 === 0 ? 'fade' : 'cut') : 'cut';

        const visualPurpose = this.determineVisualPurpose(sceneIdx, scenes.length, beatIdx, visualBeats.length);
        const visualPriority: VisualPriority = this.determineVisualPriority(sceneIdx, scenes.length, beatIdx);
        const preferredVisualType: PreferredVisualType = this.determineVisualType(beat.clause);
        const searchQueries = this.generateSemanticQueries(beat, scene);

        rawShots.push({
          shotId,
          sceneIndex: scene.index,
          shotIndex: beatIdx,
          narrationStart: 0,
          narrationEnd: 0,
          durationSeconds: beat.weight,
          narrationClause: beat.clause,
          visualSubject: beat.visualSubject,
          action: beat.action,
          environment: beat.environment,
          emotion: beat.emotion,
          mood: beat.emotion,
          framing: beat.framing,
          composition: beat.framing,
          cameraMovement: beat.cameraMovement,
          visualPurpose,
          visualPriority,
          preferredVisualType,
          searchQueries,
          pacingType: beat.pacing,
          suggestedMotionEffect: motionEffect,
          suggestedTransition: transition,
        });

        globalShotIndex++;
      }
    }

    if (rawShots.length === 0) {
      rawShots.push({
        shotId: 'shot_0_0',
        sceneIndex: 0,
        shotIndex: 0,
        narrationStart: 0,
        narrationEnd: totalDuration,
        durationSeconds: totalDuration,
        narrationClause: input.narrationText || 'Cosmic exploration',
        visualSubject: 'Deep space cosmic nebula',
        action: 'Swirling star clusters and interstellar dust',
        environment: 'Vast cosmos with glowing ultraviolet light',
        emotion: 'Awe-inspiring cosmic mystery',
        mood: 'Awe-inspiring cosmic mystery',
        framing: 'wide establishing',
        composition: 'wide establishing',
        cameraMovement: 'slow push in',
        visualPurpose: 'hook_grab',
        visualPriority: 'critical',
        preferredVisualType: 'stock',
        searchQueries: ['deep space nebula stars', 'galaxy rotating cosmos', 'starry night universe'],
        pacingType: 'establishing',
        suggestedMotionEffect: 'zoom_in',
        suggestedTransition: 'cut',
      });
    }

    // If totalDuration is large (e.g. long format), subdivide shots so each shot stays within maxDur
    while (rawShots.length > 0 && totalDuration / rawShots.length > maxDur && rawShots.length < 50) {
      // Find the shot with highest duration / word count and split it
      let longestIdx = 0;
      for (let i = 1; i < rawShots.length; i++) {
        if (rawShots[i].durationSeconds > rawShots[longestIdx].durationSeconds) {
          longestIdx = i;
        }
      }
      const target = rawShots[longestIdx];
      const words = target.narrationClause.split(/\s+/);
      if (words.length > 1) {
        const mid = Math.ceil(words.length / 2);
        const part1 = words.slice(0, mid).join(' ');
        const part2 = words.slice(mid).join(' ');
        target.narrationClause = part1;
        target.durationSeconds = target.durationSeconds / 2;

        const newShot: StoryboardShot = {
          ...target,
          shotId: `${target.shotId}_b`,
          shotIndex: target.shotIndex + 1,
          narrationClause: part2,
          framing: target.framing === 'wide establishing' ? 'extreme close-up detail' : 'wide establishing',
          cameraMovement: 'kinetic punch in',
          suggestedMotionEffect: 'pan_left',
        };
        rawShots.splice(longestIdx + 1, 0, newShot);
      } else {
        target.durationSeconds = target.durationSeconds / 2;
        const newShot: StoryboardShot = {
          ...target,
          shotId: `${target.shotId}_b`,
          shotIndex: target.shotIndex + 1,
          framing: 'extreme close-up detail',
          cameraMovement: 'slow orbital drift',
        };
        rawShots.splice(longestIdx + 1, 0, newShot);
      }
    }

    // Distribute total duration across shots and build monotonic timestamps
    this.normalizeTimings(rawShots, totalDuration, format);

    return {
      title: input.script.title || 'AI Storyboard',
      totalDurationSeconds: totalDuration,
      format,
      pacingSummary: `Structured ${rawShots.length}-shot visual narrative designed for ${format.toUpperCase()} video pacing.`,
      visualThemes: input.script.scenes.flatMap((s) => s.suggestedKeywords || []).slice(0, 5),
      shots: rawShots,
      totalShots: rawShots.length,
      generatedBy: 'deterministic_fallback',
    };
  }

  /**
   * Breaks a scene into story-driven visual beats.
   * Handles:
   * 1. Multi-shot clauses: single descriptive/dramatic clause expanded to 2 distinct visual shots.
   * 2. Multi-clause shots: consecutive short/connective clauses combined into 1 visual shot.
   */
  private extractStoryBeats(
    scene: ScriptScene,
    sceneIdx: number,
    totalScenes: number,
    format: VideoFormat
  ): {
    clause: string;
    weight: number;
    visualSubject: string;
    action: string;
    environment: string;
    emotion: string;
    framing: string;
    cameraMovement: string;
    pacing: 'fast' | 'normal' | 'establishing';
  }[] {
    const text = scene.narration.trim();
    if (!text) {
      return [
        {
          clause: 'Cosmic scene',
          weight: 1,
          visualSubject: 'Deep space cosmic anomaly',
          action: 'Pulsing radiation waves',
          environment: 'Interstellar dark void',
          emotion: 'curious awe',
          framing: 'wide panorama',
          cameraMovement: 'slow push in',
          pacing: 'normal',
        },
      ];
    }

    // Raw sentence/clause segmentation
    const sentences = text.split(/(?<=[.?!;—])\s+/).filter(Boolean);
    const rawClauses: string[] = [];

    for (const sent of sentences) {
      const parts = sent.split(/,\s+(?=[a-zA-Z])/).filter(Boolean);
      for (const p of parts) {
        rawClauses.push(p.trim());
      }
    }

    // Step 1: Combine very short connective clauses into single multi-clause shots
    const consolidatedClauses: string[] = [];
    let buffer = '';

    for (let i = 0; i < rawClauses.length; i++) {
      const c = rawClauses[i];
      const wordCount = c.split(/\s+/).length;

      if (wordCount <= 3 && i < rawClauses.length - 1) {
        buffer = buffer ? `${buffer}, ${c}` : c;
      } else {
        if (buffer) {
          consolidatedClauses.push(`${buffer}, ${c}`);
          buffer = '';
        } else {
          consolidatedClauses.push(c);
        }
      }
    }
    if (buffer) consolidatedClauses.push(buffer);

    // Step 2: Expand highly descriptive / dramatic clauses into multi-shot visual beats
    const beats: {
      clause: string;
      weight: number;
      visualSubject: string;
      action: string;
      environment: string;
      emotion: string;
      framing: string;
      cameraMovement: string;
      pacing: 'fast' | 'normal' | 'establishing';
    }[] = [];

    for (let i = 0; i < consolidatedClauses.length; i++) {
      const clause = consolidatedClauses[i];
      const words = clause.split(/\s+/);
      const lower = clause.toLowerCase();

      // Check if this clause deserves a multi-shot expansion
      // Criteria: single-clause scene with dramatic contrast or hook expansion
      const isDramaticContrast =
        consolidatedClauses.length === 1 &&
        /spinning|burst|magnetar|black hole|explosion|core|gravity|light year|energy|billion|million/i.test(lower) &&
        words.length >= 7;

      const isHookExpansion =
        consolidatedClauses.length === 1 &&
        sceneIdx === 0 &&
        i === 0 &&
        words.length >= 8;

      if (isDramaticContrast || isHookExpansion) {
        // Multi-shot clause expansion (Requirement 4)
        const mid = Math.ceil(words.length / 2);
        const clausePart1 = words.slice(0, mid).join(' ');
        const clausePart2 = words.slice(mid).join(' ');

        // Shot 1: Macro / Establishing Subject
        const intent1 = this.deriveVisualIntent(clausePart1, sceneIdx, 0);
        intent1.framing = sceneIdx === 0 ? 'wide establishing' : 'medium hero shot';
        intent1.cameraMovement = 'dynamic push in';
        intent1.pacing = sceneIdx === 0 ? 'establishing' : 'normal';

        // Shot 2: Detailed Action / Reaction / Core Impact
        const intent2 = this.deriveVisualIntent(clausePart2, sceneIdx, 1);
        intent2.framing = 'extreme close-up detail';
        intent2.cameraMovement = 'rapid pull out with rotational drift';
        intent2.pacing = 'fast';

        beats.push(
          {
            clause: clausePart1,
            weight: Math.max(1.2, words.length * 0.25),
            ...intent1,
          },
          {
            clause: clausePart2,
            weight: Math.max(1.2, words.length * 0.25),
            ...intent2,
          }
        );
      } else {
        const intent = this.deriveVisualIntent(clause, sceneIdx, i);
        if (i > 0) {
          intent.framing = 'extreme close-up detail';
          intent.cameraMovement = 'orbital rotation with rapid micro-zooms';
          intent.pacing = 'fast';
        }
        beats.push({
          clause,
          weight: Math.max(1.0, words.length * 0.45),
          ...intent,
        });
      }
    }

    return beats.length > 0
      ? beats
      : [
          {
            clause: text,
            weight: 3.0,
            ...this.deriveVisualIntent(text, sceneIdx, 0),
          },
        ];
  }

  /**
   * Derives rich semantic visual intent (subject, action, environment, emotion, framing, camera)
   * from narration clause context.
   */
  private deriveVisualIntent(
    clause: string,
    sceneIdx: number,
    shotIdx: number
  ): {
    visualSubject: string;
    action: string;
    environment: string;
    emotion: string;
    framing: string;
    cameraMovement: string;
    pacing: 'fast' | 'normal' | 'establishing';
  } {
    const lower = clause.toLowerCase();

    let visualSubject = 'Deep space cosmic phenomenon';
    let action = 'Swirling stellar clouds and high-energy particles';
    let environment = 'Deep interstellar void';
    let emotion = 'Awe and cosmic wonder';
    let framing = 'wide cinematic perspective';
    let cameraMovement = 'slow forward push in';
    let pacing: 'fast' | 'normal' | 'establishing' = 'normal';

    if (/telescope|observatory|astronomer|radio dish|listen|detect|signal/i.test(lower)) {
      visualSubject = 'Massive parabolic radio telescope array';
      action = 'Dishes smoothly tilting under a starry night sky';
      environment = 'High-altitude desert observatory beneath the Milky Way';
      emotion = 'Scientific tension and discovery';
      framing = shotIdx === 0 ? 'wide establishing' : 'low-angle epic shot';
      cameraMovement = 'slow upward tilt';
    } else if (/magnetar|neutron star|dead star|pulsar|core/i.test(lower)) {
      visualSubject = 'Ultra-dense spinning magnetar with hyper-intense magnetic fields';
      action = 'Glowing plasma arcs erupting across the cracked stellar crust';
      environment = 'Cosmic deep space surrounded by glowing accretion matter';
      emotion = 'Overwhelming awe and raw astronomical power';
      framing = shotIdx === 0 ? 'wide establishing' : 'extreme close-up detail';
      cameraMovement = shotIdx === 0 ? 'smooth cinematic push in' : 'orbital rotation with rapid micro-zooms';
      pacing = shotIdx === 0 ? 'establishing' : 'fast';
    } else if (/magnetic field|shockwave|burst|flash|energy|plasma|radiation|explosion/i.test(lower)) {
      visualSubject = 'Cataclysmic relativistic shockwave and plasma burst';
      action = 'Violent expansion of blinding high-energy photons into space';
      environment = 'Interstellar medium illuminated by gamma radiation';
      emotion = 'Explosive escalation and breathtaking tension';
      framing = shotIdx === 0 ? 'wide establishing' : 'wide dynamic angle';
      cameraMovement = 'rapid punch in with kinetic shake';
      pacing = 'fast';
    } else if (/galaxy|nebula|deep space|cosmos|universe|stars/i.test(lower)) {
      visualSubject = 'Vibrant spiral galaxy and luminescent nebula';
      action = 'Rotating galactic arms glowing with billions of newborn stars';
      environment = 'Limitless cosmic expanse with multi-hued gas clouds';
      emotion = 'Timeless majesty and wonder';
      framing = shotIdx === 0 ? 'wide establishing' : 'vast aerial panorama';
      cameraMovement = 'slow drift pan left';
    } else if (/earth|planet|world|atmosphere|sky/i.test(lower)) {
      visualSubject = 'Planet Earth observed from low orbit';
      action = 'Atmospheric terminator line separating daylight and sparkling city lights';
      environment = 'Orbital space above blue oceans and weather systems';
      emotion = 'Fragility and profound perspective';
      framing = shotIdx === 0 ? 'wide establishing' : 'medium orbital overview';
      cameraMovement = 'steady cinematic tracking';
    }

    if (sceneIdx === 0 && shotIdx === 0) {
      framing = 'wide establishing';
      cameraMovement = 'smooth cinematic push in';
      pacing = 'establishing';
      emotion = 'electrifying curiosity and suspense';
    }

    return {
      visualSubject,
      action,
      environment,
      emotion,
      framing,
      cameraMovement,
      pacing,
    };
  }

  private determineVisualPurpose(
    sceneIdx: number,
    totalScenes: number,
    beatIdx: number,
    totalBeatsInScene: number
  ): string {
    if (sceneIdx === 0 && beatIdx === 0) return 'hook_grab';
    if (sceneIdx === 0) return 'mystery_escalation';
    if (sceneIdx === totalScenes - 1 && beatIdx === totalBeatsInScene - 1) return 'closing_call_to_action';
    if (sceneIdx === totalScenes - 1) return 'emotional_payoff';
    if (sceneIdx === 1) return 'mechanism_explanation';
    return 'story_escalation';
  }

  private determineVisualPriority(sceneIdx: number, totalScenes: number, beatIdx: number): VisualPriority {
    if (sceneIdx === 0) return 'critical';
    if (sceneIdx === totalScenes - 1 && beatIdx === 0) return 'critical';
    if (beatIdx === 0) return 'high';
    return 'medium';
  }

  private determineVisualType(clause: string): PreferredVisualType {
    const lower = clause.toLowerCase();
    if (/\d+[%xX]|\btrillion\b|\bbillion\b|\bmillion\b/i.test(lower)) {
      return 'stock'; // Stock footage with graphic/typography overlay
    }
    return 'stock';
  }

  /**
   * Generates 2-4 clean, high-signal search queries for Pexels/Pixabay stock footage discovery.
   */
  private generateSemanticQueries(
    beat: { visualSubject: string; action: string; environment: string; clause: string },
    scene: ScriptScene
  ): string[] {
    const queries: string[] = [];
    const lower = beat.clause.toLowerCase();

    if (/telescope|observatory|astronomer|listen|detect/i.test(lower)) {
      queries.push('radio telescope starry night', 'astronomical observatory night sky', 'space telescope dish');
    } else if (/magnetar|neutron star|dead star|pulsar/i.test(lower)) {
      queries.push('spinning neutron star space', 'pulsar celestial energy', 'magnetar cosmic core');
    } else if (/magnetic field|plasma|flare|shockwave|burst/i.test(lower)) {
      queries.push('solar flare plasma explosion', 'magnetic field energy lines', 'cosmic burst shockwave');
    } else if (/galaxy|nebula|cosmos|universe/i.test(lower)) {
      queries.push('deep space colorful nebula', 'spiral galaxy rotating', 'milky way starry universe');
    } else if (/earth|planet|orbit/i.test(lower)) {
      queries.push('planet earth from space', 'earth orbit blue atmosphere');
    }

    // Integrate scene keywords
    if (scene.suggestedKeywords && Array.isArray(scene.suggestedKeywords)) {
      for (const kw of scene.suggestedKeywords) {
        const cleanKw = kw.replace(/[^\w\s-]/g, '').trim().toLowerCase();
        if (cleanKw.length >= 3 && !queries.includes(cleanKw)) {
          queries.push(cleanKw);
        }
      }
    }

    if (queries.length === 0) {
      queries.push('deep space galaxy stars', 'cosmic nebula universe');
    }

    return queries.slice(0, 4);
  }

  /**
   * Normalizes shot durations strictly to totalDuration and creates continuous timestamps.
   */
  private normalizeTimings(shots: StoryboardShot[], totalDuration: number, format: VideoFormat): void {
    if (shots.length === 0) return;

    const minDur = format === 'long' ? 1.2 : 0.75;
    const maxDur = format === 'long' ? 8.0 : 4.5;

    if (shots.length === 1) {
      shots[0].narrationStart = 0;
      shots[0].narrationEnd = Math.round(totalDuration * 100) / 100;
      shots[0].durationSeconds = shots[0].narrationEnd;
      return;
    }

    const rawSum = shots.reduce((acc, s) => acc + s.durationSeconds, 0) || 1;
    for (const s of shots) {
      s.durationSeconds = (s.durationSeconds / rawSum) * totalDuration;
    }

    // Relaxation passes
    for (let iter = 0; iter < 10; iter++) {
      let excess = 0;
      let flexible = 0;

      for (const s of shots) {
        if (s.durationSeconds > maxDur) {
          excess += s.durationSeconds - maxDur;
          s.durationSeconds = maxDur;
        } else if (s.durationSeconds < minDur) {
          excess -= minDur - s.durationSeconds;
          s.durationSeconds = minDur;
        } else {
          flexible++;
        }
      }

      if (Math.abs(excess) < 0.01 || flexible === 0) break;

      const adjust = excess / flexible;
      for (const s of shots) {
        if (s.durationSeconds > minDur && s.durationSeconds < maxDur) {
          s.durationSeconds += adjust;
        }
      }
    }

    let allocated = 0;
    for (let i = 0; i < shots.length - 1; i++) {
      shots[i].durationSeconds = Math.round(shots[i].durationSeconds * 100) / 100;
      allocated += shots[i].durationSeconds;
    }

    const lastDur = Math.round((totalDuration - allocated) * 100) / 100;
    shots[shots.length - 1].durationSeconds = lastDur;

    if (shots[shots.length - 1].durationSeconds < minDur && shots.length > 1) {
      const diff = Math.round((minDur - shots[shots.length - 1].durationSeconds) * 100) / 100;
      shots[shots.length - 1].durationSeconds = minDur;
      shots[0].durationSeconds = Math.round((shots[0].durationSeconds - diff) * 100) / 100;
    }

    let curTime = 0;
    for (let i = 0; i < shots.length; i++) {
      shots[i].narrationStart = Math.round(curTime * 100) / 100;
      curTime += shots[i].durationSeconds;
      shots[i].narrationEnd = Math.round(curTime * 100) / 100;
    }

    shots[shots.length - 1].narrationEnd = Math.round(totalDuration * 100) / 100;
    shots[shots.length - 1].durationSeconds =
      Math.round((shots[shots.length - 1].narrationEnd - shots[shots.length - 1].narrationStart) * 100) / 100;
  }
}
