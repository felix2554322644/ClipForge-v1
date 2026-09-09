import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { TimelineComposition, RenderReport } from '../../types/pipeline';
import { PipelineLogger } from '../logging/logger';
import { MotionApplier } from '../media/motion';

export class FfmpegRenderer {
  constructor(private logger: PipelineLogger) {}

  async render(timeline: TimelineComposition, outputVideoPath: string): Promise<RenderReport> {
    this.logger.stage('RENDERING', `Rendering timeline to: ${outputVideoPath}`);
    const startTime = Date.now();

    const renderDir = path.dirname(outputVideoPath);
    const cutsDir = path.join(renderDir, 'cuts');
    if (!fs.existsSync(cutsDir)) {
      fs.mkdirSync(cutsDir, { recursive: true });
    }

    const processedCutPaths: string[] = [];

    // 1. Prepare each cut segment
    for (const cut of timeline.cuts) {
      const cutOut = path.join(cutsDir, `cut_${cut.sceneIndex}.mp4`);
      this.logger.info(`Processing cut ${cut.sceneIndex} (${cut.durationSeconds}s, motion=${cut.motionEffect})`);

      // Apply motion or trim
      MotionApplier.applyMotion(
        cut.videoSourcePath,
        cutOut,
        cut.motionEffect,
        cut.durationSeconds,
        timeline.fps
      );

      processedCutPaths.push(cutOut);
    }

    // 2. Build FFmpeg concat command
    const inputs: string[] = [];
    let filterGraph = '';

    processedCutPaths.forEach((p, idx) => {
      inputs.push(`-i "${p}"`);
      filterGraph += `[${idx}:v]scale=${timeline.width}:${timeline.height}:force_original_aspect_ratio=decrease,pad=${timeline.width}:${timeline.height}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${idx}];`;
    });

    const concatInputs = processedCutPaths.map((_, idx) => `[v${idx}]`).join('');
    filterGraph += `${concatInputs}concat=n=${processedCutPaths.length}:v=1:a=0[outv]`;

    // Master audio input is the last input
    const audioIdx = processedCutPaths.length;
    inputs.push(`-i "${timeline.audioTrackPath}"`);

    const renderCmd = `ffmpeg -y ${inputs.join(' ')} -filter_complex "${filterGraph}" -map "[outv]" -map ${audioIdx}:a -c:v libx264 -preset veryfast -crf 22 -c:a aac -b:a 192k -shortest -movflags +faststart "${outputVideoPath}"`;

    this.logger.info('Executing final FFmpeg composite render...');
    execSync(renderCmd, { stdio: 'pipe' });

    if (!fs.existsSync(outputVideoPath) || fs.statSync(outputVideoPath).size === 0) {
      throw new Error(`FFmpeg rendering failed. Output file missing: ${outputVideoPath}`);
    }

    const stats = fs.statSync(outputVideoPath);
    const renderTimeMs = Date.now() - startTime;

    this.logger.info(
      `Render completed in ${(renderTimeMs / 1000).toFixed(1)}s, size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`
    );

    return {
      outputPath: outputVideoPath,
      fileSizeBytes: stats.size,
      durationSeconds: timeline.totalDurationSeconds,
      renderTimeMs,
      resolution: { width: timeline.width, height: timeline.height },
      fps: timeline.fps,
    };
  }
}
