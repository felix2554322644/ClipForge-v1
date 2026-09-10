import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  BrollSearcher,
  UsedAssetTracker,
  normalizeSourceUrl,
} from '../src/services/broll/searcher';
import { BrollProvider, NormalizedBrollVideo } from '../src/services/broll/provider';
import { BrollCache } from '../src/services/broll/cache';
import { PipelineLogger } from '../src/services/logging/logger';
import { CONFIG } from '../src/config/index';
import { PlannedScene, BrollProviderName } from '../src/types/pipeline';
import { BrollScorer } from '../src/services/broll/scorer';

class MockBrollProvider implements BrollProvider {
  constructor(
    public readonly name: BrollProviderName,
    public candidateList: NormalizedBrollVideo[] = []
  ) {}

  isAvailable(): boolean {
    return true;
  }

  async searchVideos(): Promise<NormalizedBrollVideo[]> {
    return this.candidateList;
  }
}

function createCandidate(
  overrides: Partial<NormalizedBrollVideo> & { id: string }
): NormalizedBrollVideo {
  const { id, ...rest } = overrides;
  return {
    provider: 'pexels',
    providerAssetId: id,
    sourceUrl: `https://www.pexels.com/video/${id}/`,
    downloadUrl: `mock://video/${id}.mp4`,
    width: 1080,
    height: 1920,
    aspectRatio: 1080 / 1920,
    durationSeconds: 8.0,
    nativeVertical: true,
    tags: ['deep', 'space', 'galaxy'],
    ...rest,
    id,
  };
}

const testDir = path.join(CONFIG.OUTPUT_DIR, 'test_broll_selection');
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true });
}
const logger = new PipelineLogger(testDir);

test('B-Roll Normalization: Canonical source URL normalization handles query params, protocols, and www', () => {
  const url1 = 'https://www.pexels.com/video/deep-space-12345/';
  const url2 = 'http://pexels.com/video/deep-space-12345?utm_source=twitter&utm_medium=social';
  const url3 = 'https://pexels.com/video/deep-space-12345#section';

  assert.equal(normalizeSourceUrl(url1), 'pexels.com/video/deep-space-12345');
  assert.equal(normalizeSourceUrl(url2), 'pexels.com/video/deep-space-12345');
  assert.equal(normalizeSourceUrl(url3), 'pexels.com/video/deep-space-12345');
  assert.equal(normalizeSourceUrl(url1), normalizeSourceUrl(url2));
  assert.equal(normalizeSourceUrl(url1), normalizeSourceUrl(url3));

  const pixabay1 = 'https://pixabay.com/videos/cosmic-stars-999/';
  const pixabay2 = 'http://www.pixabay.com/videos/cosmic-stars-999';
  assert.equal(normalizeSourceUrl(pixabay1), normalizeSourceUrl(pixabay2));
  assert.equal(normalizeSourceUrl(pixabay1), 'pixabay.com/videos/cosmic-stars-999');

  assert.equal(normalizeSourceUrl(''), '');
  assert.equal(normalizeSourceUrl(undefined), '');
});

test('B-Roll Duplicate Tracker: Correctly detects duplicates across asset id, providerAssetId, and normalized sourceUrl', () => {
  const tracker = new UsedAssetTracker();

  tracker.markSelected({
    id: 'pexels_101',
    providerAssetId: 'pid_101',
    sourceUrl: 'https://www.pexels.com/video/starfield-101/',
    downloadUrl: 'https://images.pexels.com/101.mp4',
  });

  // 1. Same asset id
  assert.ok(tracker.isDuplicate({ id: 'pexels_101' }), 'Should detect duplicate by id');

  // 2. Same providerAssetId with different id
  assert.ok(
    tracker.isDuplicate({ id: 'different_id', providerAssetId: 'pid_101' }),
    'Should detect duplicate by providerAssetId'
  );

  // 3. Same normalized source URL with different id and providerAssetId
  assert.ok(
    tracker.isDuplicate({
      id: 'brand_new_id',
      providerAssetId: 'brand_new_pid',
      sourceUrl: 'http://pexels.com/video/starfield-101?ref=test',
    }),
    'Should detect duplicate by normalized sourceUrl'
  );

  // 4. Truly distinct candidate
  assert.equal(
    tracker.isDuplicate({
      id: 'pexels_202',
      providerAssetId: 'pid_202',
      sourceUrl: 'https://www.pexels.com/video/nebula-202/',
    }),
    false,
    'Distinct asset must not be flagged as duplicate'
  );
});

