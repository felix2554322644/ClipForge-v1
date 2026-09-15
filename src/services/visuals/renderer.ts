import { RemotionSceneRenderer } from '../remotion/renderer';
import { RenderSceneOptions, RenderResult } from './types';

export { RemotionSceneRenderer };

/**
 * Backward compatibility alias: Playwright is fully replaced by the Remotion
 * local programmatic video composition and rendering engine.
 */
export const PlaywrightSceneRenderer = RemotionSceneRenderer;
export type PlaywrightSceneRenderer = RemotionSceneRenderer;
