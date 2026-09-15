import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { BrandedTransitionParams } from '../types';

export const BrandedTransitionScene: React.FC<BrandedTransitionParams> = ({
  channelName = 'CLIPFORGE',
  topicTitle,
  tagline,
  accentColor = '#F5A623',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  const cameraScale = interpolate(frame, [0, durationInFrames], [1.0, 1.05], {
    extrapolateRight: 'clamp',
  });

  const logoSpring = spring({ frame, fps, config: { damping: 14, stiffness: 120 } });
  const textSpring = spring({ frame: frame - 6, fps, config: { damping: 14, stiffness: 100 } });

  return (
    <div
      style={{
        width,
        height,
        backgroundColor: '#090D16',
        backgroundImage: 'radial-gradient(ellipse at center, #1E293B 0%, #090D16 100%)',
        color: '#F8FAFC',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '120px 64px',
        boxSizing: 'border-box',
        overflow: 'hidden',
        position: 'relative',
        transform: `scale(${cameraScale})`,
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: 'absolute',
          width: 800,
          height: 800,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${accentColor}25 0%, transparent 70%)`,
          filter: 'blur(90px)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      />

      {/* Brand Icon */}
      <div
        style={{
          opacity: logoSpring,
          transform: `scale(${logoSpring}) translateY(${(1 - logoSpring) * 20}px)`,
          width: 110,
          height: 110,
          borderRadius: 28,
          backgroundColor: accentColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 0 50px ${accentColor}80, 0 15px 35px rgba(0,0,0,0.6)`,
          marginBottom: 32,
          zIndex: 2,
        }}
      >
        <div
          style={{
            width: 0,
            height: 0,
            borderTop: '24px solid transparent',
            borderBottom: '24px solid transparent',
            borderLeft: '40px solid #090D16',
            marginLeft: 8,
          }}
        />
      </div>

      {/* Channel Name */}
      <div
        style={{
          opacity: textSpring,
          transform: `translateY(${(1 - textSpring) * 25}px)`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          zIndex: 2,
        }}
      >
        <div
          style={{
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: '0.25em',
            color: accentColor,
            textTransform: 'uppercase',
            marginBottom: 20,
          }}
        >
          {channelName}
        </div>

        {topicTitle && (
          <h1
            style={{
              fontSize: 64,
              fontWeight: 900,
              color: '#FFFFFF',
              letterSpacing: '-0.02em',
              lineHeight: 1.15,
              maxWidth: 880,
              marginBottom: 16,
            }}
          >
            {topicTitle}
          </h1>
        )}

        {tagline && (
          <div
            style={{
              fontSize: 28,
              color: '#94A3B8',
              lineHeight: 1.4,
              maxWidth: 760,
            }}
          >
            {tagline}
          </div>
        )}
      </div>
    </div>
  );
};
