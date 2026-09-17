import path from 'node:path';
import fs from 'node:fs';
import { RemotionSceneRenderer } from './renderer';
import { PipelineLogger } from '../logging/logger';
import {
  HookTypographyParams,
  SignatureTwistRevealParams,
  EndCardParams,
  RemotionCaptionsParams,
  AnyRemotionSceneProps,
} from './types';
import { WordTimestamp } from '../../contracts/renderSpec';

export class RemotionCompositionService {
  private renderer: RemotionSceneRenderer;
  private logger?: PipelineLogger;

  constructor(logger?: PipelineLogger) {
    this.logger = logger;
    this.renderer = new RemotionSceneRenderer(logger);
  }

  getRenderer(): RemotionSceneRenderer {
    return this.renderer;
  }

  async prewarm(): Promise<void> {
    try {
      this.logger?.info('[REMOTION SERVICE] Pre-warming Remotion bundle...');
      await this.renderer.getServeUrl();
      this.logger?.info('[REMOTION SERVICE] Remotion bundle ready.');
    } catch (err) {
      this.logger?.warn(`[REMOTION SERVICE] Prewarm note: ${(err as Error).message}`);
    }
  }

  buildHookTypography(headline: string, subheadline?: string): HookTypographyParams {
    return {
      type: 'hook_typography',
      headline,
      subheadline,
    };
  }

  buildSignatureTwistReveal(label = 'THE IMPLICATION'): SignatureTwistRevealParams {
    return {
      type: 'signature_twist_reveal',
      label,
    };
  }

  buildEndCard(reframeText: string, brandName = 'ClipForge'): EndCardParams {
    return {
      type: 'end_card',
      reframeText,
      brandName,
    };
  }

  buildCaptions(words: WordTimestamp[], position: 'lower_third' | 'middle_safe' = 'lower_third'): RemotionCaptionsParams {
    return {
      type: 'remotion_captions',
      words,
      position,
      adaptiveScrim: true,
    };
  }
}