test('B-Roll Selection: The same asset ID cannot be selected twice', async () => {
  const candA = createCandidate({
    id: 'duplicate_asset_id_1',
    providerAssetId: 'prov_id_1',
    tags: ['deep', 'space', 'galaxy'],
  });
  const candB = createCandidate({
    id: 'distinct_asset_id_2',
    providerAssetId: 'prov_id_2',
    tags: ['deep', 'space', 'galaxy'],
  });

  // Provider offers candA and candB
  const mockProvider = new MockBrollProvider('pexels', [candA, candB]);
  const searcher = new BrollSearcher(logger, [mockProvider]);

  const scenes: PlannedScene[] = [
    {
      index: 0,
      narration: 'The cosmos is vast and mysterious.',
      durationSeconds: 3.5,
      brollQuery: ['deep space galaxy'],
      motionEffect: 'zoom_in',
      captionText: 'The cosmos is vast and mysterious.',
    },
    {
      index: 1,
      narration: 'Distant stars shine across eons.',
      durationSeconds: 3.5,
      brollQuery: ['deep space galaxy'],
      motionEffect: 'zoom_out',
      captionText: 'Distant stars shine across eons.',
    },
  ];

  const jobDir = path.join(testDir, 'job_same_asset_id');
  const selections = await searcher.selectBrollForScenes(scenes, jobDir);

  assert.equal(selections.length, 2);
  assert.equal(selections[0].broll.id, 'duplicate_asset_id_1');
  assert.equal(selections[1].broll.id, 'distinct_asset_id_2');
  assert.notEqual(
    selections[0].broll.id,
    selections[1].broll.id,
    'The same asset ID must not be selected twice'
  );
});

test('B-Roll Selection: The same provider asset ID cannot be selected twice', async () => {
  // Cand A and Cand B have DIFFERENT IDs but the SAME providerAssetId (e.g. imported or cross-listed)
  const candA = createCandidate({
    id: 'clip_version_one',
    providerAssetId: 'shared_provider_asset_777',
    sourceUrl: 'https://pexels.com/video/clip-a/',
  });
  const candB = createCandidate({
    id: 'clip_version_two_different_id',
    providerAssetId: 'shared_provider_asset_777',
    sourceUrl: 'https://pexels.com/video/clip-b/',
  });
  const candC = createCandidate({
    id: 'clip_distinct',
    providerAssetId: 'unique_provider_asset_888',
    sourceUrl: 'https://pexels.com/video/clip-c/',
  });

  const mockProvider = new MockBrollProvider('pexels', [candA, candB, candC]);
  const searcher = new BrollSearcher(logger, [mockProvider]);

  const scenes: PlannedScene[] = [
    {
      index: 0,
      narration: 'First scene exploring black holes.',
      durationSeconds: 3.0,
      brollQuery: ['deep space galaxy'],
      motionEffect: 'zoom_in',
      captionText: 'First scene exploring black holes.',
    },
    {
      index: 1,
      narration: 'Second scene examining event horizons.',
      durationSeconds: 3.0,
      brollQuery: ['deep space galaxy'],
      motionEffect: 'pan_left',
      captionText: 'Second scene examining event horizons.',
    },
  ];

  const jobDir = path.join(testDir, 'job_same_provider_asset_id');
  const selections = await searcher.selectBrollForScenes(scenes, jobDir);

  assert.equal(selections.length, 2);
  assert.equal(selections[0].broll.providerAssetId, 'shared_provider_asset_777');
  // Cand B must be rejected even though its id is different, so cand C must be chosen
  assert.equal(selections[1].broll.providerAssetId, 'unique_provider_asset_888');
  assert.notEqual(
    selections[0].broll.providerAssetId,
    selections[1].broll.providerAssetId,
    'The same provider asset ID must not be selected twice'
  );
});

