import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { RenderSceneOptions, RenderResult } from './types';
import { generateSceneHtml } from './templates';
import { PipelineLogger } from '../logging/logger';

export class PlaywrightSceneRenderer {
  private logger?: PipelineLogger;

  constructor(logger?: PipelineLogger) {
    this.logger = logger;
  }

  /**
   * Renders a custom visual scene deterministically using Playwright or SVG/HTML fallback.
   */
  async renderScene(options: RenderSceneOptions): Promise<RenderResult> {
    const isVertical = options.format === 'short';
    const width = isVertical ? 1080 : 1920;
    const height = isVertical ? 1920 : 1080;
    const fps = options.fps || 30;
    const durationSeconds = options.durationSeconds || 3.0;

    const htmlContent = generateSceneHtml(options);

    const outputDir = path.resolve(process.cwd(), 'artifacts', 'visuals');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const filename = `scene_${options.sceneParams.type}_${Date.now()}.png`;
    const filePath = options.outputPath || path.join(outputDir, filename);

    let browser: any = null;
    try {
      this.logger?.info(`Attempting Playwright headless render for scene type: ${options.sceneParams.type}...`);
      browser = await chromium.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
      });

      const context = await browser.newContext({
        viewport: { width, height },
      });

      const page = await context.newPage();
      await page.setContent(htmlContent, { waitUntil: 'load' });

      // Wait for fonts or animations to settle
      await page.waitForTimeout(100);

      await page.screenshot({ path: filePath, fullPage: true });
      await browser.close();

      this.logger?.info(`Successfully rendered scene via Playwright: ${filePath}`);

      return {
        success: true,
        filePath,
        mimeType: 'image/png',
        width,
        height,
        durationSeconds,
      };
    } catch (err) {
      if (browser) {
        try {
          await browser.close();
        } catch {}
      }

      this.logger?.warn(
        `Playwright render skipped/failed (${(err as Error).message}). Using deterministic SVG/HTML data fallback...`
      );

      // Safe deterministic fallback: write HTML file and data URL
      const htmlFallbackPath = filePath.replace('.png', '.html');
      fs.writeFileSync(htmlFallbackPath, htmlContent, 'utf-8');

      return {
        success: true,
        filePath: htmlFallbackPath,
        mimeType: 'text/html',
        width,
        height,
        durationSeconds,
      };
    }
  }
}
