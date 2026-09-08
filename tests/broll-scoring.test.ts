import { describe, it } from 'node:test';
import assert from 'node:assert';
import { BrollScorer } from '../src/services/broll/scorer';
import { SceneShot } from '../src/contracts/artifacts';
import { BrollCandidate } from '../src/services/pexels/provider';

describe('B-Roll Scoring Logic', () => {
  const scorer = new BrollScorer();

  const mockScene: SceneShot = {
    sceneId: 'scene_1',
    narrationSegment: 'A supermassive black hole tears through a star.',
    targetDurationSec: 5.0,
    visualObjective: 'High energy cosmic accretion',
    visualDescription: 'Vortex of glowing plasma and stars',
    pexelsSearchQueries: ['black hole space', 'galaxy stars'],
    visualPriority: 'high',
    suggestedMotion: 'zoom_in',
    suggestedCrop: 'center',
    editingGuidance: 'Cut on beat',
  };

  it('should prefer native portrait high-resolution clips matching query over low-res clips', () => {
    const portraitCandidate: BrollCandidate = {
      id: 101,
      provider: 'pexels',
      title: 'Cinematic black hole space galaxy',
      width: 1080,
      height: 1920,
      duration: 8,
      fps: 30,
      downloadUrl: 'https://example.com/101.mp4',
      orientation: 'portrait',
      quality: 'hd',
      queryMatched: 'black hole space',
    };

    const lowResLandscape: BrollCandidate = {
      id: 102,
      provider: 'pexels',
      title: 'Random city street',
      width: 640,
      height: 360,
      duration: 3,
      fps: 24,
      downloadUrl: 'https://example.com/102.mp4',
      orientation: 'landscape',
      quality: 'sd',
      queryMatched: 'black hole space',
    };

    const prevSelected = new Set<string | number>();
    const scorePortrait = scorer.scoreCandidate(portraitCandidate, mockScene, prevSelected);
    const scoreLowRes = scorer.scoreCandidate(lowResLandscape, mockScene, prevSelected);

    assert.ok(scorePortrait.score > scoreLowRes.score);
    assert.strictEqual(scorePortrait.factors.orientation, 100);
    assert.strictEqual(scorePortrait.factors.uniqueness, 100);
  });

  it('should penalize previously selected clips to ensure visual variety', () => {
    const candidate: BrollCandidate = {
      id: 201,
      provider: 'pexels',
      title: 'Galaxy space',
      width: 1920,
      height: 1080,
      duration: 10,
      fps: 30,
      downloadUrl: 'https://example.com/201.mp4',
      orientation: 'landscape',
      quality: 'hd',
      queryMatched: 'galaxy stars',
    };

    const prevUnused = new Set<string | number>();
    const prevUsed = new Set<string | number>([201]);

    const freshScore = scorer.scoreCandidate(candidate, mockScene, prevUnused);
    const reusedScore = scorer.scoreCandidate(candidate, mockScene, prevUsed);

    assert.ok(freshScore.score > reusedScore.score, 'Reused candidate should receive lower total score');
    assert.strictEqual(reusedScore.factors.uniqueness, 15);
  });
});
