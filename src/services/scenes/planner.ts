import { NarrationArtifact, ScenePlanArtifact, SceneShot, ScriptArtifact } from '../../contracts/artifacts';
import { GeminiClient } from '../gemini/client';
import { PipelineLogger } from '../logging/logger';

export class ScenePlanner {
  constructor(private gemini: GeminiClient, private logger: PipelineLogger) {}

  public async planScenes(
    script: ScriptArtifact,
    narration: NarrationArtifact,
    allowFallback = true
  ): Promise<ScenePlanArtifact> {
    this.logger.stageStart('scene_planning', `Script beats: ${script.spokenLines.length}, Audio anchor: ${narration.audioDurationSec.toFixed(1)}s`);

    const prompt = `You are a visual director and cinematographer for short-form viral documentary videos.
Design a detailed shot list mapping the spoken narrative into compelling visual scenes.

TOPIC: "${script.topic}"
TOTAL MEASURED AUDIO DURATION: ${narration.audioDurationSec.toFixed(2)} seconds.

SPOKEN BEATS WITH TIMINGS:
${narration.lineTimings
  .map(
    (t) =>
      `Beat ${t.index} [${t.startTimeSec.toFixed(1)}s - ${(t.startTimeSec + t.durationSec).toFixed(1)}s, duration: ${t.durationSec.toFixed(1)}s]: "${t.text}"`
  )
  .join('\n')}

RULES FOR VISUAL STORYTELLING:
1. Distinguish between WHAT IS SAID and WHAT SHOULD BE SHOWN. Do not just search keywords; show the physical action, cosmic forces, human reaction, or visual metaphor.
2. Create 1 visual scene corresponding to each spoken beat (or split long beats >7s into 2 shots).
3. For each scene provide:
   - "sceneId": e.g. "scene_1", "scene_2", etc.
   - "narrationSegment": the corresponding spoken text
   - "targetDurationSec": the exact or target seconds for this visual scene
   - "visualObjective": the cinematic goal of this shot (e.g. "Establish awe and scale", "Escalate tension")
   - "visualDescription": detailed visual description of ideal stock video footage
   - "pexelsSearchQueries": 2-3 specific, high-yield Pexels search queries (e.g. ["galaxy rotation cinematic", "stars deep space", "night sky timelapse"])
   - "visualPriority": "high" | "medium" | "normal"
   - "suggestedMotion": "zoom_in" | "zoom_out" | "pan_subtle" | "static"
   - "suggestedCrop": "center" | "focus_left" | "focus_right" | "rule_of_thirds"
   - "editingGuidance": specific cut style or pacing tip (e.g. "Hold wide, slow punch-in, fast cut on word 'explosion'")`;

    const systemInstruction = `You are a world-class documentary video director. You craft visual shot plans that elevate narration into cinematic experiences. Output strict JSON.`;

    if (this.gemini.isAvailable()) {
      try {
        const raw = await this.gemini.generateStructuredContent<any>(
          prompt,
          systemInstruction,
          '{ scenes: [{ sceneId, narrationSegment, targetDurationSec, visualObjective, visualDescription, pexelsSearchQueries, visualPriority, suggestedMotion, suggestedCrop, editingGuidance }] }'
        );

        const validated = this.validateScenePlan(script, narration, raw);
        this.logger.stageCompleted('scene_planning', `Designed ${validated.scenes.length} visual shots totaling ${validated.totalEstimatedDurationSec.toFixed(1)}s`);
        return validated;
      } catch (err: any) {
        this.logger.stageError('scene_planning', err);
        if (!allowFallback) throw err;
        this.logger.warn('scene_planning', 'Using deterministic scene planner fallback due to Gemini error.');
      }
    } else {
      if (!allowFallback) {
        throw new Error('Gemini API key is required for scene planning, and fallback is disabled.');
      }
      this.logger.info('scene_planning', 'Gemini API not configured; using deterministic scene planner.');
    }

    const fallback = this.generateFallbackScenePlan(script, narration);
    this.logger.stageCompleted('scene_planning', `Designed ${fallback.scenes.length} visual shots (fallback mode)`);
    return fallback;
  }

