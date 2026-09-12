import test from 'node:test';
import assert from 'node:assert/strict';
import { AIDirectorService } from '../src/services/editorial/director';
import { VisualGroundingService } from '../src/services/editorial/visualGrounding';
import { GeminiClient, GeminiContents, GeminiPart } from '../src/services/gemini/client';
import { AIDirectorValidator } from '../src/services/editorial/validator';
import { Storyboard } from '../src/types/storyboard';
import {
  AIDirectorInput,
  BrollCandidateBoard,
  CandidateBrollAsset,
  EditorialPlan,
} from '../src/types/editorial';
import { PipelineLogger } from '../src/services/logging/logger';
import { getFormatProfile, CLIPFORGE_NICHE_PROFILE } from '../src/services/editorial/profiles';

const logger = new PipelineLogger();

function createSampleCandidates(): CandidateBrollAsset[] {
  // A 1x1 transparent JPEG in base64
  const sampleBase64Jpeg =
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

  return [
    {
      id: 'candidate_magnetar_accurate',
      provider: 'pexels',
      providerAssetId: 'px_101',
      downloadUrl: '/tmp/px_101.mp4',
      durationSeconds: 8.0,
      width: 1080,
      height: 1920,
      aspectRatio: 1080 / 1920,
      nativeVertical: true,
      tags: ['space', 'pulsar', 'spinning neutron star'],
      queryUsed: 'spinning neutron star magnetar',
      targetSceneIndex: 0,
      targetShotId: 'shot_1',
      relevanceScore: 95,
      thumbnailUrl: 'https://images.pexels.com/videos/101/thumb.jpg',
      thumbnailBase64: sampleBase64Jpeg,
      thumbnailMimeType: 'image/jpeg',
      semanticDescription: 'Hyper-detailed spinning magnetic neutron star with plasma arcs',
    },
    {
      id: 'candidate_misleading_tag_match',
      provider: 'pixabay',
      providerAssetId: 'pb_202',
      downloadUrl: '/tmp/pb_202.mp4',
      durationSeconds: 6.0,
      width: 1080,
      height: 1920,
      aspectRatio: 1080 / 1920,
      nativeVertical: true,
      tags: ['magnetar', 'extreme gravity', 'supernova', 'black hole', 'neutron star'], // keyword heavy!
      queryUsed: 'extreme magnetar magnetic field',
      targetSceneIndex: 0,
      targetShotId: 'shot_1',
      relevanceScore: 98, // high metadata score
      thumbnailUrl: 'https://cdn.pixabay.com/video/202/thumb.jpg',
      thumbnailBase64: sampleBase64Jpeg,
      thumbnailMimeType: 'image/jpeg',
      semanticDescription: 'Misleading stock footage: generic cartoon vector with floating coins',
    },
    {
      id: 'candidate_teaspoon_weight',
      provider: 'pexels',
      providerAssetId: 'px_303',
      downloadUrl: '/tmp/px_303.mp4',
      durationSeconds: 7.5,
      width: 1080,
      height: 1920,
      aspectRatio: 1080 / 1920,
      nativeVertical: true,
      tags: ['mountain', 'scale', 'heavy mass', 'dense'],
      queryUsed: 'heavy mountain density scale',
      targetSceneIndex: 1,
      targetShotId: 'shot_2',
      relevanceScore: 88,
      thumbnailUrl: 'https://images.pexels.com/videos/303/thumb.jpg',
      thumbnailBase64: sampleBase64Jpeg,
      thumbnailMimeType: 'image/jpeg',
      semanticDescription: 'Cinematic scale shot of giant mountain range',
    },
  ];
}

function createSampleStoryboard(): Storyboard {
  return {
    title: 'Sample Storyboard',
    format: 'short',
    totalShots: 2,
    generatedBy: 'gemini',
    shots: [
      {
        shotId: 'shot_1',
        sceneIndex: 0,
        shotIndex: 0,
        narrationStart: 0,
        narrationEnd: 3.5,
        durationSeconds: 3.5,
        narrationClause: 'Inside a magnetar, magnetic fields are a quadrillion times stronger than Earth.',
        visualSubject: 'Spinning stellar magnetar core with blazing plasma flares',
        action: 'Violent magnetic vortex erupting in deep cosmos',
        environment: 'Deep cosmic void',
        emotion: 'Awe and cosmic dread',
        framing: 'Macro close-up',
        cameraMovement: 'Fast push-in',
        visualPurpose: 'Hook viewer with extreme cosmic phenomenon',
        visualPriority: 'high',
        preferredVisualType: 'stock',
        searchQueries: ['spinning neutron star magnetar', 'pulsar magnetic field'],
      },
      {
        shotId: 'shot_2',
        sceneIndex: 1,
        shotIndex: 1,
        narrationStart: 3.5,
        narrationEnd: 7.0,
        durationSeconds: 3.5,
        narrationClause: 'A single teaspoon would weigh a billion tons.',
        visualSubject: 'Massive mountain crushing under extreme density',
        action: 'Scale comparison of planetary mass',
        environment: 'Astronomical observatory',
        emotion: 'Mind-boggling scale',
        framing: 'Wide landscape',
        cameraMovement: 'Slow drift',
        visualPurpose: 'Illustrate density concept',
        visualPriority: 'medium',
        preferredVisualType: 'stock',
        searchQueries: ['heavy mountain density scale', 'astronomy scale'],
      },
    ] as any,
    totalDurationSeconds: 7.0,
  };
}