test('B-Roll Selection: The same normalized source URL cannot be selected twice', async () => {
  // Two candidates with completely different id and providerAssetId, but pointing to the same page URL
  const candA = createCandidate({
    id: 'asset_first',
    providerAssetId: 'pid_first',
    sourceUrl: 'https://www.pexels.com/video/cosmic-odyssey-9999/',
  });
  const candB = createCandidate({
    id: 'asset_second_diff_id',
    providerAssetId: 'pid_second_diff_pid',
    sourceUrl: 'http://pexels.com/video/cosmic-odyssey-9999?utm_campaign=winter',
  });
  const candC = createCandidate({
    id: 'asset_third_unique',
    providerAssetId: 'pid_third_unique',
    sourceUrl: 'https://www.pexels.com/video/supernova-explosion-5555/',
  });

  const mockProvider = new MockBrollProvider('pexels', [candA, candB, candC]);
  const searcher = new BrollSearcher(logger, [mockProvider]);

  const scenes: PlannedScene[] = [
    {
      index: 0,
      narration: 'The explosion releases immense radiation.',
      durationSeconds: 3.2,
      brollQuery: ['deep space galaxy'],
      motionEffect: 'zoom_in',
      captionText: 'The explosion releases immense radiation.',
    },
    {
      index: 1,
      narration: 'Energy reverberates across interstellar gas.',
      durationSeconds: 3.2,
      brollQuery: ['deep space galaxy'],
      motionEffect: 'zoom_out',
      captionText: 'Energy reverberates across interstellar gas.',
    },
  ];

  const jobDir = path.join(testDir, 'job_same_source_url');
  const selections = await searcher.selectBrollForScenes(scenes, jobDir);

  assert.equal(selections.length, 2);
  assert.equal(selections[0].broll.id, 'asset_first');
  // Cand B must be rejected due to normalized URL match with Cand A; Cand C must be selected
  assert.equal(selections[1].broll.id, 'asset_third_unique');
  assert.notEqual(
    normalizeSourceUrl(selections[0].broll.sourceUrl),
    normalizeSourceUrl(selections[1].broll.sourceUrl),
    'The same normalized source URL must not be selected twice'
  );
});

test('B-Roll Selection: Selector falls back to another candidate when the best candidate is already used', async () => {
  const topCandidate = createCandidate({
    id: 'top_scoring_candidate',
    tags: ['deep', 'space', 'galaxy', 'astronomy', 'stars'],
    width: 1080,
    height: 1920,
    durationSeconds: 8.0,
  });
  const secondCandidate = createCandidate({
    id: 'second_scoring_candidate',
    tags: ['deep', 'space', 'galaxy'],
    width: 720,
    height: 1280,
    durationSeconds: 6.0,
  });
  const thirdCandidate = createCandidate({
    id: 'third_scoring_candidate',
    tags: ['space'],
    width: 720,
    height: 1280,
    durationSeconds: 5.0,
  });

  const mockProvider = new MockBrollProvider('pexels', [
    topCandidate,
    secondCandidate,
    thirdCandidate,
  ]);
  const searcher = new BrollSearcher(logger, [mockProvider]);

  const scenes: PlannedScene[] = [
    {
      index: 0,
      narration: 'Shot 1 takes the top scoring candidate.',
      durationSeconds: 3.0,
      brollQuery: ['deep space galaxy'],
      motionEffect: 'zoom_in',
      captionText: 'Shot 1',
    },
    {
      index: 1,
      narration: 'Shot 2 must fall back to the second candidate.',
      durationSeconds: 3.0,
      brollQuery: ['deep space galaxy'],
      motionEffect: 'zoom_out',
      captionText: 'Shot 2',
    },
    {
      index: 2,
      narration: 'Shot 3 must fall back to the third candidate.',
      durationSeconds: 3.0,
      brollQuery: ['deep space galaxy'],
      motionEffect: 'pan_left',
      captionText: 'Shot 3',
    },
  ];

  const jobDir = path.join(testDir, 'job_fallback_cascade');
  const selections = await searcher.selectBrollForScenes(scenes, jobDir);

  assert.equal(selections.length, 3);
  assert.equal(selections[0].broll.id, 'top_scoring_candidate');
  assert.equal(selections[1].broll.id, 'second_scoring_candidate');
  assert.equal(selections[2].broll.id, 'third_scoring_candidate');
});

