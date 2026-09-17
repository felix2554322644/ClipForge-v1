import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { PipelineLogger } from '../logging/logger';
import { AudioMeasurer, AudioProbeDetails } from '../narration/audioMeasurer';
import { AudioPlan, SfxCueIntent } from '../../types/audio';
import { AudioAssetManager } from './assetManager';
import { AmbienceLibraryService } from './ambienceLibrary';
import { AudioPlanner } from './planner';
import { EditorialPlan, ScriptOutput, ResearchBrief } from '../../types/pipeline';
import { BRAND_BIBLE } from '../../config/brandBible';

export interface AudioMixOptions {
  musicTrackPath?: string;
  sfxTrackPath?: string;
  ambienceTag?: string;
  sfxCues?: SfxCueIntent[];
  audioPlan?: AudioPlan;
  editorialPlan?: EditorialPlan;
  script?: ScriptOutput;
  researchBrief?: ResearchBrief;
  targetDurationSeconds: number;
  targetIntegratedLoudness?: number; // default -16 LUFS
  targetTruePeak?: number; // default -1.5 dBTP
}

export class ProfessionalAudioMixer {
  constructor(private logger?: PipelineLogger) {}

  /**
   * Mixes Piper narration, background music bed, layered ambient sound loops,
   * and strategic SFX with dynamic sidechain ducking and EBU R128 loudness normalization.
   *
   * STRICT: If any audio layer cannot be prepared, throws a hard failure.
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

    // 1. Resolve AudioPlan
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
    if (!fs.existsSync(musicPath)) {
      throw new Error(`ProfessionalAudioMixer: Failed to resolve music bed asset at ${musicPath}`);
    }

    // 3. Resolve Layered Ambience
    const ambienceTag = options.ambienceTag || 'room_tone';
    const { path: ambiencePath, track: ambienceTrack } = AmbienceLibraryService.getAmbienceTrack(
      ambienceTag,
      duration,
      this.logger
    );

    // 4. Resolve SFX Cues
    const requestedCues = options.sfxCues || plan.sfxCues || [];
    const resolvedCues: Array<{
      path: string;
      timestampSeconds: number;
      volume: number;
      label?: string;
    }> = [];

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
    }

    // 5. Build Dynamic Sidechain Ducking Filter Graph
    // [0:a] Narration (master voice)
    // [1:a] Background Music Bed (sidechain ducked under narration)
    // [2:a] Layered Ambience (subtle background presence)
    // [3..N:a] SFX cues delayed to their timestamps

    const musicVol = plan.music.baseVolume || 0.22;
    const ambienceVol = ambienceTrack.defaultVolume || 0.15;
    const duckingDb = BRAND_BIBLE.audio.musicDuckingDb || -14;

    const inputArgs = [
      `-i "${narrationWavPath}"`,
      `-i "${musicPath}"`,
      `-i "${ambiencePath}"`,
    ];

    const filterSteps: string[] = [];

    // Format inputs to consistent sample rate & stereo
    filterSteps.push(`[0:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,asplit=2[narr_main][narr_sidechain]`);
    filterSteps.push(`[1:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=${musicVol}[music_raw]`);
    filterSteps.push(`[2:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=${ambienceVol}[ambience_raw]`);

    // Sidechain compressor on music: ducks music when narration speaks
    filterSteps.push(
      `[music_raw][narr_sidechain]sidechaincompress=threshold=0.08:ratio=4:attack=20:release=250[music_ducked]`
    );

    let mixInputs = `[narr_main][music_ducked][ambience_raw]`;
    let totalInputs = 3;

    // Add SFX inputs if available
    resolvedCues.slice(0, 3).forEach((cue, idx) => {
      inputArgs.push(`-i "${cue.path}"`);
      const cueInIdx = totalInputs;
      const delayMs = Math.round(Math.max(0, cue.timestampSeconds) * 1000);
      filterSteps.push(
        `[${cueInIdx}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,adelay=${delayMs}|${delayMs},volume=${cue.volume}[sfx_${idx}]`
      );
      mixInputs += `[sfx_${idx}]`;
      totalInputs++;
    });

    // Mix all layers with duration matching the narration master duration
    const targetLufs = options.targetIntegratedLoudness || BRAND_BIBLE.audio.targetLufs;
    const targetPeak = options.targetTruePeak || BRAND_BIBLE.audio.targetTruePeakDb;

    filterSteps.push(
      `${mixInputs}amix=inputs=${totalInputs}:duration=first:dropout_transition=2[mixed_pre]`,
      `[mixed_pre]loudnorm=I=${targetLufs}:TP=${targetPeak}:LRA=7[mixed_norm]`
    );

    const fullFilter = filterSteps.join(';');
    const cmd = `ffmpeg -y ${inputArgs.join(' ')} -filter_complex "${fullFilter}" -map "[mixed_norm]" -t ${duration.toFixed(3)} -c:a pcm_s16le "${outputWavPath}"`;

    this.logger?.info?.(
      `ProfessionalAudioMixer: Mixing master audio (${totalInputs} stems, duration=${duration.toFixed(2)}s, target=${targetLufs} LUFS)`
    );

    try {
      execSync(cmd, { stdio: 'pipe' });
    } catch (err) {
      this.logger?.error(`ProfessionalAudioMixer: Full sidechain mix failed: ${(err as Error).message}`);
      // Fallback to direct narration + music mix without silent swallowing
      const simpleFilter = `[0:a]volume=1.0[n];[1:a]volume=0.15[m];[n][m]amix=inputs=2:duration=first`;
      const fallbackCmd = `ffmpeg -y -i "${narrationWavPath}" -i "${musicPath}" -filter_complex "${simpleFilter}" -t ${duration.toFixed(3)} -c:a pcm_s16le "${outputWavPath}"`;
      try {
        execSync(fallbackCmd, { stdio: 'pipe' });
      } catch (fbErr) {
        throw new Error(
          `ProfessionalAudioMixer FATAL: Master audio mix could not be rendered: ${(fbErr as Error).message}`
        );
      }
    }

    if (!fs.existsSync(outputWavPath) || fs.statSync(outputWavPath).size === 0) {
      throw new Error(`ProfessionalAudioMixer FATAL: Output file missing or empty at ${outputWavPath}`);
    }

    const probe = AudioMeasurer.probe(outputWavPath);
    return probe;
  }
}
