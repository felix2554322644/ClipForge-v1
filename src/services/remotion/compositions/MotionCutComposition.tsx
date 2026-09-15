import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring, Img, Video } from 'remotion';
import { MotionCutParams } from '../types';

export const MotionCutComposition: React.FC<MotionCutParams> = ({
  videoSourcePath,
  imageSourcePath,
  headline,
  motionEffect = 'push_in',
  cropMode = 'standard',
  patternInterrupt,
  captionTreatment,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  // Determine base scale from cropMode
  const baseScale = cropMode === 'punch_in' ? 1.25 : cropMode === 'tight' ? 1.15 : 1.0;

  // Compute motion transformation
  let scale = baseScale;
  let translateX = 0;
  let translateY = 0;

  if (motionEffect === 'push_in') {
    scale = interpolate(frame, [0, durationInFrames], [baseScale, baseScale * 1.12], {
      extrapolateRight: 'clamp',
    });
  } else if (motionEffect === 'pull_out') {
    scale = interpolate(frame, [0, durationInFrames], [baseScale * 1.12, baseScale], {
      extrapolateRight: 'clamp',
    });
  } else if (motionEffect === 'punch_in') {
    // Immediate punch at frame 1
    scale = baseScale * 1.25;
  } else if (motionEffect === 'pan_left') {
    translateX = interpolate(frame, [0, durationInFrames], [30, -30], {
      extrapolateRight: 'clamp',
    });
  } else if (motionEffect === 'pan_right') {
    translateX = interpolate(frame, [0, durationInFrames], [-30, 30], {
      extrapolateRight: 'clamp',
    });
  } else if (motionEffect === 'tilt_up') {
    translateY = interpolate(frame, [0, durationInFrames], [40, -40], {
      extrapolateRight: 'clamp',
    });
  } else if (motionEffect === 'tilt_down') {
    translateY = interpolate(frame, [0, durationInFrames], [-40, 40], {
      extrapolateRight: 'clamp',
    });
  } else if (motionEffect === 'zoom_in') {
    scale = interpolate(frame, [0, durationInFrames], [baseScale, baseScale * 1.2], {
      extrapolateRight: 'clamp',
    });
  } else if (motionEffect === 'zoom_out') {
    scale = interpolate(frame, [0, durationInFrames], [baseScale * 1.2, baseScale], {
      extrapolateRight: 'clamp',
    });
  }

  // Pattern interrupt effect
  let interruptScale = 1.0;
  let showInterruptPill = false;
  if (patternInterrupt) {
    if (patternInterrupt.type === 'punch_in' && frame >= 12 && frame <= 24) {
      interruptScale = patternInterrupt.intensity === 'bold' ? 1.15 : 1.08;
    }
    if (patternInterrupt.type === 'statistic_callout' || patternInterrupt.type === 'text_flash') {
      showInterruptPill = frame >= 8 && frame <= Math.min(48, durationInFrames - 4);
    }
  }

  const headlineSpring = spring({ frame, fps, config: { damping: 14, stiffness: 100 } });

  return (
    <div
      style={{
        width,
        height,
        backgroundColor: '#090D16',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Background Media Container with motion transform */}
      <div
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          inset: 0,
          transform: `scale(${scale * interruptScale}) translate(${translateX}px, ${translateY}px)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {videoSourcePath ? (
          <Video
            src={videoSourcePath}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : imageSourcePath ? (
          <Img
            src={imageSourcePath}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              background: 'radial-gradient(ellipse at center, #1E293B 0%, #090D16 100%)',
            }}
          />
        )}
      </div>

      {/* Subtle vignette darkening */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          boxShadow: 'inset 0 0 120px rgba(0, 0, 0, 0.7)',
          pointerEvents: 'none',
        }}
      />

      {/* Pattern Interrupt Badge */}
      {showInterruptPill && patternInterrupt && (
        <div
          style={{
            position: 'absolute',
            top: 140,
            zIndex: 10,
            backgroundColor: 'rgba(245, 166, 35, 0.95)',
            color: '#090D16',
            padding: '12px 28px',
            borderRadius: 9999,
            fontSize: 24,
            fontWeight: 900,
            letterSpacing: '0.08em',
            boxShadow: '0 10px 30px rgba(245, 166, 35, 0.4)',
            textTransform: 'uppercase',
          }}
        >
          {patternInterrupt.label || 'CRITICAL MOMENT'}
        </div>
      )}

      {/* Optional Headline Overlay */}
      {headline && (
        <div
          style={{
            position: 'absolute',
            bottom: 220,
            maxWidth: 880,
            textAlign: 'center',
            opacity: headlineSpring,
            transform: `translateY(${(1 - headlineSpring) * 20}px)`,
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(12px)',
            borderRadius: 20,
            padding: '24px 36px',
            color: '#FFFFFF',
            fontSize: 36,
            fontWeight: 800,
            lineHeight: 1.3,
            zIndex: 5,
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
          }}
        >
          {headline}
        </div>
      )}

      {/* Caption Treatment */}
      {captionTreatment && (
        <div
          style={{
            position: 'absolute',
            bottom: 120,
            maxWidth: 800,
            textAlign: 'center',
            fontSize: 28,
            fontWeight: 700,
            color: '#F8FAFC',
            textShadow: '0 2px 10px rgba(0,0,0,0.9)',
            zIndex: 6,
          }}
        >
          {captionTreatment}
        </div>
      )}
    </div>
  );
};