test('B-Roll Selection: Multiple shots receive distinct assets across scenes', async () => {
  const candidatePool = [
    createCandidate({ id: 'shot_asset_1', providerAssetId: 'p_1' }),
    createCandidate({ id: 'shot_asset_2', providerAssetId: 'p_2' }),
    createCandidate({ id: 'shot_asset_3', providerAssetId: 'p_3' }),
    createCandidate({ id: 'shot_asset_4', providerAssetId: 'p_4' }),
    createCandidate({ id: 'shot_asset_5', providerAssetId: 'p_5' }),
  ];

  const mockProvider = new MockBrollProvider('pexels', candidatePool);
  const searcher = new BrollSearcher(logger, [mockProvider]);

  const scenes: PlannedScene[] = [
    {
      index: 0,
      narration: 'Scene 0 with two sub-shots.',
      durationSeconds: 6.0,
      brollQuery: ['deep space galaxy'],
      motionEffect: 'zoom_in',
      captionText: 'Scene 0',
      shots: [
        {
          id: 's0_shot0',
          sceneIndex: 0,
          shotIndex: 0,
          narrationClause: 'Sub-shot A',
          durationSeconds: 3.0,
          pacingType: 'fast',
          brollQueries: ['deep space galaxy'],
          motionEffect: 'zoom_in',
          transition: 'cut',
          captionText: 'Sub-shot A',
        },
        {
          id: 's0_shot1',
          sceneIndex: 0,
          shotIndex: 1,
          narrationClause: 'Sub-shot B',
          durationSeconds: 3.0,
          pacingType: 'fast',
          brollQueries: ['deep space galaxy'],
          motionEffect: 'zoom_out',
          transition: 'cut',
          captionText: 'Sub-shot B',
        },
      ],
    },
    {
      index: 1,
      narration: 'Scene 1 with two sub-shots.',
      durationSeconds: 6.0,
      brollQuery: ['deep space galaxy'],
      motionEffect: 'zoom_in',
      captionText: 'Scene 1',
      shots: [
        {
          id: 's1_shot0',
          sceneIndex: 1,
          shotIndex: 0,
          narrationClause: 'Sub-shot C',
          durationSeconds: 3.0,
          pacingType: 'normal',
          brollQueries: ['deep space galaxy'],
          motionEffect: 'pan_left',
          transition: 'cut',
          captionText: 'Sub-shot C',
        },
        {
          id: 's1_shot1',
          sceneIndex: 1,
          shotIndex: 1,
          narrationClause: 'Sub-shot D',
          durationSeconds: 3.0,
          pacingType: 'normal',
          brollQueries: ['deep space galaxy'],
          motionEffect: 'pan_right',
          transition: 'cut',
          captionText: 'Sub-shot D',
        },
      ],
    },
  ];

  const jobDir = path.join(testDir, 'job_multiple_shots_distinct');
  const selections = await searcher.selectBrollForScenes(scenes, jobDir);

  assert.equal(selections.length, 4);

  const selectedIds = selections.map((s) => s.broll.id);
  const selectedPids = selections.map((s) => s.broll.providerAssetId);
  const selectedUrls = selections.map((s) => normalizeSourceUrl(s.broll.sourceUrl));

  assert.equal(new Set(selectedIds).size, 4, 'All 4 shot asset IDs must be distinct');
  assert.equal(new Set(selectedPids).size, 4, 'All 4 provider asset IDs must be distinct');
  assert.equal(new Set(selectedUrls).size, 4, 'All 4 normalized URLs must be distinct');
});

test('B-Roll Selection: Provider diversity is preferred when quality is comparable', async () => {
  // When quality is comparable (scores within 5 points), alternate provider should be preferred
  const pexelsItem1 = createCandidate({
    id: 'pexels_high_1',
    provider: 'pexels',
    providerAssetId: 'px_101',
    tags: ['deep', 'space', 'galaxy'],
    width: 1080,
    height: 1920,
    durationSeconds: 8.0,
  });

  const pexelsItem2 = createCandidate({
    id: 'pexels_high_2',
    provider: 'pexels',
    providerAssetId: 'px_102',
    tags: ['deep', 'space', 'galaxy'],
    width: 1080,
    height: 1920,
    durationSeconds: 8.0,
  });

  const pixabayItem1 = createCandidate({
    id: 'pixabay_high_1',
    provider: 'pixabay',
    providerAssetId: 'pb_201',
    tags: ['deep', 'space', 'galaxy'],
    width: 1080,
    height: 1920,
    durationSeconds: 8.0,
  });

  // Shot 0 selects pexelsItem1.
  // For Shot 1, pexelsItem2 and pixabayItem1 have comparable quality (both native 1080x1920 with full keyword match).
  // Because Shot 0 selected Pexels, Shot 1 should prefer Pixabay!
  const pexelsProvider = new MockBrollProvider('pexels', [pexelsItem1, pexelsItem2]);
  const pixabayProvider = new MockBrollProvider('pixabay', [pixabayItem1]);

  const searcher = new BrollSearcher(logger, [pexelsProvider, pixabayProvider]);

  const scenes: PlannedScene[] = [
    {
      index: 0,
      narration: 'Shot 1 begins with celestial wonders.',
      durationSeconds: 3.5,
      brollQuery: ['deep space galaxy'],
      motionEffect: 'zoom_in',
      captionText: 'Shot 1',
    },
    {
      index: 1,
      narration: 'Shot 2 shows cosmic dust swirling.',
      durationSeconds: 3.5,
      brollQuery: ['deep space galaxy'],
      motionEffect: 'zoom_out',
      captionText: 'Shot 2',
    },
  ];

  const jobDir = path.join(testDir, 'job_provider_alternation');
  const selections = await searcher.selectBrollForScenes(scenes, jobDir);

  assert.equal(selections.length, 2);
  assert.equal(selections[0].provider, 'pexels');
  assert.equal(
    selections[1].provider,
    'pixabay',
    'When quality is comparable, the alternating provider (Pixabay) must be preferred over Pexels'
  );
  assert.equal(selections[1].broll.id, 'pixabay_high_1');
});

