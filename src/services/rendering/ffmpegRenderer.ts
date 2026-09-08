import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { RenderReportArtifact, TimelineArtifact } from '../../contracts/artifacts';
import { AppConfig, VIDEO_PROFILES } from '../../config';
import { PipelineLogger } from '../logging/logger';

export class FFmpegRenderer {
  constructor(private config: AppConfig, private logger: PipelineLogger) {}

  public async renderTimeline(
    timeline: TimelineArtifact,
    outputDir: string,
    jobId: string
  ): Promise<{ outputPath: string; report: RenderReportArtifact }> {
    this.logger.stageStart('rendering', `Clips: ${timeline.tracks.videoClips.length}, Output resolution: ${timeline.resolution.width}x${timeline.resolution.height}`);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, 'final-video.mp4');
    const renderStartedAt = new Date().toISOString();
    const startTimeMs = Date.now();

    const profileConfig = VIDEO_PROFILES[timeline.profile] || VIDEO_PROFILES['vertical-1080'];
    const targetW = timeline.resolution.width;
    const targetH = timeline.resolution.height;
    const fps = profileConfig.fps;
    const videoClips = timeline.tracks.videoClips;
    const audioTrack = timeline.tracks.audioTrack;

    if (!fs.existsSync(audioTrack.assetPath)) {
      throw new Error(`Narration audio asset not found at "${audioTrack.assetPath}"`);
    }

    // Prepare inputs
    const inputArgs: string[] = [];
    const filterParts: string[] = [];
    const concatLabels: string[] = [];

    const inputAssets: RenderReportArtifact['inputAssets'] = [];

    videoClips.forEach((clip, idx) => {
      if (!fs.existsSync(clip.assetPath)) {
        throw new Error(`Video clip asset not found at "${clip.assetPath}"`);
      }

      inputArgs.push('-i', clip.assetPath);
      inputAssets.push({
        path: clip.assetPath,
        duration: clip.duration,
        type: 'video',
      });

      const ref = clip.reframing;
      // Filter graph for this segment:
      // Loop if clip is short, trim to duration, crop to 9:16 aspect, scale to target resolution, set fps, SAR
      const vLabel = `v${idx}`;
      filterParts.push(
        `[${idx}:v]loop=loop=-1:size=60:start=0,trim=start=${clip.trimStart.toFixed(3)}:duration=${clip.duration.toFixed(3)},setpts=PTS-STARTPTS,crop=${ref.cropWidth}:${ref.cropHeight}:${ref.cropX}:${ref.cropY},scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH},setsar=1,fps=${fps}[${vLabel}]`
      );
      concatLabels.push(`[${vLabel}]`);
    });

    // Concat filter
    const concatFilter = `${concatLabels.join('')}concat=n=${videoClips.length}:v=1:a=0[vconcat]`;
    filterParts.push(concatFilter);

    // Audio input is after all video inputs
    const audioInputIndex = videoClips.length;
    inputArgs.push('-i', audioTrack.assetPath);
    inputAssets.push({
      path: audioTrack.assetPath,
      duration: audioTrack.duration,
      type: 'audio',
    });

    const filterGraph = filterParts.join(';');

    // Full FFmpeg args
    const ffmpegArgs = [
      '-y',
      ...inputArgs,
      '-filter_complex', filterGraph,
      '-map', '[vconcat]',
      '-map', `${audioInputIndex}:a`,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '22',
      '-b:v', profileConfig.videoBitrate,
      '-maxrate', '6000k',
      '-bufsize', '12000k',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', profileConfig.audioBitrate,
      '-ar', '44100',
      '-ac', '2',
      '-t', timeline.actualAudioDurationSec.toFixed(3),
      '-movflags', '+faststart',
      outputPath,
    ];

    const commandString = `${this.config.ffmpegBin} ${ffmpegArgs.map((a) => (a.includes(' ') || a.includes(';') ? `"${a}"` : a)).join(' ')}`;
    this.logger.stageProgress('rendering', 'Executing FFmpeg encoding pipeline...');

    const res = spawnSync(this.config.ffmpegBin, ffmpegArgs, {
      maxBuffer: 50 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const endTimeMs = Date.now();
    const renderCompletedAt = new Date().toISOString();
    const renderDurationSec = Number(((endTimeMs - startTimeMs) / 1000).toFixed(2));

    if (res.status !== 0 || !fs.existsSync(outputPath)) {
      const stderr = res.stderr?.toString() || 'Unknown FFmpeg error';
      this.logger.stageError('rendering', stderr);

      const failReport: RenderReportArtifact = {
        jobId,
        renderStartedAt,
        renderCompletedAt,
        renderDurationSec,
        profile: timeline.profile,
        resolution: timeline.resolution,
        ffmpegCommand: commandString,
        inputAssets,
        outputPath,
        outputSizeBytes: 0,
        success: false,
        error: stderr.slice(-1000),
      };

      const failReportPath = path.join(outputDir, 'render-report.json');
      fs.writeFileSync(failReportPath, JSON.stringify(failReport, null, 2));

      throw new Error(`FFmpeg render failed with exit code ${res.status}: ${stderr.slice(-400)}`);
    }

    const outputStats = fs.statSync(outputPath);
    const outputSizeBytes = outputStats.size;

    const report: RenderReportArtifact = {
      jobId,
      renderStartedAt,
      renderCompletedAt,
      renderDurationSec,
      profile: timeline.profile,
      resolution: timeline.resolution,
      ffmpegCommand: commandString,
      inputAssets,
      outputPath,
      outputSizeBytes,
      success: true,
    };

    const reportPath = path.join(outputDir, 'render-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    this.logger.stageCompleted(
      'rendering',
      `Rendered MP4 in ${renderDurationSec}s (${(outputSizeBytes / 1024 / 1024).toFixed(2)} MB)`
    );

    return { outputPath, report };
  }
}