function createSampleInput(candidates?: CandidateBrollAsset[]): AIDirectorInput {
  const cList = candidates || createSampleCandidates();
  const candidateBoard: BrollCandidateBoard = {
    candidates: cList,
    totalCandidates: cList.length,
    queriesRun: ['spinning neutron star magnetar', 'heavy mountain density scale'],
    previouslySelectedAssetIds: [],
  };

  return {
    candidateBoard,
    format: 'short',
    narrationText:
      'Inside a magnetar, magnetic fields are a quadrillion times stronger than Earth. A single teaspoon would weigh a billion tons.',
    narrationDurationSeconds: 7.0,
    targetDurationSeconds: 7.0,
    storyboard: createSampleStoryboard() as any,
    scenePlan: {
      scenes: [
        {
          index: 0,
          narration: 'Inside a magnetar, magnetic fields are a quadrillion times stronger than Earth.',
          durationSeconds: 3.5,
          shots: [
            {
              id: 'shot_1',
              shotIndex: 0,
              narrationClause: 'Inside a magnetar, magnetic fields are a quadrillion times stronger than Earth.',
              durationSeconds: 3.5,
            },
          ] as any,
        },
        {
          index: 1,
          narration: 'A single teaspoon would weigh a billion tons.',
          durationSeconds: 3.5,
          shots: [
            {
              id: 'shot_2',
              shotIndex: 0,
              narrationClause: 'A single teaspoon would weigh a billion tons.',
              durationSeconds: 3.5,
            },
          ] as any,
        },
      ],
      totalDurationSeconds: 7.0,
      sceneCount: 2,
    } as any,
  };
}

test('VisualGroundingService acquires base64 thumbnail frames and builds multimodal contents', async () => {
  const visualGrounding = new VisualGroundingService({ logger });
  const input = createSampleInput();
  const nicheProfile = CLIPFORGE_NICHE_PROFILE;
  const formatProfile = getFormatProfile('short');

  const parts = visualGrounding.buildMultimodalContents(input, nicheProfile, formatProfile);

  assert.ok(parts.length > 0, 'Multimodal contents should not be empty');

  // Verify that inline image parts are present
  const imageParts = parts.filter((p) => p.inlineData && p.inlineData.data);
  assert.strictEqual(
    imageParts.length,
    input.candidateBoard.candidates.length,
    'Each candidate with thumbnailBase64 should have an inlineData image part'
  );

  for (const imgPart of imageParts) {
    assert.strictEqual(imgPart.inlineData?.mimeType, 'image/jpeg');
    assert.ok(imgPart.inlineData?.data.length > 0, 'Image base64 data should be non-empty');
  }

  // Verify text instructions mention pixel evaluation and rejecting misleading keywords
  const textParts = parts.filter((p) => p.text).map((p) => p.text).join('\n');
  assert.ok(textParts.includes('EVALUATE THE ACTUAL VISUAL PIXELS'), 'Must include pixel evaluation instructions');
  assert.ok(textParts.includes('REJECT MISLEADING KEYWORD MATCHES'), 'Must instruct rejecting misleading keyword matches');
  assert.ok(textParts.includes('VISUAL TRUTH OVER METADATA'), 'Must prioritize visual truth over metadata');
});

