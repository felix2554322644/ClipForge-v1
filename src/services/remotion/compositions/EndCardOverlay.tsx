import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND_BIBLE } from '../../../config/brandBible';

export interface EndCardOverlayProps {
  reframeText: string;
  brandName?: string;
}

export const EndCardOverlay: React.FC<EndCardOverlayProps> = ({
  reframeText,
  brandName = BRAND_BIBLE.brandName,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrance = spring({
    frame,
    fps,
    config: {
      damping: 18,
      stiffness: 80,
    },
  });

  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        alignItems: 'center',
        padding: '0 54px 140px 54px',
        pointerEvents: 'none',
        opacity,
      }}
    >
      <div
        style={{
          backgroundColor: 'rgba(14, 15, 18, 0.85)',
          backdropFilter: 'blur(16px)',
          borderRadius: 20,
          padding: '28px 36px',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
          maxWidth: '960px',
          textAlign: 'center',
          transform: `scale(${interpolate(entrance, [0, 1], [0.95, 1])})`,
        }}
      >
        <p
          style={{
            color: '#FFFFFF',
            fontFamily: BRAND_BIBLE.typography.headlineFont,
            fontSize: 34,
            fontWeight: 700,
            lineHeight: 1.3,
            margin: '0 0 16px 0',
          }}
        >
          {reframeText}
        </p>
        <div
          style={{
            color: BRAND_BIBLE.colors.brandAccent,
            fontFamily: BRAND_BIBLE.typography.bodyFont,
            fontSize: 20,
            fontWeight: 800,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}
        >
          {brandName}
        </div>
      </div>
    </div>
  );
};
