import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { CONFIG } from '../../config/index';
import { PipelineLogger } from '../logging/logger';
import { NarrationAudioArtifact } from '../../types/pipeline';
import { AudioMeasurer } from './audioMeasurer';

export class PiperNarrationEngine {
  constructor(private logger: PipelineLogger) {}

  async synthesizeSpeech(text: string, outputWavPath: string): Promise<NarrationAudioArtifact> {
    this.logger.stage('NARRATION', `Synthesizing speech via Piper TTS engine`);

    const piperPath = CONFIG.PIPER_PATH;
    const modelPath = CONFIG.PIPER_MODEL_PATH;

    if (!fs.existsSync(piperPath)) {
      throw new Error(`Piper binary not found at ${piperPath}. Run scripts/setup-piper.sh first.`);
    }
    if (!fs.existsSync(modelPath)) {
      throw new Error(`Piper voice model not found at ${modelPath}. Run scripts/setup-piper.sh first.`);
    }

    const outDir = path.dirname(outputWavPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    // Clean text: remove special characters that could break echo/shell
    const sanitizedText = text.replace(/["\\`$]/g, '').trim();

    this.logger.info(`Invoking Piper: "${sanitizedText.substring(0, 60)}..."`);
    const cmd = `echo "${sanitizedText}" | "${piperPath}" --model "${modelPath}" --output_file "${outputWavPath}"`;

    try {
      execSync(cmd, { stdio: 'pipe' });
    } catch (err) {
      throw new Error(`Piper synthesis failed: ${(err as Error).message}`);
    }

    if (!fs.existsSync(outputWavPath) || fs.statSync(outputWavPath).size === 0) {
      throw new Error(`Piper output audio file was not generated or empty at: ${outputWavPath}`);
    }

    const probe = AudioMeasurer.probe(outputWavPath);
    this.logger.info(
      `Piper voice synthesized: duration=${probe.durationSeconds.toFixed(2)}s, sampleRate=${probe.sampleRate}Hz, size=${(fs.statSync(outputWavPath).size / 1024).toFixed(1)}KB`
    );

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
