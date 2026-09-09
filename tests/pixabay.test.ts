import test from 'node:test';
import assert from 'node:assert/strict';
import { PixabayClient, PixabaySearchResponse } from '../src/services/pixabay/client';
import { PixabayProvider } from '../src/services/pixabay/provider';
import { BrollScorer } from '../src/services/broll/scorer';

test('Pixabay Client: Reports availability based on API key configuration', () => {
  const clientWithoutKey = new PixabayClient('');
  assert.equal(clientWithoutKey.isAvailable(), false);

  const clientWithKey = new PixabayClient('test_pixabay_key_12345');
  assert.equal(clientWithKey.isAvailable(), true);
});

test('Pixabay Provider: Searches, selects portrait stream, and normalizes candidate metadata', async () => {
  const mockResponse: PixabaySearchResponse = {
    total: 2,
    totalHits: 2,
    hits: [
      {
        id: 101,
        pageURL: 'https://pixabay.com/videos/cosmic-stars-101/',
        type: 'film',
        tags: 'stars, galaxy, deep space, cosmos',
        duration: 15,
        videos: {
          large: {
            url: 'https://pixabay.com/download/cosmic_1080x1920.mp4',
            width: 1080,
            height: 1920,
            size: 5000000,
          },
          medium: {
            url: 'https://pixabay.com/download/cosmic_720x1280.mp4',
            width: 720,
            height: 1280,
            size: 2500000,
          },
        },
      },
    ],
  };

  const mockClient = {
    isAvailable: () => true,
    searchVideos: async (_q: string) => mockResponse.hits,
  } as unknown as PixabayClient;

  const provider = new PixabayProvider(mockClient);
  const results = await provider.searchVideos('stars');

  assert.equal(results.length, 1);
  const first = results[0];
  assert.equal(first.provider, 'pixabay');
  assert.equal(first.providerAssetId, '101');
  assert.equal(first.width, 1080);
  assert.equal(first.height, 1920);
  assert.equal(first.aspectRatio, 1080 / 1920);
  assert.equal(first.nativeVertical, true);
  assert.equal(first.downloadUrl, 'https://pixabay.com/download/cosmic_1080x1920.mp4');
  assert.ok(first.tags?.includes('galaxy'));
});

test('Pixabay Provider: Hard landscape filter rejects landscape videos by default', async () => {
  const mockResponseWithLandscape: PixabaySearchResponse = {
    total: 2,
    totalHits: 2,
    hits: [
      {
        id: 201,
        pageURL: 'https://pixabay.com/videos/landscape-stars-201/',
        type: 'film',
        tags: 'space',
        duration: 12,
        videos: {
          large: {
            url: 'https://pixabay.com/download/landscape_1920x1080.mp4',
            width: 1920, // LANDSCAPE!
            height: 1080,
            size: 4000000,
          },
        },
      },
      {
        id: 202,
        pageURL: 'https://pixabay.com/videos/vertical-galaxy-202/',
        type: 'film',
        tags: 'galaxy vertical',
        duration: 14,
        videos: {
          large: {
            url: 'https://pixabay.com/download/vertical_1080x1920.mp4',
            width: 1080, // PORTRAIT!
            height: 1920,
            size: 4500000,
          },
        },
      },
    ],
  };

  const mockClient = {
    isAvailable: () => true,
    searchVideos: async (_q: string) => mockResponseWithLandscape.hits,
  } as unknown as PixabayClient;

  const provider = new PixabayProvider(mockClient);
  const results = await provider.searchVideos('galaxy');

  // Should strictly filter out hit 201 and keep only hit 202
  assert.equal(results.length, 1);
  assert.equal(results[0].providerAssetId, '202');
  assert.equal(results[0].width, 1080);
  assert.equal(results[0].height, 1920);
});

test('Cross-Provider Scoring: Selects higher-scoring candidate based on quality and resolution', () => {
  // Candidate A: Pexels 720p HD (720x1280), duration 5s
  const pexelsCandidate = BrollScorer.evaluateCandidate(
    {
      id: 'pexels_123',
      provider: 'pexels',
      width: 720,
      height: 1280,
      duration: 5.0,
      url: 'https://pexels.com/v/stars',
      tags: ['stars'],
    },
    4.0,
    9 / 16,
    [],
    'stars'
  );

  // Candidate B: Pixabay Full HD 1080p (1080x1920), ample duration 8s, strong tags
  const pixabayCandidate = BrollScorer.evaluateCandidate(
    {
      id: 'pixabay_456',
      provider: 'pixabay',
      width: 1080,
      height: 1920,
      duration: 8.0,
      url: 'https://pixabay.com/v/stars-nebula',
      tags: ['stars', 'nebula', 'deep space'],
    },
    4.0,
    9 / 16,
    [],
    'stars nebula'
  );

  assert.ok(
    pixabayCandidate.score > pexelsCandidate.score,
    `Pixabay Full HD candidate (${pixabayCandidate.score}) should beat Pexels 720p candidate (${pexelsCandidate.score})`
  );
  assert.equal(pixabayCandidate.breakdown.resolution, 20);
  assert.equal(pexelsCandidate.breakdown.resolution, 14);
});
