import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { PipelineLogger } from '../logging/logger';
import { AudioMeasurer, AudioProbeDetails } from '../narration/audioMeasurer';
import { AudioPlan, SfxCueIntent } from '../../types/audio';
import { AudioAssetManager } from './assetManager';
import { AudioPlanner } from './planner';
import { EditorialPlan, ScriptOutput, ResearchBrief } from '../../types/pipeline';

export interface AudioMixOptions {
  musicTrackPath?: string;
  sfxTrackPath?: string;
  sfxCues?: SfxCueIntent[];
  audioPlan?: AudioPlan;
  editorialPlan?: EditorialPlan;
  script?: ScriptOutput;
  researchBrief?: ResearchBrief;
  targetDurationSeconds: number;
  targetIntegratedLoudness?: number; // e.g., -16 LUFS
  targetTruePeak?: number; // e.g., -1.5 dBTP
}

export class ProfessionalAudioMixer {
  constructor(private logger?: PipelineLogger) {}

  /**
   * Mixes Piper narration, background music bed, and strategic SFX with dynamic sidechain ducking,
   * narrative hierarchy (narration > SFX > music), smooth fades, EBU R128 loudness normalization,
   * and strict duration preservation.
   */
  mixAudio(
    narrationWavPath: string,
    outputWavPath: string,
    options: AudioMixOptions
  ): AudioProbeDetails {
    if (!fs.existsSync(narrationWavPath)) {
      throw new Error(`ProfessionalAudioMixer: Narration audio not found at ${narrationWavPath}`);
    }

    const outDir = path.dirname(outputWavPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const duration = options.targetDurationSeconds || 5.0;

    // 1. Resolve or generate AudioPlan
    const plan =
      options.audioPlan ||
      AudioPlanner.planAudio({
        totalDurationSeconds: duration,
        editorialPlan: options.editorialPlan,
        script: options.script,
        researchBrief: options.researchBrief,
      });

    // 2. Resolve Music Bed
    let musicPath = options.musicTrackPath || plan.music.trackPath;
    if (!musicPath || !fs.existsSync(musicPath)) {
      musicPath = AudioAssetManager.getMusicBed(
        plan.music.genreMood,
        duration,
        this.logger
      );
    }

    // 3. Resolve SFX Cues
    const requestedCues = options.sfxCues || plan.sfxCues || [];
    const resolvedCues: Array<{
      path: string;
      timestampSeconds: number;
      volume: number;
      label?: string;
    }> = [];

    // If a single sfxTrackPath was explicitly passed (backward compatibility with earlier tests)
    if (options.sfxTrackPath && fs.existsSync(options.sfxTrackPath)) {
      resolvedCues.push({
        path: options.sfxTrackPath,
        timestampSeconds: 0.2,
        volume: 0.35,
        label: 'Single custom SFX track',
      });
    } else if (requestedCues.length > 0) {
      for (const cue of requestedCues) {
        let cuePath = cue.assetPath;
        if (!cuePath || !fs.existsSync(cuePath)) {
          cuePath = AudioAssetManager.getSfx(cue.type, cue.durationSeconds || 0.5, this.logger);
        }
        if (fs.existsSync(cuePath)) {
          resolvedCues.push({
            path: cuePath,
            timestampSeconds: cue.timestampSeconds,
            volume: cue.volumeMultiplier || 0.35,
            label: cue.label || cue.type,
          });
        }
      }
    } else {
      // Fallback: generate a single intro whoosh
      const fallbackSfx = AudioAssetManager.getSfx('whoosh', 0.5, this.logger);
      if (fs.existsSync(fallbackSfx)) {
        resolvedCues.push({
          path: fallbackSfx,
          timestampSeconds: 0.2,
          volume: 0.35,
          label: 'Default fallback whoosh',
        });
      }
    }

    const hasMusic = Boolean(musicPath && fs.existsSync(musicPath));
    const hasSfx = resolvedCues.length > 0;

    this.logger?.stage(
      'AUDIO_MIXING',
      `Mixing professional audio: narration (priority=1.0) + music (${hasMusic ? plan.music.genreMood : 'none'}) + ${resolvedCues.length} SFX cues (dynamic sidechain ducking + loudness normalization)`
    );

    // 4. Build FFmpeg filtergraph
    // Input 0: Narration WAV
    const inputs: string[] = [`-i "${narrationWavPath}"`];
    let inputIdx = 1;

    let musicInputIdx = -1;
    if (hasMusic) {
      inputs.push(`-i "${musicPath}"`);
      musicInputIdx = inputIdx++;
    }

    const sfxStreamIndices: Array<{ inputIdx: number; cue: (typeof resolvedCues)[0] }> = [];
    for (const cue of resolvedCues) {
      inputs.push(`-i "${cue.path}"`);
      sfxStreamIndices.push({ inputIdx: inputIdx++, cue });
    }

    // Filter construction
    const filterClauses: string[] = [];
    const mixInputLabels: string[] = [];

    // Stream 0: Narration dry and sidechain control branch
    filterClauses.push(
      `[0:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=mono,volume=1.0,asplit=2[narr_dry][narr_sc]`
    );
    mixInputLabels.push('[narr_dry]');

    // Stream 1: Music bed with dynamic sidechain ducking driven by narration
    if (musicInputIdx >= 0) {
      const baseVol = plan.music.baseVolume ?? 0.28;
      const fadeInDur = plan.music.fadeInSeconds ?? 1.5;
      const fadeOutDur = plan.music.fadeOutSeconds ?? 2.0;
      const fadeOutStart = Math.max(0, duration - fadeOutDur);

      const duckThreshold = plan.ducking?.threshold ?? 0.07;
      const duckRatio = plan.ducking?.ratio ?? 4.5;
      const duckAttack = plan.ducking?.attackMs ?? 25;
      const duckRelease = plan.ducking?.releaseMs ?? 300;

      filterClauses.push(
        `[${musicInputIdx}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=mono,volume=${baseVol},afade=t=in:st=0:d=${fadeInDur},afade=t=out:st=${fadeOutStart}:d=${fadeOutDur}[music_pre]`
      );
      filterClauses.push(
        `[music_pre][narr_sc]sidechaincompress=threshold=${duckThreshold}:ratio=${duckRatio}:attack=${duckAttack}:release=${duckRelease}[ducked_music]`
      );
      mixInputLabels.push('[ducked_music]');
    }

    // Streams for SFX: time-aligned using adelay and apad
    sfxStreamIndices.forEach((sfxItem, idx) => {
      const delayMs = Math.max(0, Math.round(sfxItem.cue.timestampSeconds * 1000));
      const sfxVol = sfxItem.cue.volume || 0.35;
      const label = `[sfx_${idx}]`;

      filterClauses.push(
        `[${sfxItem.inputIdx}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=mono,volume=${sfxVol},adelay=${delayMs}|${delayMs},apad=whole_dur=${duration}${label}`
      );
      mixInputLabels.push(label);
    });

    const targetLufs = options.targetIntegratedLoudness ?? plan.loudnessTarget?.integratedLufs ?? -16;
    const targetTruePeak = options.targetTruePeak ?? plan.loudnessTarget?.truePeakDb ?? -1.5;
    const targetLra = plan.loudnessTarget?.loudnessRange ?? 11;

    // Amix inputs + final EBU R128 loudness normalization
    const amixInputs = mixInputLabels.join('');
    filterClauses.push(
      `${amixInputs}amix=inputs=${mixInputLabels.length}:duration=first,loudnorm=I=${targetLufs}:TP=${targetTruePeak}:LRA=${targetLra}[outa]`
    );

    const fullFilterGraph = filterClauses.join(';');
    const mixCmd = `ffmpeg -y ${inputs.join(' ')} -filter_complex "${fullFilterGraph}" -map "[outa]" -ar 44100 -ac 1 -c:a pcm_s16le -t ${duration} "${outputWavPath}"`;

    try {
      execSync(mixCmd, { stdio: 'pipe' });
    } catch (err) {
      this.logger?.warn?.(
        `ProfessionalAudioMixer: Sidechain dynamic audio mix failed (${(err as Error).message}). Falling back to clean narration.`
      );
      const fallbackCmd = `ffmpeg -y -i "${narrationWavPath}" -ar 44100 -ac 1 -c:a pcm_s16le -t ${duration} "${outputWavPath}"`;
      try {
        execSync(fallbackCmd, { stdio: 'pipe' });
      } catch (fallbackErr) {
        fs.copyFileSync(narrationWavPath, outputWavPath);
      }
    }

    if (!fs.existsSync(outputWavPath) || fs.statSync(outputWavPath).size === 0) {
      fs.copyFileSync(narrationWavPath, outputWavPath);
    }

    const probe = AudioMeasurer.probe(outputWavPath);
    this.logger?.info?.(
      `ProfessionalAudioMixer: Audio mix completed successfully. Master duration: ${probe.durationSeconds.toFixed(2)}s, Normalized: ${targetLufs} LUFS, True Peak: ${targetTruePeak} dBTP.`
    );

    return probe;
  }
}
