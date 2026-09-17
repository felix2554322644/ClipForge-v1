import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND_BIBLE } from '../../../config/brandBible';

export interface SignatureTwistRevealProps {
  label?: string;
}

export const SignatureTwistReveal: React.FC<SignatureTwistRevealProps> = ({
  label = 'THE IMPLICATION',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 10-frame flash frame signature transition
  const flashOpacity = interpolate(
    frame,
    [0, 2, 5, 10],
    [0, 0.85, 0.3, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const textOpacity = interpolate(
    frame,
    [1, 4, 8, 12],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const scale = interpolate(
    frame,
    [0, 12],
    [0.92, 1.08],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    >
      {/* Signature White/Amber Flash */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: '#FFFFFF',
          opacity: flashOpacity,
        }}
      />
      {/* Signature Graphic Sub-text */}
      <div
        style={{
          position: 'absolute',
          top: '38%',
          left: 0,
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          opacity: textOpacity,
          transform: `scale(${scale})`,
        }}
      >
        <span
          style={{
            backgroundColor: BRAND_BIBLE.colors.brandAccent,
            color: '#FFFFFF',
            fontFamily: BRAND_BIBLE.typography.bodyFont,
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: '0.18em',
            padding: '10px 28px',
            borderRadius: 999,
            boxShadow: '0 8px 32px rgba(255, 87, 34, 0.6)',
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
};
