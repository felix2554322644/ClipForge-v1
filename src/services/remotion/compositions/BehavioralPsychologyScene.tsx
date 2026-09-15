import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { BehavioralPsychologyParams } from '../types';

export const BehavioralPsychologyScene: React.FC<BehavioralPsychologyParams> = ({
  principleName,
  biasOrMechanism,
  takeaway,
  accentColor = '#EC4899',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  const cameraScale = interpolate(frame, [0, durationInFrames], [1.0, 1.04], {
    extrapolateRight: 'clamp',
  });

  const cardSpring = spring({ frame, fps, config: { damping: 14, stiffness: 100 } });

  // Animated behavioral reaction meter
  const gaugeFill = interpolate(frame, [10, Math.min(45, durationInFrames - 10)], [0, 85], {
    extrapolateLeft: 'clamp',
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
          width: 750,
          height: 750,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${accentColor}25 0%, transparent 70%)`,
          filter: 'blur(90px)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      />

      {/* Main Glass Card */}
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
          padding: '50px 48px',
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
          COGNITIVE MECHANISM
        </div>

        <h1
          style={{
            fontSize: 58,
            fontWeight: 900,
            color: '#FFFFFF',
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
            marginBottom: 16,
          }}
        >
          {principleName}
        </h1>

        <div
          style={{
            fontSize: 28,
            color: '#CBD5E1',
            lineHeight: 1.45,
            maxWidth: 780,
            marginBottom: 32,
          }}
        >
          {biasOrMechanism}
        </div>

        {/* Behavioral Reaction Gauge */}
        <div
          style={{
            width: '85%',
            marginBottom: 32,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 18,
              fontWeight: 700,
              color: '#94A3B8',
              letterSpacing: '0.05em',
            }}
          >
            <span>SUBCONSCIOUS HEURISTIC</span>
            <span style={{ color: accentColor }}>85% ACTIVATION</span>
          </div>
          <div
            style={{
              width: '100%',
              height: 10,
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              borderRadius: 5,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${gaugeFill}%`,
                height: '100%',
                backgroundColor: accentColor,
                boxShadow: `0 0 16px ${accentColor}`,
              }}
            />
          </div>
        </div>

        {/* Key takeaway */}
        {takeaway && (
          <div
            style={{
              backgroundColor: 'rgba(30, 41, 59, 0.8)',
              border: `1px solid ${accentColor}40`,
              borderRadius: 16,
              padding: '20px 28px',
              fontSize: 24,
              fontWeight: 600,
              color: '#F8FAFC',
              lineHeight: 1.4,
              maxWidth: 780,
            }}
          >
            <span style={{ color: accentColor, fontWeight: 800 }}>KEY INSIGHT: </span>
            {takeaway}
          </div>
        )}
      </div>
    </div>
  );
};
