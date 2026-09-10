import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { TimelineComposition, RenderReport } from '../../types/pipeline';
import { PipelineLogger } from '../logging/logger';
import { MotionApplier } from '../media/motion';

export class FfmpegRenderer {
  constructor(private logger: PipelineLogger) {}

  async render(timeline: TimelineComposition, outputVideoPath: string): Promise<RenderReport> {
    this.logger.stage('RENDERING', `Rendering multi-shot timeline to: ${outputVideoPath}`);
    const startTime = Date.now();

    const renderDir = path.dirname(outputVideoPath);
    const cutsDir = path.join(renderDir, 'cuts');
    if (!fs.existsSync(cutsDir)) {
      fs.mkdirSync(cutsDir, { recursive: true });
    }

    const processedCutPaths: string[] = [];

    // 1. Prepare each cut segment
    for (let i = 0; i < timeline.cuts.length; i++) {
      const cut = timeline.cuts[i];
      const cutId = cut.shotId || `cut_${cut.sceneIndex}_${i}`;
      const cutOut = path.join(cutsDir, `${cutId}.mp4`);

      this.logger.info(
        `Processing cut ${i + 1}/${timeline.cuts.length} (${cut.durationSeconds.toFixed(2)}s, motion=${cut.motionEffect}, transition=${cut.transition || 'cut'})`
      );

      // Apply motion, trim, and inPoint offset
      MotionApplier.applyMotion(
        cut.videoSourcePath,
        cutOut,
        cut.motionEffect,
        cut.durationSeconds,
        timeline.fps,
        cut.transition || 'cut',
        timeline.width,
        timeline.height,
        cut.inPoint || 0
      );

      processedCutPaths.push(cutOut);
    }

    // 2. Build FFmpeg concat and caption filter graph
    const inputs: string[] = [];
    let filterGraph = '';

    processedCutPaths.forEach((p, idx) => {
      inputs.push(`-i "${p}"`);
      filterGraph += `[${idx}:v]scale=${timeline.width}:${timeline.height}:force_original_aspect_ratio=decrease,pad=${timeline.width}:${timeline.height}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${idx}];`;
    });

    const concatInputs = processedCutPaths.map((_, idx) => `[v${idx}]`).join('');

    const hasCaptions =
      Boolean(timeline.captionAssPath) &&
      fs.existsSync(timeline.captionAssPath!) &&
      fs.statSync(timeline.captionAssPath!).size > 50;

    if (hasCaptions) {
      const escapedAssPath = timeline.captionAssPath!
        .replace(/\\/g, '/')
        .replace(/:/g, '\\:')
        .replace(/'/g, "\\'");

      filterGraph += `${concatInputs}concat=n=${processedCutPaths.length}:v=1:a=0[vconcat];`;
      filterGraph += `[vconcat]subtitles='${escapedAssPath}'[outv]`;
      this.logger.info(`Burning in synchronized captions using ASS filter: ${timeline.captionAssPath}`);
    } else {
      filterGraph += `${concatInputs}concat=n=${processedCutPaths.length}:v=1:a=0[outv]`;
    }

    // Master audio input is the last input
    const audioIdx = processedCutPaths.length;
    inputs.push(`-i "${timeline.audioTrackPath}"`);

    // Strict duration enforcement matching authoritative narration duration
    const renderCmd = `ffmpeg -y ${inputs.join(' ')} -filter_complex "${filterGraph}" -map "[outv]" -map ${audioIdx}:a -c:v libx264 -preset veryfast -crf 22 -c:a aac -b:a 192k -t ${timeline.totalDurationSeconds} -shortest -movflags +faststart "${outputVideoPath}"`;

    this.logger.info('Executing final FFmpeg composite render with audio sync and burned-in captions...');
    try {
      execSync(renderCmd, { stdio: 'pipe' });
    } catch (err: any) {
      this.logger.error(`FFmpeg render failed: ${err.message}`);
      if (err.stderr) {
        this.logger.error(`FFmpeg stderr: ${err.stderr.toString()}`);
      }
      throw new Error(`FFmpeg rendering failed: ${err.message}`);
    }

    if (!fs.existsSync(outputVideoPath) || fs.statSync(outputVideoPath).size === 0) {
      throw new Error(`FFmpeg rendering failed. Output file missing: ${outputVideoPath}`);
    }

    const stats = fs.statSync(outputVideoPath);
    const renderTimeMs = Date.now() - startTime;

    this.logger.info(
      `Render completed in ${(renderTimeMs / 1000).toFixed(1)}s, size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB (${processedCutPaths.length} shots, captions: ${hasCaptions ? 'BURNED' : 'NONE'})`
    );

    return {
      outputPath: outputVideoPath,
      fileSizeBytes: stats.size,
      durationSeconds: timeline.totalDurationSeconds,
      renderTimeMs,
      resolution: { width: timeline.width, height: timeline.height },
      fps: timeline.fps,
      shotCount: processedCutPaths.length,
      captionCount: timeline.captions?.length || 0,
      captionsBurnedIn: hasCaptions,
    };
  }
}
