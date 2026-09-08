export interface TrimPrimitive {
  startSec: number;
  durationSec: number;
}

export interface CropPrimitive {
  width: number;
  height: number;
  x: number;
  y: number;
}

export interface ScalePrimitive {
  width: number;
  height: number;
}

export interface FadePrimitive {
  type: 'in' | 'out';
  startSec: number;
  durationSec: number;
}

export class EditingPrimitives {
  public static buildTrimArgs(trim: TrimPrimitive): string[] {
    return ['-ss', trim.startSec.toFixed(3), '-t', trim.durationSec.toFixed(3)];
  }

  public static buildCropFilter(crop: CropPrimitive): string {
    return `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`;
  }

  public static buildScaleFilter(scale: ScalePrimitive): string {
    return `scale=${scale.width}:${scale.height}`;
  }

  public static buildFadeFilter(fade: FadePrimitive): string {
    return `fade=t=${fade.type}:st=${fade.startSec.toFixed(2)}:d=${fade.durationSec.toFixed(2)}`;
  }

  public static buildReframedPipelineFilter(
    crop: CropPrimitive,
    scale: ScalePrimitive,
    fps: number = 30
  ): string {
    return `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${scale.width}:${scale.height},fps=${fps},setsar=1`;
  }
}