test('AIDirectorService dispatches single multimodal request containing image parts', async () => {
  let capturedCallsCount = 0;
  let capturedContents: GeminiContents | undefined;

  const mockGemini = new GeminiClient({
    customRunner: async (keyLabel, promptOrContents, attempt) => {
      capturedCallsCount++;
      capturedContents = promptOrContents;

      // Mock AI Director JSON response choosing candidate_magnetar_accurate over misleading match
      const response = {
        totalDurationSeconds: 7.0,
        format: 'short',
        editorialNarrativeArc: 'Multimodal visually grounded narrative arc',
        decisions: [
          {
            shotId: 'shot_1',
            sceneIndex: 0,
            shotIndex: 0,
            selectedCandidateId: 'candidate_magnetar_accurate', // Selected via visual ground!
            narrationClause: 'Inside a magnetar, magnetic fields are a quadrillion times stronger than Earth.',
            inPoint: 0.0,
            outPoint: 3.5,
            durationSeconds: 3.5,
            role: 'hook',
            motionEffect: 'punch_in',
            motionIntensity: 'dramatic',
            cropMode: 'standard',
            transition: 'cut',
            captionTreatment: 'hook_pop',
            editorialReason: 'Visual grounding confirmed actual spinning magnetar with magnetic arcs',
            visualDescription: 'Extreme high-energy magnetic stellar plasma vortex',
            pacingWeight: 1.2,
          },
          {
            shotId: 'shot_2',
            sceneIndex: 1,
            shotIndex: 0,
            selectedCandidateId: 'candidate_teaspoon_weight',
            narrationClause: 'A single teaspoon would weigh a billion tons.',
            inPoint: 0.0,
            outPoint: 3.5,
            durationSeconds: 3.5,
            role: 'fact',
            motionEffect: 'zoom_in',
            motionIntensity: 'moderate',
            cropMode: 'standard',
            transition: 'cut',
            captionTreatment: 'standard',
            editorialReason: 'Visual scale of monumental mountain fits billion ton narration',
            visualDescription: 'Wide vista of towering mountain mass',
            pacingWeight: 1.0,
          },
        ],
      };

      return JSON.stringify(response);
    },
  });

  const director = new AIDirectorService({
    geminiClient: mockGemini,
    logger,
  });

  const input = createSampleInput();
  const plan = await director.directVideo(input);

  // Assert exactly ONE Gemini request per video
  assert.strictEqual(capturedCallsCount, 1, 'Must execute exactly ONE Gemini call for the entire video');

  // Assert capturedContents is multimodal with parts
  assert.ok(capturedContents, 'Must have received multimodal contents');
  const parts = Array.isArray(capturedContents)
    ? capturedContents
    : typeof capturedContents === 'object' && 'parts' in capturedContents
    ? capturedContents.parts
    : [];

  const imageParts = parts.filter((p: GeminiPart) => p.inlineData && p.inlineData.data);
  assert.strictEqual(imageParts.length, 3, 'Must contain 3 candidate image parts');

  // Assert output plan validity
  assert.strictEqual(plan.decisions.length, 2);
  assert.strictEqual(plan.decisions[0].selectedCandidateId, 'candidate_magnetar_accurate');
  assert.strictEqual(plan.decisions[1].selectedCandidateId, 'candidate_teaspoon_weight');
  assert.strictEqual(plan.totalDurationSeconds, 7.0);
});

test('Rejects visually misleading candidate even if metadata relevance score is higher', async () => {
  let chosenCandidateId = '';

  const mockGemini = new GeminiClient({
    customRunner: async (keyLabel, promptOrContents, attempt) => {
      // Simulate Gemini model inspecting actual pixels and rejecting candidate_misleading_tag_match (relevance 98)
      // in favor of candidate_magnetar_accurate (relevance 95)
      chosenCandidateId = 'candidate_magnetar_accurate';

      const response = {
        totalDurationSeconds: 7.0,
        format: 'short',
        editorialNarrativeArc: 'Visual truth beats misleading keyword tags',
        decisions: [
          {
            shotId: 'shot_1',
            sceneIndex: 0,
            shotIndex: 0,
            selectedCandidateId: 'candidate_magnetar_accurate',
            narrationClause: 'Inside a magnetar, magnetic fields are a quadrillion times stronger than Earth.',
            inPoint: 0.0,
            outPoint: 3.5,
            durationSeconds: 3.5,
            role: 'hook',
            motionEffect: 'punch_in',
            motionIntensity: 'dramatic',
            cropMode: 'standard',
            transition: 'cut',
            captionTreatment: 'hook_pop',
            editorialReason: 'Rejected misleading cartoon icon in candidate_misleading_tag_match despite higher tag score; selected authentic magnetar plasma visual',
            visualDescription: 'Spinning stellar magnetar core with blazing plasma flares',
            pacingWeight: 1.2,
          },
          {
            shotId: 'shot_2',
            sceneIndex: 1,
            shotIndex: 0,
            selectedCandidateId: 'candidate_teaspoon_weight',
            narrationClause: 'A single teaspoon would weigh a billion tons.',
            inPoint: 0.0,
            outPoint: 3.5,
            durationSeconds: 3.5,
            role: 'fact',
            motionEffect: 'zoom_in',
            motionIntensity: 'moderate',
            cropMode: 'standard',
            transition: 'cut',
            captionTreatment: 'standard',
            editorialReason: 'Accurate scale comparison',
            visualDescription: 'Wide vista of towering mountain mass',
            pacingWeight: 1.0,
          },
        ],
      };

      return JSON.stringify(response);
    },
  });

  const director = new AIDirectorService({
    geminiClient: mockGemini,
    logger,
  });

  const input = createSampleInput();
  const plan = await director.directVideo(input);

  assert.strictEqual(plan.decisions[0].selectedCandidateId, 'candidate_magnetar_accurate');
  assert.notStrictEqual(plan.decisions[0].selectedCandidateId, 'candidate_misleading_tag_match');
});

