import { ScriptArtifact, ScenePlanArtifact, PlannedScene } from '../../types/pipeline.js';
import { getGeminiClient } from '../geminiClient.js';
import { logger } from '../logger.js';

export class ScenePlanner {
  public async planScenes(jobId: string, script: ScriptArtifact): Promise<ScenePlanArtifact> {
    logger.info(jobId, 'scene_planning', `Designing visual scene shot plan from ${script.lines.length} script beats`);

    const gemini = getGeminiClient();

    if (!gemini) {
      logger.warn(jobId, 'scene_planning', 'GEMINI_API_KEY not configured. Generating deterministic scene plan.');
      return this.generateFallbackScenePlan(script);
    }

    try {
      const prompt = `You are an elite short-form video editor and director creating a shot-by-shot visual scene plan.
Video Topic: "${script.topic}"
Script Lines:
${script.lines.map((l, i) => `[Line ${i + 1}] (${l.narrativeRole}, ~${l.estimatedDurationSec}s): "${l.text}"`).join('\n')}

DIRECTOR INSTRUCTIONS:
1. Map each script line to a dedicated visual scene.
2. For each scene, specify:
   - "visualObjective": What the visual must convey to the viewer (e.g., "Establish cosmic mystery and dread", "Illustrate violent stellar disintegration").
   - "visualDescription": Specific cinematic imagery to look for.
   - "searchQueries": Exactly 3 highly targeted, stock-video friendly search queries for Pexels (e.g. ["black hole space", "spinning galaxy", "nebula stars"]). Make queries visual, simple, and high probability in stock video libraries.
   - "preferredBrollType": "cinematic" | "macro" | "action" | "landscape" | "abstract"
   - "importance": "high" | "medium" | "normal"
   - "editingGuidance":
       "cameraMotion": "slow_zoom_in" | "slow_zoom_out" | "static" | "pan"
       "cutPacing": "fast" | "moderate"
       "transition": "cut" | "fade"

Output valid JSON matching this schema:
{
  "scenes": [
    {
      "sceneId": "scene_1",
      "narrationLineId": "line_1",
      "visualObjective": string,
      "visualDescription": string,
      "searchQueries": string[],
      "preferredBrollType": "cinematic" | "macro" | "action" | "landscape" | "abstract",
      "importance": "high" | "medium" | "normal",
      "editingGuidance": {
        "cameraMotion": "slow_zoom_in" | "slow_zoom_out" | "static" | "pan",
        "cutPacing": "fast" | "moderate",
        "transition": "cut" | "fade"
      }
    }
  ]
}

Output pure JSON only.`;

      const response = await gemini.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.4,
        },
      });

      const text = response.text?.trim() || '{}';
      const parsed = JSON.parse(text);

      const rawScenes: any[] = Array.isArray(parsed.scenes) && parsed.scenes.length ? parsed.scenes : [];
      if (!rawScenes.length) {
        return this.generateFallbackScenePlan(script);
      }

      const scenes: PlannedScene[] = script.lines.map((line, idx) => {
        const raw = rawScenes[idx] || {};
        return {
          sceneId: `scene_${idx + 1}`,
          narrationLineId: line.id,
          narrationText: line.text,
          estimatedDurationSec: line.estimatedDurationSec,
          visualObjective: raw.visualObjective || `Illustrate ${line.narrativeRole} beat`,
          visualDescription: raw.visualDescription || `Cinematic visual supporting: ${line.text}`,
          searchQueries: Array.isArray(raw.searchQueries) && raw.searchQueries.length
            ? raw.searchQueries.slice(0, 3)
            : this.generateDefaultQueries(script.topic, idx),
          preferredBrollType: raw.preferredBrollType || 'cinematic',
          importance: raw.importance || (idx === 0 || idx === script.lines.length - 1 ? 'high' : 'medium'),
          editingGuidance: {
            cameraMotion: raw.editingGuidance?.cameraMotion || (idx % 2 === 0 ? 'slow_zoom_in' : 'slow_zoom_out'),
            cutPacing: raw.editingGuidance?.cutPacing || 'moderate',
            transition: raw.editingGuidance?.transition || 'cut',
          },
        };
      });

      const totalPlannedDurationSec = scenes.reduce((sum, s) => sum + s.estimatedDurationSec, 0);

      const artifact: ScenePlanArtifact = {
        scenes,
        totalPlannedDurationSec: parseFloat(totalPlannedDurationSec.toFixed(1)),
        targetAspectRatio: '9:16',
        generatedAt: new Date().toISOString(),
      };

      logger.info(jobId, 'scene_planning', `Planned ${scenes.length} distinct visual scenes across ${totalPlannedDurationSec}s.`);
      return artifact;
    } catch (error: any) {
      logger.error(jobId, 'scene_planning', `Gemini scene planning failed: ${error.message}. Using fallback planner.`, error);
      return this.generateFallbackScenePlan(script);
    }
  }

  public generateFallbackScenePlan(script: ScriptArtifact): ScenePlanArtifact {
    const scenes: PlannedScene[] = script.lines.map((line, idx) => ({
      sceneId: `scene_${idx + 1}`,
      narrationLineId: line.id,
      narrationText: line.text,
      estimatedDurationSec: line.estimatedDurationSec,
      visualObjective: `Visualize ${line.narrativeRole}: ${line.text.slice(0, 40)}...`,
      visualDescription: `Cinematic high-contrast footage depicting ${script.topic}`,
      searchQueries: this.generateDefaultQueries(script.topic, idx),
      preferredBrollType: idx === 0 ? 'cinematic' : idx === 2 ? 'action' : 'landscape',
      importance: idx === 0 || idx === script.lines.length - 1 ? 'high' : 'medium',
      editingGuidance: {
        cameraMotion: idx % 2 === 0 ? 'slow_zoom_in' : 'slow_zoom_out',
        cutPacing: 'moderate',
        transition: 'cut',
      },
    }));

    const totalPlannedDurationSec = scenes.reduce((sum, s) => sum + s.estimatedDurationSec, 0);
    return {
      scenes,
      totalPlannedDurationSec: parseFloat(totalPlannedDurationSec.toFixed(1)),
      targetAspectRatio: '9:16',
      generatedAt: new Date().toISOString(),
    };
  }

  private generateDefaultQueries(topic: string, sceneIndex: number): string[] {
    const baseWords = topic.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(w => w.length > 2);
    const key = baseWords.slice(0, 2).join(' ') || 'space cosmos';

    const visualVariations = [
      [`${key} cinematic`, `${key} mystery`, 'space stars galaxy'],
      [`${key} motion`, 'cosmic explosion', 'stellar nebula'],
      [`${key} intense`, 'fire explosion debris', 'deep universe'],
      [`${key} calm`, 'earth space view', 'stars timelapse'],
    ];

    return visualVariations[sceneIndex % visualVariations.length];
  }
}

export const scenePlanner = new ScenePlanner();
