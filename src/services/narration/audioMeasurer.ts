import { execSync } from 'node:child_process';
import fs from 'node:fs';

export interface AudioProbeDetails {
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  format: string;
}

export class AudioMeasurer {
  static probe(filePath: string): AudioProbeDetails {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Audio file not found for probing: ${filePath}`);
    }

    const cmd = `ffprobe -v error -show_entries format=duration,format_name:stream=codec_name,sample_rate,channels -of json "${filePath}"`;
    const stdout = execSync(cmd, { encoding: 'utf-8' });
    const data = JSON.parse(stdout);

    const durationSeconds = parseFloat(data.format?.duration || '0');
    const stream = data.streams?.[0];

    return {
      durationSeconds,
      sampleRate: parseInt(stream?.sample_rate || '22050', 10),
      channels: parseInt(stream?.channels || '1', 10),
      format: data.format?.format_name || 'wav',
    };
  }
}
