import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND_BIBLE } from '../../../config/brandBible';

export interface HookTypographyOverlayProps {
  headline: string;
  subheadline?: string;
  durationInSeconds?: number;
}

export const HookTypographyOverlay: React.FC<HookTypographyOverlayProps> = ({
  headline,
  subheadline,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrance = spring({
    frame,
    fps,
    config: {
      damping: 14,
      stiffness: 90,
      mass: 0.8,
    },
  });

  const opacity = interpolate(
    frame,
    [0, 10, fps * 1.8, fps * 2.2],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const translateY = interpolate(entrance, [0, 1], [30, 0]);

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
        justifyContent: 'center',
        alignItems: 'center',
        padding: '0 64px',
        pointerEvents: 'none',
        opacity,
        transform: `translateY(${translateY}px)`,
      }}
    >
      <div
        style={{
          backgroundColor: 'rgba(14, 15, 18, 0.78)',
          backdropFilter: 'blur(12px)',
          borderRadius: 24,
          padding: '36px 44px',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.4)',
          maxWidth: '920px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            color: BRAND_BIBLE.colors.brandAccent,
            fontFamily: BRAND_BIBLE.typography.bodyFont,
            fontSize: 22,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            marginBottom: 14,
          }}
        >
          THOUGHT EXPERIMENT
        </div>
        <h1
          style={{
            color: '#FFFFFF',
            fontFamily: BRAND_BIBLE.typography.headlineFont,
            fontSize: 54,
            lineHeight: 1.15,
            fontWeight: 800,
            margin: 0,
            textShadow: '0 4px 16px rgba(0,0,0,0.6)',
          }}
        >
          {headline}
        </h1>
        {subheadline && (
          <p
            style={{
              color: '#D1D5DB',
              fontFamily: BRAND_BIBLE.typography.bodyFont,
              fontSize: 26,
              marginTop: 16,
              marginBottom: 0,
            }}
          >
            {subheadline}
          </p>
        )}
      </div>
    </div>
  );
};
