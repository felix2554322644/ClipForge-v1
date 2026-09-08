import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { TimelineArtifact, RenderReportArtifact } from '../../types/pipeline.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const execFileAsync = promisify(execFile);

export class Renderer {
  public async renderVideo(
    jobId: string,
    timeline: TimelineArtifact,
    outputFilePath: string
  ): Promise<RenderReportArtifact> {
    logger.info(jobId, 'ffmpeg_render', `Starting FFmpeg composition for ${timeline.videoClips.length} scenes`);

    await fs.mkdir(path.dirname(outputFilePath), { recursive: true });

    const startTime = Date.now();
    const { args, filterGraph } = this.buildFfmpegCommand(timeline, outputFilePath);

    logger.info(jobId, 'ffmpeg_render', `Executing FFmpeg: ${config.ffmpegPath} ${args.slice(0, 10).join(' ')}...`);

    try {
      await execFileAsync(config.ffmpegPath, args, { maxBuffer: 10 * 1024 * 1024 });
    } catch (err: any) {
      logger.error(jobId, 'ffmpeg_render', `FFmpeg execution failed: ${err.message}`, { stderr: err.stderr });
      throw new Error(`FFmpeg rendering failed: ${err.message}\n${err.stderr || ''}`);
    }

    const renderDurationMs = Date.now() - startTime;
    const stats = await fs.stat(outputFilePath);

    const report: RenderReportArtifact = {
      outputPath: outputFilePath,
      renderDurationMs,
      ffmpegCommand: `${config.ffmpegPath} ${args.join(' ')}`,
      filterGraph,
      outputFileSize: stats.size,
      renderedAt: new Date().toISOString(),
    };

    logger.info(
      jobId,
      'ffmpeg_render',
      `FFmpeg render completed in ${(renderDurationMs / 1000).toFixed(1)}s, output size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`
    );

    return report;
  }

  public buildFfmpegCommand(
    timeline: TimelineArtifact,
    outputFilePath: string
  ): { args: string[]; filterGraph: string } {
    const args: string[] = ['-y'];
    const { width, height, fps } = timeline.canvas;

    // 1. Add all video clip inputs with -stream_loop to guarantee adequate frames for trim
    for (const clip of timeline.videoClips) {
      args.push('-stream_loop', '-1', '-i', clip.clipPath);
    }

    // 2. Add narration audio as the last input
    const narrationInputIndex = timeline.videoClips.length;
    args.push('-i', timeline.narrationAudioPath);

    // 3. Build filter graph
    const filterParts: string[] = [];
    const concatInputs: string[] = [];

    timeline.videoClips.forEach((clip, idx) => {
      const vLabel = `v${idx}`;
      concatInputs.push(`[${vLabel}]`);

      // Trim, reset pts, scale with aspect ratio preserved, center crop, normalize fps and sar
      const trimStr = `trim=start=${clip.clipTrimStartSec}:duration=${clip.clipDurationSec},setpts=PTS-STARTPTS`;
      const scaleCropStr = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
      const formatStr = `fps=${fps},setsar=1,format=yuv420p`;

      filterParts.push(`[${idx}:v]${trimStr},${scaleCropStr},${formatStr}[${vLabel}]`);
    });

    // Concat all processed video segments
    const concatFilter = `${concatInputs.join('')}concat=n=${timeline.videoClips.length}:v=1:a=0[vcat]`;
    filterParts.push(concatFilter);

    const fullFilterGraph = filterParts.join(';\n');

    args.push('-filter_complex', fullFilterGraph);
    args.push('-map', '[vcat]');
    args.push('-map', `${narrationInputIndex}:a`);

    // Output video & audio encoding options
    args.push(
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '22',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '44100',
      '-ac', '2',
      '-movflags', '+faststart',
      '-shortest',
      outputFilePath
    );

    return { args, filterGraph: fullFilterGraph };
  }
}

export const renderer = new Renderer();
