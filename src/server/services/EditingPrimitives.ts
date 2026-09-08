export interface CropCoordinates {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ReframingResult {
  scaleWidth: number;
  scaleHeight: number;
  cropX: number;
  cropY: number;
  filterString: string;
}

export class EditingPrimitives {
  /**
   * Computes center crop coordinates to reframe any input video into target canvas
   * (e.g. 1080x1920 or 540x960 9:16) with zero stretching and zero letterboxing.
   */
  public static computeVerticalReframing(
    sourceWidth: number,
    sourceHeight: number,
    targetWidth: number,
    targetHeight: number
  ): ReframingResult {
    const sourceAspect = sourceWidth / sourceHeight;
    const targetAspect = targetWidth / targetHeight;

    let scaleW: number;
    let scaleH: number;
    let cropX = 0;
    let cropY = 0;

    if (sourceAspect >= targetAspect) {
      // Source is wider than target (e.g. 16:9 landscape -> 9:16 vertical)
      // Scale height to match target height, crop excess width from center
      scaleH = targetHeight;
      scaleW = Math.round(sourceWidth * (targetHeight / sourceHeight));
      // Ensure even dimensions for h264
      if (scaleW % 2 !== 0) scaleW += 1;
      cropX = Math.round((scaleW - targetWidth) / 2);
    } else {
      // Source is narrower than target
      scaleW = targetWidth;
      scaleH = Math.round(sourceHeight * (targetWidth / sourceWidth));
      if (scaleH % 2 !== 0) scaleH += 1;
      cropY = Math.round((scaleH - targetHeight) / 2);
    }

    const filterString = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}`;

    return {
      scaleWidth: scaleW,
      scaleHeight: scaleH,
      cropX,
      cropY,
      filterString,
    };
  }

  /**
   * Generates a subtle retention-oriented zoom motion (slow punch-in or punch-out)
   * that keeps the viewer visually stimulated without causing motion sickness.
   */
  public static buildZoomFilter(
    motionType: 'slow_zoom_in' | 'slow_zoom_out' | 'static',
    targetWidth: number,
    targetHeight: number,
    durationSec: number,
    fps = 30
  ): string {
    if (motionType === 'static' || durationSec <= 0) {
      return `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},setsar=1`;
    }

    const totalFrames = Math.max(1, Math.round(durationSec * fps));

    if (motionType === 'slow_zoom_in') {
      // Scales up from 100% to 108% over the duration of the clip
      return `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},scale='${targetWidth}*(1+0.08*n/${totalFrames})':'${targetHeight}*(1+0.08*n/${totalFrames})':eval=frame,crop=${targetWidth}:${targetHeight},setsar=1`;
    } else {
      // Scales down from 108% to 100%
      return `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},scale='${targetWidth}*(1.08-0.08*n/${totalFrames})':'${targetHeight}*(1.08-0.08*n/${totalFrames})':eval=frame,crop=${targetWidth}:${targetHeight},setsar=1`;
    }
  }
}