test('Missing thumbnails handled safely without errors (metadata fallback)', async () => {
  let capturedPrompt: GeminiContents | undefined;

  const mockGemini = new GeminiClient({
    customRunner: async (keyLabel, promptOrContents, attempt) => {
      capturedPrompt = promptOrContents;
      return JSON.stringify({
        totalDurationSeconds: 7.0,
        format: 'short',
        decisions: [
          {
            shotId: 'shot_1',
            sceneIndex: 0,
            shotIndex: 0,
            selectedCandidateId: 'candidate_no_thumb_1',
            narrationClause: 'Inside a magnetar...',
            inPoint: 0.0,
            outPoint: 3.5,
            durationSeconds: 3.5,
            role: 'hook',
            motionEffect: 'punch_in',
            motionIntensity: 'dramatic',
            cropMode: 'standard',
            transition: 'cut',
            captionTreatment: 'hook_pop',
            editorialReason: 'Fallback metadata selection',
            visualDescription: 'Deep space galaxy view',
            pacingWeight: 1.0,
          },
          {
            shotId: 'shot_2',
            sceneIndex: 1,
            shotIndex: 0,
            selectedCandidateId: 'candidate_no_thumb_2',
            narrationClause: 'A single teaspoon...',
            inPoint: 0.0,
            outPoint: 3.5,
            durationSeconds: 3.5,
            role: 'fact',
            motionEffect: 'zoom_in',
            motionIntensity: 'moderate',
            cropMode: 'standard',
            transition: 'cut',
            captionTreatment: 'standard',
            editorialReason: 'Fallback metadata selection',
            visualDescription: 'Observatory telescope',
            pacingWeight: 1.0,
          },
        ],
      });
    },
  });

  const director = new AIDirectorService({
    geminiClient: mockGemini,
    logger,
  });

  // Create candidate assets without any thumbnail URLs or base64
  const candidatesWithoutThumbnails: CandidateBrollAsset[] = [
    {
      id: 'candidate_no_thumb_1',
      provider: 'pexels',
      providerAssetId: 'px_999',
      downloadUrl: '/tmp/px_999.mp4',
      durationSeconds: 10.0,
      width: 1080,
      height: 1920,
      aspectRatio: 1080 / 1920,
      nativeVertical: true,
      tags: ['space', 'magnetar'],
      queryUsed: 'magnetar',
      relevanceScore: 90,
    },
    {
      id: 'candidate_no_thumb_2',
      provider: 'pixabay',
      providerAssetId: 'pb_888',
      downloadUrl: '/tmp/pb_888.mp4',
      durationSeconds: 8.0,
      width: 1080,
      height: 1920,
      aspectRatio: 1080 / 1920,
      nativeVertical: true,
      tags: ['mountain', 'scale'],
      queryUsed: 'mountain scale',
      relevanceScore: 85,
    },
  ];

  const input = createSampleInput(candidatesWithoutThumbnails);
  const plan = await director.directVideo(input);

  assert.strictEqual(plan.decisions.length, 2);
  assert.strictEqual(plan.decisions[0].selectedCandidateId, 'candidate_no_thumb_1');
  assert.strictEqual(plan.decisions[1].selectedCandidateId, 'candidate_no_thumb_2');
});

test('Fallback safely triggers deterministic plan when Gemini fails or exhausts quota', async () => {
  const failingGemini = new GeminiClient({
    customRunner: async () => {
      throw new Error('Quota exceeded or transient network failure');
    },
  });

  const director = new AIDirectorService({
    geminiClient: failingGemini,
    logger,
  });

  const input = createSampleInput();
  const plan = await director.directVideo(input);

  assert.ok(plan, 'Plan must be produced by deterministic fallback');
  assert.strictEqual(plan.decisions.length, 2, 'Must match storyboard shot count');
  assert.strictEqual(plan.totalDurationSeconds, 7.0, 'Duration must equal target duration');
  assert.ok(plan.decisions[0].selectedCandidateId && plan.decisions[0].selectedCandidateId.length > 0, 'Candidate ID must be populated');
});
