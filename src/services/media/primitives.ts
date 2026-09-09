import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export class EditingPrimitives {
  /**
   * Generates procedural footage with distinct visual themes for diverse cosmic/astronomy shots.
   */
  static generateProceduralFootage(
    outputPath: string,
    durationSeconds: number,
    theme = 'galaxy',
    width = 1080,
    height = 1920,
    fps = 30
  ): string {
    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const t = theme.toLowerCase();
    let filter = '';

    if (t.includes('telescope') || t.includes('observatory') || t.includes('dish') || t.includes('satellite')) {
      // High-tech deep sky observation with radar/reticle grid
      filter = `testsrc2=size=${width}x${height}:rate=${fps}:duration=${durationSeconds},colorbalance=bs=0.4:gs=0.1:rs=-0.4,drawgrid=width=180:height=180:thickness=2:color=cyan@0.4`;
    } else if (t.includes('signal') || t.includes('wave') || t.includes('radio') || t.includes('beam')) {
      // Cosmic radio wave transmission
      filter = `testsrc2=size=${width}x${height}:rate=${fps}:duration=${durationSeconds},hue=s=1.6:h=180,eq=contrast=1.7:brightness=0.08`;
    } else if (t.includes('magnetar') || t.includes('neutron') || t.includes('core') || t.includes('pulsar')) {
      // Blazing neutron star / magnetar core
      filter = `testsrc2=size=${width}x${height}:rate=${fps}:duration=${durationSeconds},hue=s=1.9:h=45,eq=contrast=1.8:brightness=0.12`;
    } else if (t.includes('field') || t.includes('magnetic') || t.includes('shockwave') || t.includes('burst') || t.includes('flare')) {
      // Intense magnetic shockwave and high-energy burst
      filter = `testsrc2=size=${width}x${height}:rate=${fps}:duration=${durationSeconds},hue=s=1.8:h=330,eq=contrast=1.9:saturation=2.2`;
    } else if (t.includes('planet') || t.includes('earth') || t.includes('orbit')) {
      // Celestial planet atmosphere
      filter = `testsrc2=size=${width}x${height}:rate=${fps}:duration=${durationSeconds},hue=s=1.4:h=210,curves=color_negative`;
    } else if (t.includes('galaxy') || t.includes('nebula') || t.includes('deep space')) {
      // Swirling deep space galaxy
      filter = `testsrc2=size=${width}x${height}:rate=${fps}:duration=${durationSeconds},hue=s=1.2:h=260,curves=vintage`;
    } else {
      // Default vibrant starry cosmos
      filter = `testsrc2=size=${width}x${height}:rate=${fps}:duration=${durationSeconds},hue=s=1.1:h=290,eq=contrast=1.3`;
    }

    const cmd = `ffmpeg -y -f lavfi -i "${filter}" -c:v libx264 -pix_fmt yuv420p -t ${durationSeconds} "${outputPath}"`;

    try {
      execSync(cmd, { stdio: 'pipe' });
    } catch {
      // Simple fallback if filter option not recognized
      execSync(
        `ffmpeg -y -f lavfi -i "testsrc2=size=${width}x${height}:rate=${fps}:duration=${durationSeconds}" -c:v libx264 -pix_fmt yuv420p -t ${durationSeconds} "${outputPath}"`,
        { stdio: 'pipe' }
      );
    }

    return outputPath;
  }
}
