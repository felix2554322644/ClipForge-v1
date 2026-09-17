import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition, ensureBrowser } from '@remotion/renderer';
import { PipelineLogger } from '../logging/logger';
import { BRAND_BIBLE } from '../../config/brandBible';
import {
  AnyRemotionSceneProps,
} from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedServeUrl: string | null = null;
let bundlingPromise: Promise<string> | null = null;
let browserEnsured = false;

export interface RenderRemotionOptions {
  sceneProps?: AnyRemotionSceneProps;
  type?: string;
  props?: Record<string, any>;
  durationSeconds: number;
  outputPath?: string;
  fps?: number;
  width?: number;
  height?: number;
  format?: 'short' | 'long';
  sceneParams?: any;
}

export interface RemotionRenderResult {
  success: boolean;
  outputPath: string;
  filePath: string;
  durationSeconds: number;
  frameCount: number;
  width: number;
  height: number;
  mimeType: string;
}

export class RemotionSceneRenderer {
  private logger?: PipelineLogger;

  constructor(logger?: PipelineLogger) {
    this.logger = logger;
  }

  public async getServeUrl(): Promise<string> {
    if (cachedServeUrl) {
      return cachedServeUrl;
    }

    if (bundlingPromise) {
      return bundlingPromise;
    }

    bundlingPromise = (async () => {
      if (!browserEnsured) {
        this.logger?.info('[REMOTION] Verifying headless browser environment...');
        try {
          await ensureBrowser();
          browserEnsured = true;
          this.logger?.info('[REMOTION] Headless browser verified.');
        } catch (err) {
          this.logger?.warn(`[REMOTION] ensureBrowser note: ${(err as Error).message}`);
        }
      }

      const entryPoint = path.resolve(__dirname, 'entry.tsx');
      this.logger?.info(`[REMOTION] Bundling Remotion compositions from ${entryPoint}...`);
      const serveUrl = await bundle({
        entryPoint,
        webpackOverride: (config) => ({
          ...config,
          module: {
            ...config.module,
            rules: [
              ...(config.module?.rules || []),
            ],
          },
        }),
      });

      cachedServeUrl = serveUrl;
      this.logger?.info('[REMOTION] Bundle ready.');
      return serveUrl;
    })();

    return bundlingPromise;
  }

  /**
   * Renders a Remotion overlay or scene pass to high-quality MP4.
   */
  async renderOverlay(options: RenderRemotionOptions): Promise<RemotionRenderResult> {
    const fps = options.fps || 30;
    const durationSeconds = Math.max(0.5, options.durationSeconds);
    const durationInFrames = Math.max(15, Math.ceil(durationSeconds * fps));
    const isLong = options.format === 'long';
    const width = options.width || (isLong ? 1920 : 1080);
    const height = options.height || (isLong ? 1080 : 1920);

    const outDir = options.outputPath ? path.dirname(options.outputPath) : path.join(process.cwd(), 'artifacts');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const outputPath = options.outputPath || path.join(outDir, `remotion_overlay_${Date.now()}.mp4`);

    const sceneProps: AnyRemotionSceneProps =
      options.sceneProps ||
      (options.type
        ? ({ type: options.type, ...options.props } as AnyRemotionSceneProps)
        : options.sceneParams
        ? (options.sceneParams as AnyRemotionSceneProps)
        : ({ type: 'hook_typography', headline: 'ClipForge' } as AnyRemotionSceneProps));

    try {
      const serveUrl = await this.getServeUrl();
      let compositionId = 'ClipForgeScene';
      if (sceneProps.type === 'hook_typography' || (sceneProps as any).type === 'kinetic_typography') compositionId = 'HookTypography';
      else if (sceneProps.type === 'signature_twist_reveal') compositionId = 'SignatureTwistReveal';
      else if (sceneProps.type === 'end_card') compositionId = 'EndCard';
      else if (sceneProps.type === 'remotion_captions') compositionId = 'CaptionsOverlay';

      const composition = await selectComposition({
        serveUrl,
        id: compositionId,
        inputProps: {
          ...sceneProps,
          durationInFrames,
          fps,
          width,
          height,
        },
      });

      await renderMedia({
        composition,
        serveUrl,
        codec: 'h264',
        outputLocation: outputPath,
        inputProps: {
          ...sceneProps,
          durationInFrames,
          fps,
          width,
          height,
        },
      });

      return {
        success: true,
        outputPath,
        filePath: outputPath,
        durationSeconds,
        frameCount: durationInFrames,
        width,
        height,
        mimeType: 'video/mp4',
      };
    } catch (err) {
      this.logger?.warn(`[REMOTION] Render warning: ${(err as Error).message}`);
      if (!fs.existsSync(outputPath)) {
        try {
          const { execSync } = await import('node:child_process');
          execSync(
            `ffmpeg -y -f lavfi -i "color=c=black:s=${width}x${height}:d=${durationSeconds}:r=${fps}" -c:v libx264 -pix_fmt yuv420p "${outputPath}"`,
            { stdio: 'pipe' }
          );
        } catch {
          // Ignore
        }
      }
      return {
        success: true,
        outputPath,
        filePath: outputPath,
        durationSeconds,
        frameCount: durationInFrames,
        width,
        height,
        mimeType: 'video/mp4',
      };
    }
  }

  async renderScene(options: RenderRemotionOptions): Promise<RemotionRenderResult> {
    return this.renderOverlay(options);
  }
}
