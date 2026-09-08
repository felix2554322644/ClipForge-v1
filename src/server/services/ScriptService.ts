import { ResearchArtifact, ScriptArtifact, ScriptLine, PipelineInput } from '../../types/pipeline.js';
import { getGeminiClient } from '../geminiClient.js';
import { logger } from '../logger.js';

export class ScriptService {
  // Spoken English average rate is ~2.5 - 2.8 words per second (150-165 words/min)
  private wordsPerSecond = 2.6;

  public async generateScript(jobId: string, input: PipelineInput, research: ResearchArtifact): Promise<ScriptArtifact> {
    logger.info(jobId, 'script', `Generating retention-optimized narration script for "${research.topic}"`);

    const targetSec = input.desiredDurationSec || 20;
    const targetWordCount = Math.round(targetSec * this.wordsPerSecond);
    const gemini = getGeminiClient();

    if (!gemini) {
      logger.warn(jobId, 'script', 'GEMINI_API_KEY not configured. Generating deterministic spoken script.');
      return this.generateFallbackScript(research, targetSec);
    }

    try {
      const prompt = `You are a world-class scriptwriter for viral short-form social videos (TikTok, Shorts, Reels).
Topic: "${research.topic}"
Target Duration: approximately ${targetSec} seconds (~${targetWordCount} spoken words total).
Tone: ${input.style || 'captivating, punchy, authoritative, high-curiosity'}.

Factual Research to ground the script:
- Key Facts: ${research.keyFacts.join('; ')}
- Entities: ${research.importantEntities.join(', ')}
- Visual Cues: ${research.visualOpportunities.join('; ')}

SCRIPTWRITING RULES:
1. HOOK: First sentence MUST be an immediate curiosity trigger. No "Hey guys", no "Today we are talking about". Start immediately in media res.
2. SHORT SPOKEN SENTENCES: Every sentence must be conversational and natural to say aloud. Max 8-14 words per sentence.
3. ESCALATION: Sentence 2 and 3 build tension and reveal astonishing information.
4. SATISFYING CLIMAX/RESOLUTION: Final sentence delivers a punchy realization or takeaway.
5. Provide between 4 and 6 lines total.

Respond strictly in JSON format matching this schema:
{
  "hook": string,
  "lines": [
    {
      "id": "line_1",
      "text": "Exact spoken words for this line",
      "pacing": "fast" | "moderate" | "dramatic",
      "narrativeRole": "hook" | "escalation" | "climax" | "resolution"
    }
  ],
  "targetAudience": string
}

Output pure JSON only.`;

      const response = await gemini.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.6,
        },
      });

      const text = response.text?.trim() || '{}';
      const parsed = JSON.parse(text);

      const rawLines: any[] = Array.isArray(parsed.lines) && parsed.lines.length ? parsed.lines : [];
      if (!rawLines.length) {
        return this.generateFallbackScript(research, targetSec);
      }

      const scriptLines: ScriptLine[] = rawLines.map((l, idx) => {
        const lineText = (l.text || '').trim();
        const wordCount = lineText.split(/\s+/).filter(Boolean).length;
        const estDuration = Math.max(1.8, parseFloat((wordCount / this.wordsPerSecond).toFixed(1)));
        return {
          id: l.id || `line_${idx + 1}`,
          text: lineText,
          estimatedDurationSec: estDuration,
          pacing: l.pacing || (idx === 0 ? 'fast' : 'moderate'),
          narrativeRole: l.narrativeRole || (idx === 0 ? 'hook' : idx === rawLines.length - 1 ? 'resolution' : 'escalation'),
        };
      });

      const fullNarrationText = scriptLines.map(l => l.text).join(' ');
      const totalEstimated = scriptLines.reduce((sum, l) => sum + l.estimatedDurationSec, 0);

      const artifact: ScriptArtifact = {
        topic: research.topic,
        hook: parsed.hook || scriptLines[0]?.text || research.topic,
        lines: scriptLines,
        fullNarrationText,
        estimatedTotalDurationSec: parseFloat(totalEstimated.toFixed(1)),
        targetAudience: parsed.targetAudience || 'Curious science and knowledge seekers',
        generatedAt: new Date().toISOString(),
      };

      logger.info(jobId, 'script', `Script generated: ${scriptLines.length} lines, ~${artifact.estimatedTotalDurationSec}s estimated spoken duration.`);
      return artifact;
    } catch (error: any) {
      logger.error(jobId, 'script', `Gemini script generation failed: ${error.message}. Using fallback generator.`, error);
      return this.generateFallbackScript(research, targetSec);
    }
  }

  public generateFallbackScript(research: ResearchArtifact, targetSec: number): ScriptArtifact {
    const topic = research.topic;
    const linesData: Array<{ text: string; role: ScriptLine['narrativeRole']; pacing: ScriptLine['pacing'] }> = [
      {
        text: `What happens when ${topic.toLowerCase()} pushes physics to the absolute breaking point?`,
        role: 'hook',
        pacing: 'fast',
      },
      {
        text: `Unfathomable gravitational forces warp spacetime, shredding matter at near light speed.`,
        role: 'escalation',
        pacing: 'moderate',
      },
      {
        text: `Superheated cosmic debris blazes hotter than millions of stars combined in a catastrophic dance.`,
        role: 'climax',
        pacing: 'dramatic',
      },
      {
        text: `Nothing survives the event, leaving only shockwaves echoing through the deep void of space.`,
        role: 'resolution',
        pacing: 'moderate',
      },
    ];

    const lines: ScriptLine[] = linesData.map((d, idx) => {
      const words = d.text.split(/\s+/).length;
      const estDuration = Math.max(2.0, parseFloat((words / this.wordsPerSecond).toFixed(1)));
      return {
        id: `line_${idx + 1}`,
        text: d.text,
        estimatedDurationSec: estDuration,
        pacing: d.pacing,
        narrativeRole: d.role,
      };
    });

    const totalEstimated = lines.reduce((sum, l) => sum + l.estimatedDurationSec, 0);
    return {
      topic: research.topic,
      hook: lines[0].text,
      lines,
      fullNarrationText: lines.map(l => l.text).join(' '),
      estimatedTotalDurationSec: parseFloat(totalEstimated.toFixed(1)),
      targetAudience: 'General curious audience',
      generatedAt: new Date().toISOString(),
    };
  }
}

export const scriptService = new ScriptService();
