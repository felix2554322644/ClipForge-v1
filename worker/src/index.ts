import { generateScriptWithGemini } from './gemini';
import { searchPexelsVideos, searchPixabayVideos, StockVideoAsset } from './broll';
import { RenderSpec, RenderSpecCut } from './renderSpecTypes';

export interface Env {
  GEMINI_API_KEY: string;
  GEMINI_MODEL?: string;
  PEXELS_API_KEY?: string;
  PIXABAY_API_KEY?: string;
  ALLOW_LANDSCAPE_FALLBACK?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    if (url.pathname === '/health' || url.pathname === '/') {
      return Response.json({
        status: 'ok',
        service: 'clipforge-worker',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
      });
    }

    if (url.pathname === '/generate-spec' && request.method === 'POST') {
      try {
        const body = (await request.json().catch(() => ({}))) as {
          topic?: string;
          duration?: number;
        };
        const topic = body.topic || 'Why Do We Dream?';

        const script = await generateScriptWithGemini(
          topic,
          env.GEMINI_API_KEY,
          env.GEMINI_MODEL || 'gemini-3.6-flash'
        );

        const cuts: RenderSpecCut[] = [];
        let accumulatedTime = 0;

        for (let i = 0; i < script.scenes.length; i++) {
          const scene = script.scenes[i];
          const beatDuration = 5.0; // 5 seconds per beat default

          let candidateAsset: StockVideoAsset | null = null;
          if (env.PEXELS_API_KEY) {
            const pexels = await searchPexelsVideos(scene.searchQuery, env.PEXELS_API_KEY);
            candidateAsset = pexels.find((p) => p.nativeVertical) || pexels[0] || null;
          }
          if (!candidateAsset && env.PIXABAY_API_KEY) {
            const pixabay = await searchPixabayVideos(scene.searchQuery, env.PIXABAY_API_KEY);
            candidateAsset = pixabay.find((p) => p.nativeVertical) || pixabay[0] || null;
          }

          const resolvedAsset = candidateAsset || {
            id: `stock_${i + 1}`,
            provider: 'pexels' as const,
            url: 'https://www.pexels.com',
            downloadUrl: 'https://example.com/asset.mp4',
            width: 1080,
            height: 1920,
            aspectRatio: 9 / 16,
            nativeVertical: true,
            duration: beatDuration,
            tags: [scene.visualSubject],
          };

          cuts.push({
            shotId: `shot_${i + 1}`,
            sceneIndex: i,
            shotIndex: 0,
            beat: scene.beat,
            narrationClause: scene.narration,
            visualSubject: scene.visualSubject,
            inPoint: 0,
            outPoint: beatDuration,
            durationSeconds: beatDuration,
            asset: {
              url: resolvedAsset.url,
              downloadUrl: resolvedAsset.downloadUrl,
              provider: resolvedAsset.provider,
              sourceId: resolvedAsset.id,
              license: 'royalty_free',
              width: resolvedAsset.width,
              height: resolvedAsset.height,
              aspectRatio: resolvedAsset.aspectRatio,
              nativeVertical: resolvedAsset.nativeVertical,
              tags: resolvedAsset.tags,
            },
            motion: {
              type: i === 0 ? 'zoom_in' : 'pan_foreboding',
              easing: 'easeInOutCubic',
              startScale: 1.0,
              endScale: 1.15,
              speedMultiplier: 1.0,
            },
            grading: {
              pass1Normalize: { brightness: 0, contrast: 1.0, saturation: 1.0 },
              pass2Mood: {
                mood: 'tense_cool',
                colorTempShift: -15,
                gamma: 1.0,
                filmGrain: 0.02,
              },
            },
            tonalMatch: { targetLuminance: 0.5, starkJumpOnPeak: scene.beat === 'peak_implication' },
            transition: {
              type: scene.beat === 'peak_implication' ? 'signature_twist_reveal' : 'cut',
              durationSeconds: 0.2,
            },
          });

          accumulatedTime += beatDuration;
        }

        const spec: RenderSpec = {
          version: '2.0.0',
          jobId: `job_${Date.now()}`,
          createdAt: new Date().toISOString(),
          niche: 'what_if_thought_experiment',
          topic: {
            title: topic,
            premise: script.premise,
            category: 'science_curiosity',
            motif: 'clock_ticking',
          },
          targetDurationSeconds: accumulatedTime,
          tensionCurve: script.scenes.map((s, idx) => ({
            timestampSeconds: idx * 5.0,
            tensionLevel: s.tensionLevel || 0.5,
            beat: s.beat,
            pacing: idx < 2 ? 'building' : idx === 3 ? 'held_breath' : 'reframe',
          })),
          cuts,
          audio: {
            narration: {
              text: script.scenes.map((s) => s.narration).join(' '),
              voice: 'en_US-lessac-medium',
              paceModifier: 1.0,
            },
            musicBed: {
              trackName: 'cinematic_ambient',
              genreMood: 'tense_investigative',
              volume: 0.35,
              duckingDb: 10,
              fadeInSeconds: 0.5,
              fadeOutSeconds: 1.0,
            },
            ambienceLoops: [],
          },
          captions: {
            enabled: true,
            words: [],
            style: {
              typeface: 'Liberation Sans',
              accentColor: '#FFE600',
              adaptiveLegibility: true,
              position: 'lower_third',
              maxWordsPerCluster: 4,
            },
          },
          remotionOverlays: {
            hookTypography: {
              enabled: true,
              headline: topic,
              durationSeconds: 2.5,
            },
            signatureReveal: {
              enabled: true,
              triggerTimestampSeconds: cuts.find((c) => c.beat === 'peak_implication')?.durationSeconds || 15.0,
              flashIntensity: 0.8,
            },
            endCard: {
              enabled: true,
              reframeText: script.scenes[script.scenes.length - 1]?.narration || 'ClipForge',
              brandName: 'ClipForge',
              durationSeconds: 2.0,
            },
          },
          distribution: {
            titleVariants: [topic],
            thumbnailHook: topic,
            description: script.premise,
            hashtags: ['#curiosity', '#science', '#whatif'],
          },
          directorsCommentary: {
            narrativeRationale: 'Everyday curiosity structure with high hook retention.',
            visualMotif: 'Dark atmospheric tension with gold accent captions.',
            pacingStrategy: 'Progressive build with held breath at peak implication.',
            peakTwistExplanation: 'Reveals the counter-intuitive core truth.',
          },
        };

        return Response.json(spec, {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500 });
      }
    }

    return new Response('Not Found', { status: 404 });
  },
};
