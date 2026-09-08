import { execSync } from 'child_process';
import fs from 'fs';

export interface AudioProbeResult {
  durationSec: number;
  sampleRate: number;
  channels: number;
  formatName: string;
  bitRate: number;
}

export class AudioMeasurer {
  constructor(private ffprobeBin: string = 'ffprobe') {}

  public probeAudio(audioPath: string): AudioProbeResult {
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file does not exist at "${audioPath}".`);
    }

    try {
      const cmd = `${this.ffprobeBin} -v quiet -print_format json -show_format -show_streams "${audioPath}"`;
      const stdout = execSync(cmd, { stdio: 'pipe' }).toString();
      const data = JSON.parse(stdout);

      const audioStream = (data.streams || []).find((s: any) => s.codec_type === 'audio') || data.streams?.[0];
      const durationSec = parseFloat(data.format?.duration || audioStream?.duration || '0');
      const sampleRate = parseInt(audioStream?.sample_rate || '22050', 10);
      const channels = parseInt(audioStream?.channels || '1', 10);
      const formatName = data.format?.format_name || 'wav';
      const bitRate = parseInt(data.format?.bit_rate || audioStream?.bit_rate || '0', 10);

      if (durationSec <= 0 || isNaN(durationSec)) {
        throw new Error(`Invalid duration measured for audio file: ${durationSec}s`);
      }

      return {
        durationSec: Number(durationSec.toFixed(3)),
        sampleRate,
        channels,
        formatName,
        bitRate,
      };
    } catch (err: any) {
      throw new Error(`FFprobe audio measurement failed for "${audioPath}": ${err.message || err}`);
    }
  }
}
