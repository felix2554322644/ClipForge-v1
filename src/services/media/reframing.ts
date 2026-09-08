export interface ReframingResult {
  sourceWidth: number;
  sourceHeight: number;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  scaleFactor: number;
  targetWidth: number;
  targetHeight: number;
  filterString: string; // FFmpeg crop + scale filter snippet
}

export type CropAnchor = 'center' | 'focus_left' | 'focus_right' | 'rule_of_thirds';

export class ReframingService {
  public calculateReframing(
    sourceWidth: number,
    sourceHeight: number,
    targetWidth: number,
    targetHeight: number,
    anchor: CropAnchor = 'center'
  ): ReframingResult {
    if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) {
      throw new Error(`Invalid dimensions for reframing: source(${sourceWidth}x${sourceHeight}), target(${targetWidth}x${targetHeight})`);
    }

    const sourceAspect = sourceWidth / sourceHeight;
    const targetAspect = targetWidth / targetHeight;

    let cropWidth: number;
    let cropHeight: number;
    let cropX: number;
    let cropY: number;

    if (sourceAspect > targetAspect) {
      // Source is wider than target (e.g. landscape 16:9 into vertical 9:16)
      // Crop sides to match target aspect ratio
      cropHeight = sourceHeight;
      cropWidth = Math.round(sourceHeight * targetAspect);

      // Make sure crop width is even for FFmpeg
      if (cropWidth % 2 !== 0) cropWidth--;

      const maxOffset = Math.max(0, sourceWidth - cropWidth);
      if (anchor === 'focus_left') {
        cropX = Math.round(maxOffset * 0.2);
      } else if (anchor === 'focus_right') {
        cropX = Math.round(maxOffset * 0.8);
      } else if (anchor === 'rule_of_thirds') {
        cropX = Math.round(maxOffset * 0.33);
      } else {
        // center
        cropX = Math.round(maxOffset / 2);
      }
      cropY = 0;
    } else if (sourceAspect < targetAspect) {
      // Source is taller than target (rare, e.g. ultra-tall 9:21 into 9:16)
      cropWidth = sourceWidth;
      cropHeight = Math.round(sourceWidth / targetAspect);

      if (cropHeight % 2 !== 0) cropHeight--;

      cropX = 0;
      const maxOffset = Math.max(0, sourceHeight - cropHeight);
      cropY = Math.round(maxOffset / 2);
    } else {
      // Identical aspect ratio
      cropWidth = sourceWidth;
      cropHeight = sourceHeight;
      cropX = 0;
      cropY = 0;
    }

    // Ensure offsets are even
    if (cropX % 2 !== 0) cropX = Math.max(0, cropX - 1);
    if (cropY % 2 !== 0) cropY = Math.max(0, cropY - 1);

    const scaleFactor = Number((targetHeight / cropHeight).toFixed(4));
    // Programmatic filter string: crop=w:h:x:y,scale=tw:th
    const filterString = `crop=${cropWidth}:${cropHeight}:${cropX}:${cropY},scale=${targetWidth}:${targetHeight}`;

    return {
      sourceWidth,
      sourceHeight,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      scaleFactor,
      targetWidth,
      targetHeight,
      filterString,
    };
  }
}
