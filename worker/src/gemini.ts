import { GoogleGenAI } from '@google/genai';

export interface WorkerScript {
  topic: string;
  premise: string;
  scenes: Array<{
    beat: 'hook' | 'ground_it' | 'escalation' | 'peak_implication' | 'reframe_line';
    narration: string;
    visualSubject: string;
    searchQuery: string;
    tensionLevel: number;
  }>;
}

export async function generateScriptWithGemini(
  topic: string,
  apiKey: string,
  modelName = 'gemini-3.6-flash'
): Promise<WorkerScript> {
  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `You are the Lead Editorial Director and Scriptwriter for ClipForge, producing high-retention 9:16 vertical short videos based on curiosity and thought experiments.
Follow the strict 5-beat Everyday Curiosity narrative structure:
1. hook: High curiosity question or statement (<3 seconds).
2. ground_it: Relatable context or baseline reality.
3. escalation: Tension or scientific stakes rise.
4. peak_implication: The dramatic twist or shocking realization.
5. reframe_line: Lingering takeaway or lasting perspective.

Output MUST be strictly valid JSON matching this schema:
{
  "topic": string,
  "premise": string,
  "scenes": [
    {
      "beat": "hook" | "ground_it" | "escalation" | "peak_implication" | "reframe_line",
      "narration": string,
      "visualSubject": string,
      "searchQuery": string,
      "tensionLevel": number
    }
  ]
}`;

  const response = await ai.models.generateContent({
    model: modelName,
    contents: `Write a compelling 30-45 second vertical video script on the topic: "${topic}".`,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      temperature: 0.7,
    },
  });

  const text = response.text || '{}';
  return JSON.parse(text) as WorkerScript;
}
