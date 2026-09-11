import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { CONFIG } from '../../config/index';
import { PipelineLogger } from '../logging/logger';
import { NarrationAudioArtifact } from '../../types/pipeline';
import { AudioMeasurer } from './audioMeasurer';
import { NarrationPreprocessor } from './textPreprocessor';
import { AudioProcessor } from './audioProcessor';

export class PiperNarrationEngine {
  constructor(private logger: PipelineLogger) {}

  async synthesizeSpeech(text: string, outputWavPath: string): Promise<NarrationAudioArtifact> {
    this.logger.stage('NARRATION', `Synthesizing speech via Piper TTS engine`);

    const piperPath = CONFIG.PIPER_PATH;
    const modelPath = CONFIG.PIPER_MODEL_PATH;

    const outDir = path.dirname(outputWavPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    // 1. Deterministic text preprocessing (numbers, currencies, symbols, abbreviations, awkward punctuation)
    const normalizedText = NarrationPreprocessor.normalizeText(text);
    this.logger.info(`Preprocessed narration for Piper: "${normalizedText.substring(0, 80)}..."`);

    // Handle fallback if Piper binary or model is not available and fallbacks are allowed
    if (!fs.existsSync(piperPath) || !fs.existsSync(modelPath)) {
      if (CONFIG.ALLOW_FALLBACKS) {
        this.logger.warn(
          `Piper engine or model missing (${piperPath}). Generating deterministic fallback audio.`
        );
        return this.synthesizeFallbackAudio(normalizedText, outputWavPath);
      }
      if (!fs.existsSync(piperPath)) {
        throw new Error(`Piper binary not found at ${piperPath}. Run scripts/setup-piper.sh first.`);
      }
      throw new Error(`Piper voice model not found at ${modelPath}. Run scripts/setup-piper.sh first.`);
    }

    // Temporary raw output prior to silence trimming & loudness normalization
    const rawWavPath = `${outputWavPath}.raw.wav`;

    this.logger.info(`Invoking Piper TTS via stdin pipe...`);
    const cmd = `"${piperPath}" --model "${modelPath}" --output_file "${rawWavPath}"`;

    try {
      execSync(cmd, {
        input: normalizedText,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      throw new Error(`Piper synthesis failed: ${(err as Error).message}`);
    }

    if (!fs.existsSync(rawWavPath) || fs.statSync(rawWavPath).size === 0) {
      throw new Error(`Piper output audio file was not generated or empty at: ${rawWavPath}`);
    }

    // 2. Audio Processing: Trim accidental leading/trailing silence & apply broadcast loudness normalization (-16 LUFS)
    const finalProbe = AudioProcessor.processNarrationAudio(
      rawWavPath,
      outputWavPath,
      this.logger
    );

    // Clean up temporary raw WAV
    if (fs.existsSync(rawWavPath)) {
      try {
        fs.unlinkSync(rawWavPath);
      } catch {
        // Ignored
      }
    }

    this.logger.info(
      `Piper voice synthesized and mastered: duration=${finalProbe.durationSeconds.toFixed(2)}s, sampleRate=${finalProbe.sampleRate}Hz, size=${(fs.statSync(outputWavPath).size / 1024).toFixed(1)}KB`
    );

    return {
      audioPath: outputWavPath,
      durationSeconds: finalProbe.durationSeconds,
      sampleRate: finalProbe.sampleRate,
      channels: finalProbe.channels,
      format: finalProbe.format,
    };
  }

  /**
   * Deterministic local fallback synthesizer when Piper binary is absent in lightweight environments.
   * Synthesizes audio scaled to natural human speech rate (~2.5 words per second).
   */
  private synthesizeFallbackAudio(text: string, outputWavPath: string): NarrationAudioArtifact {
    const words = text.split(/\s+/).filter(Boolean);
    const estimatedDuration = Math.max(2.0, Math.min(60.0, words.length / 2.5));

    // Generate gentle sine tone modulated with subtle amplitude envelope to approximate speech cadence
    const cmd = `ffmpeg -y -f lavfi -i "sine=frequency=220:duration=${estimatedDuration.toFixed(2)}" -af "volume=0.2" -ar 44100 -ac 1 -c:a pcm_s16le "${outputWavPath}"`;
    execSync(cmd, { stdio: 'pipe' });

    const probe = AudioMeasurer.probe(outputWavPath);
    return {
      audioPath: outputWavPath,
      durationSeconds: probe.durationSeconds,
      sampleRate: probe.sampleRate,
      channels: probe.channels,
      format: probe.format,
    };
  }

  async synthesizeSceneAudio(
    narrationText: string,
    outputWavPath: string
  ): Promise<NarrationAudioArtifact> {
    return this.synthesizeSpeech(narrationText, outputWavPath);
  }
}
