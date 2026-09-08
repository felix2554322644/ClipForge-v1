export type MotionType = 'zoom_in' | 'zoom_out' | 'static';

export interface MotionConfig {
  type: MotionType;
  startZoom: number;
  endZoom: number;
  duration: number;
}

export class MotionGenerator {
  public generateMotionFilter(
    motion: MotionConfig,
    width: number,
    height: number,
    fps: number = 30
  ): string {
    if (motion.type === 'static' || motion.duration <= 0) {
      return '';
    }

    const totalFrames = Math.max(1, Math.round(motion.duration * fps));
    const startZ = motion.startZoom || (motion.type === 'zoom_in' ? 1.0 : 1.12);
    const endZ = motion.endZoom || (motion.type === 'zoom_in' ? 1.12 : 1.0);

    // Zoom expression in FFmpeg zoompan filter
    // zoompan=z='min(max(zoom,1.0),1.15)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=WxH:fps=fps
    const zoomStep = ((endZ - startZ) / totalFrames).toFixed(6);
    const zoomExpr = motion.type === 'zoom_in'
      ? `'min(${startZ}+(${endZ}-${startZ})*on/${totalFrames},${endZ})'`
      : `'max(${startZ}-(${startZ}-${endZ})*on/${totalFrames},${endZ})'`;

    return `zoompan=z=${zoomExpr}:d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${fps}`;
  }
}