test('B-Roll Selection: Semantic relevance is primary - low-quality footage is NOT chosen just for diversity', () => {
  // Pexels has excellent score (90+) with high resolution and strong semantic match
  const strongCandidate = createCandidate({
    id: 'pexels_superior',
    provider: 'pexels',
    tags: ['deep', 'space', 'galaxy'],
    width: 1080,
    height: 1920,
    durationSeconds: 8.0,
  });

  // Pixabay has low score due to irrelevant tags and small dimensions
  const weakCandidate = createCandidate({
    id: 'pixabay_inferior',
    provider: 'pixabay',
    tags: ['office', 'computer'],
    width: 640,
    height: 1136,
    durationSeconds: 2.0,
  });

  const evalStrong = BrollScorer.evaluateCandidate(
    {
      id: strongCandidate.id,
      provider: 'pexels',
      width: strongCandidate.width,
      height: strongCandidate.height,
      duration: strongCandidate.durationSeconds,
      tags: strongCandidate.tags,
    },
    5.0,
    1080 / 1920,
    new Set(),
    'deep space galaxy'
  );

  const evalWeak = BrollScorer.evaluateCandidate(
    {
      id: weakCandidate.id,
      provider: 'pixabay',
      width: weakCandidate.width,
      height: weakCandidate.height,
      duration: weakCandidate.durationSeconds,
      tags: weakCandidate.tags,
    },
    5.0,
    1080 / 1920,
    new Set(),
    'deep space galaxy'
  );

  assert.ok(
    evalStrong.score - evalWeak.score > 20,
    'Strong candidate must clearly outscore weak candidate'
  );

  // Even if last selected provider was Pexels, strong Pexels candidate should win over weak Pixabay
  const ranked = BrollSearcher.rankCandidates(
    [
      { raw: weakCandidate, eval: evalWeak, query: 'deep space galaxy' },
      { raw: strongCandidate, eval: evalStrong, query: 'deep space galaxy' },
    ],
    'pexels'
  );

  assert.equal(
    ranked[0].raw.id,
    'pexels_superior',
    'Semantic relevance and technical quality must remain primary over diversity'
  );
});

test('B-Roll Selection: Preserves BrollCache while strictly rejecting already-used cached assets', async () => {
  const cacheDir = path.join(testDir, 'cache_test');
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  const customCache = new BrollCache();

  // Seed cache with a video file
  const cachedFile = path.join(CONFIG.CACHE_DIR, 'pexels_cached_asset_1.mp4');
  fs.writeFileSync(cachedFile, Buffer.alloc(15000, 1));
  customCache.set('pexels_cached_asset_1', cachedFile, 8.0, 'deep space galaxy');

  const candA = createCandidate({
    id: 'pexels_cached_asset_1',
    providerAssetId: 'cached_asset_1',
    provider: 'pexels',
  });
  const candB = createCandidate({
    id: 'pexels_fresh_asset_2',
    providerAssetId: 'fresh_asset_2',
    provider: 'pexels',
  });

  const mockProvider = new MockBrollProvider('pexels', [candA, candB]);
  const searcher = new BrollSearcher(logger, {
    providers: [mockProvider],
    cache: customCache,
  });

  const scenes: PlannedScene[] = [
    {
      index: 0,
      narration: 'Shot 1 loads cached asset.',
      durationSeconds: 3.0,
      brollQuery: ['deep space galaxy'],
      motionEffect: 'zoom_in',
      captionText: 'Shot 1',
    },
    {
      index: 1,
      narration: 'Shot 2 must reject cached asset because it was already used in this video.',
      durationSeconds: 3.0,
      brollQuery: ['deep space galaxy'],
      motionEffect: 'zoom_out',
      captionText: 'Shot 2',
    },
  ];

  const jobDir = path.join(testDir, 'job_cache_rejection');
  const selections = await searcher.selectBrollForScenes(scenes, jobDir);

  assert.equal(selections.length, 2);
  assert.equal(selections[0].broll.id, 'pexels_cached_asset_1');
  assert.equal(
    selections[1].broll.id,
    'pexels_fresh_asset_2',
    'Cached asset cannot be reused once selected within the same video'
  );
});
