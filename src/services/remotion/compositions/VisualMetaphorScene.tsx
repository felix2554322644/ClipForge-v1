import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { VisualMetaphorParams } from '../types';

export const VisualMetaphorScene: React.FC<VisualMetaphorParams> = ({
  concept,
  metaphorDescription,
  accentColor = '#8B5CF6',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  const cameraScale = interpolate(frame, [0, durationInFrames], [1.0, 1.05], {
    extrapolateRight: 'clamp',
  });

  const cardSpring = spring({ frame, fps, config: { damping: 14, stiffness: 100 } });

  // Rotating concentric rings for visual metaphor animation
  const ringRotation = interpolate(frame, [0, durationInFrames], [0, 45]);
  const pulseScale = interpolate(frame, [0, 15, 30, 45, 60], [1, 1.08, 1, 1.08, 1], {
    extrapolateRight: 'clamp',
  });

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
        padding: '100px 64px',
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

      {/* Animated Visual Metaphor SVG Graphic */}
      <div
        style={{
          width: 320,
          height: 320,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 48,
          transform: `scale(${pulseScale})`,
          zIndex: 2,
        }}
      >
        {/* Outer Ring */}
        <div
          style={{
            position: 'absolute',
            width: 300,
            height: 300,
            borderRadius: '50%',
            border: `2px dashed ${accentColor}66`,
            transform: `rotate(${ringRotation}deg)`,
          }}
        />

        {/* Middle Ring */}
        <div
          style={{
            position: 'absolute',
            width: 210,
            height: 210,
            borderRadius: '50%',
            border: `2px solid ${accentColor}AA`,
            transform: `rotate(${-ringRotation * 1.5}deg)`,
            boxShadow: `0 0 20px ${accentColor}44`,
          }}
        />

        {/* Inner Glowing Core */}
        <div
          style={{
            width: 100,
            height: 100,
            borderRadius: '50%',
            backgroundColor: accentColor,
            boxShadow: `0 0 50px ${accentColor}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#090D16',
            fontSize: 44,
            fontWeight: 900,
          }}
        >
          ✦
        </div>
      </div>

      {/* Concept Card */}
      <div
        style={{
          opacity: cardSpring,
          transform: `translateY(${(1 - cardSpring) * 35}px)`,
          width: '100%',
          maxWidth: 900,
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          backdropFilter: 'blur(16px)',
          borderRadius: 28,
          padding: '44px 48px',
          boxSizing: 'border-box',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          zIndex: 2,
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 20px',
            borderRadius: 9999,
            backgroundColor: `${accentColor}20`,
            border: `1px solid ${accentColor}55`,
            color: accentColor,
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: '0.08em',
            marginBottom: 20,
          }}
        >
          VISUAL METAPHOR
        </div>

        <h1
          style={{
            fontSize: 56,
            fontWeight: 900,
            color: '#FFFFFF',
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
            marginBottom: 20,
          }}
        >
          {concept}
        </h1>

        <div
          style={{
            fontSize: 28,
            color: '#94A3B8',
            lineHeight: 1.5,
            maxWidth: 780,
          }}
        >
          {metaphorDescription}
        </div>
      </div>
    </div>
  );
};
