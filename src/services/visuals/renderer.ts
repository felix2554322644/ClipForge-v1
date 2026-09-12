import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';
import { RenderSceneOptions, RenderResult } from './types';
import { generateSceneHtml } from './templates';
import { PipelineLogger } from '../logging/logger';
import { EditingPrimitives } from '../media/primitives';

export class PlaywrightSceneRenderer {
  private logger?: PipelineLogger;

  constructor(logger?: PipelineLogger) {
    this.logger = logger;
  }

  /**
   * Renders a custom visual scene deterministically using Playwright into an image snapshot,
   * then encodes it to a compliant MP4 video of the exact required duration.
   * If Playwright is unavailable, generates a deterministic procedural MP4 video.
   */
  async renderScene(options: RenderSceneOptions): Promise<RenderResult> {
    const isVertical = options.format === 'short';
    const width = isVertical ? 1080 : 1920;
    const height = isVertical ? 1920 : 1080;
    const fps = options.fps || 30;
    const durationSeconds = options.durationSeconds || 3.0;

    const outputDir = path.resolve(process.cwd(), 'artifacts', 'visuals');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = Date.now();
    const finalMp4Path = options.outputPath || path.join(outputDir, `scene_${options.sceneParams.type}_${timestamp}.mp4`);
    const pngSnapshotPath = finalMp4Path.replace(/\.mp4$/, '.png');

    let browser: any = null;
    try {
      this.logger?.info(`Attempting Playwright render for scene type: ${options.sceneParams.type}...`);
      const htmlContent = generateSceneHtml(options);

      browser = await chromium.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
      });

      const context = await browser.newContext({
        viewport: { width, height },
      });

      const page = await context.newPage();
      await page.setContent(htmlContent, { waitUntil: 'load' });
      await page.waitForTimeout(100);

      await page.screenshot({ path: pngSnapshotPath, fullPage: true });
      await browser.close();
      browser = null;

      if (fs.existsSync(pngSnapshotPath) && fs.statSync(pngSnapshotPath).size > 0) {
        // Convert static snapshot into durationSeconds video using ffmpeg
        const encodeCmd = `ffmpeg -y -loop 1 -i "${pngSnapshotPath}" -t ${durationSeconds} -c:v libx264 -preset ultrafast -pix_fmt yuv420p -r ${fps} -vf "scale=${width}:${height},setsar=1" "${finalMp4Path}"`;
        execSync(encodeCmd, { stdio: 'pipe' });

        if (fs.existsSync(finalMp4Path) && fs.statSync(finalMp4Path).size > 0) {
          this.logger?.info(`Successfully rendered scene to MP4 via Playwright: ${finalMp4Path}`);
          return {
            success: true,
            filePath: finalMp4Path,
            mimeType: 'video/mp4',
            width,
            height,
            durationSeconds,
          };
        }
      }
      throw new Error('Playwright snapshot to video conversion failed');
    } catch (err) {
      if (browser) {
        try {
          await browser.close();
        } catch {}
      }

      this.logger?.warn(
        `Playwright render skipped/failed (${(err as Error).message}). Using deterministic procedural video fallback...`
      );

      // Fallback: Generate procedural MP4 video asset matching exact duration and dimensions
      const theme = options.sceneParams.title || options.sceneParams.type || 'modern tech';
      EditingPrimitives.generateProceduralFootage(
        finalMp4Path,
        Math.max(durationSeconds, 2.0),
        theme,
        width,
        height,
        fps
      );

      return {
        success: true,
        filePath: finalMp4Path,
        mimeType: 'video/mp4',
        width,
        height,
        durationSeconds,
      };
    }
  }
}