  private validateScenePlan(
    script: ScriptArtifact,
    narration: NarrationArtifact,
    data: any
  ): ScenePlanArtifact {
    if (!data || !Array.isArray(data.scenes) || data.scenes.length === 0) {
      throw new Error('Scene plan must contain an array of scenes.');
    }

    const validMotions = ['zoom_in', 'zoom_out', 'pan_subtle', 'static'] as const;
    const validCrops = ['center', 'focus_left', 'focus_right', 'rule_of_thirds'] as const;
    const validPriorities = ['high', 'medium', 'normal'] as const;

    const scenes: SceneShot[] = data.scenes.map((s: any, idx: number) => {
      const timing = narration.lineTimings[idx] || narration.lineTimings[narration.lineTimings.length - 1];
      const targetDurationSec = typeof s.targetDurationSec === 'number' && s.targetDurationSec > 0
        ? Number(s.targetDurationSec.toFixed(2))
        : timing?.durationSec || 4.5;

      const motion = validMotions.includes(s.suggestedMotion) ? s.suggestedMotion : 'zoom_in';
      const crop = validCrops.includes(s.suggestedCrop) ? s.suggestedCrop : 'center';
      const priority = validPriorities.includes(s.visualPriority) ? s.visualPriority : 'normal';

      const queries = Array.isArray(s.pexelsSearchQueries) && s.pexelsSearchQueries.length > 0
        ? s.pexelsSearchQueries.map(String)
        : [`${script.topic} cinematic`, 'space galaxy', 'nebula particles'];

      return {
        sceneId: String(s.sceneId || `scene_${idx + 1}`),
        narrationSegment: String(s.narrationSegment || timing?.text || ''),
        targetDurationSec,
        visualObjective: String(s.visualObjective || 'Engage viewer visually'),
        visualDescription: String(s.visualDescription || 'Cinematic footage illustrating narration beat'),
        pexelsSearchQueries: queries,
        visualPriority: priority,
        suggestedMotion: motion,
        suggestedCrop: crop,
        editingGuidance: String(s.editingGuidance || 'Cut dynamically on beat'),
      };
    });

    const totalEstimatedDurationSec = Number(scenes.reduce((sum, s) => sum + s.targetDurationSec, 0).toFixed(2));

    return {
      scenes,
      totalScenes: scenes.length,
      totalEstimatedDurationSec,
      metadata: {
        model: this.gemini.isAvailable() ? 'gemini-3.8-flash' : 'fallback-planner',
        generatedAt: new Date().toISOString(),
      },
    };
  }

  private generateFallbackScenePlan(
    script: ScriptArtifact,
    narration: NarrationArtifact
  ): ScenePlanArtifact {
    const defaultQueries = [
      ['deep space stars', 'galaxy cinematic', 'night sky telescope'],
      ['plasma energy', 'solar flare', 'cosmic explosion'],
      ['nebula space', 'astronomy particles', 'black hole vortex'],
      ['earth space view', 'aurora borealis', 'cosmos glowing'],
    ];

    const motions: ('zoom_in' | 'zoom_out')[] = ['zoom_in', 'zoom_out', 'zoom_in', 'zoom_out'];

    const scenes: SceneShot[] = narration.lineTimings.map((timing, idx) => {
      const queries = defaultQueries[idx % defaultQueries.length];
      const motion = motions[idx % motions.length];

      return {
        sceneId: `scene_${idx + 1}`,
        narrationSegment: timing.text,
        targetDurationSec: timing.durationSec,
        visualObjective: idx === 0 ? 'Immediate visual hook with vast cosmic scope' : 'Escalate narrative tension and visual scale',
        visualDescription: `Cinematic high-contrast footage depicting astronomical phenomenon for beat ${idx + 1}`,
        pexelsSearchQueries: queries,
        visualPriority: idx === 0 ? 'high' : 'normal',
        suggestedMotion: motion,
        suggestedCrop: 'center',
        editingGuidance: 'Smooth camera movement, clean punchy visual cut',
      };
    });

    return {
      scenes,
      totalScenes: scenes.length,
      totalEstimatedDurationSec: narration.audioDurationSec,
      metadata: {
        model: 'deterministic-offline-scene-planner',
        generatedAt: new Date().toISOString(),
      },
    };
  }
}
