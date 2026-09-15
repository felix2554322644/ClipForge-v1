import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { KineticTypographyParams } from '../types';

export const KineticTypographyScene: React.FC<KineticTypographyParams> = ({
  headline,
  emphasisWord,
  subtitle,
  accentColor = '#F5A623',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  // Slow continuous subtle push-in
  const cameraScale = interpolate(frame, [0, durationInFrames], [1.0, 1.05], {
    extrapolateRight: 'clamp',
  });

  // Entrance spring for category pill
  const badgeSpring = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 120 },
  });

  // Subtitle entrance spring
  const subSpring = spring({
    frame: frame - 10,
    fps,
    config: { damping: 16, stiffness: 100 },
  });

  const words = (headline || '').split(' ');
  const safeEmphasis = (emphasisWord || '').trim().toLowerCase();

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
      {/* Background ambient lighting */}
      <div
        style={{
          position: 'absolute',
          width: 700,
          height: 700,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${accentColor}25 0%, transparent 70%)`,
          filter: 'blur(90px)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      />

      {/* Grid overlay for depth */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `radial-gradient(rgba(245, 166, 35, 0.08) 1.5px, transparent 1.5px)`,
          backgroundSize: '48px 48px',
          opacity: 0.7,
          pointerEvents: 'none',
        }}
      />

      {/* Category Pill */}
      <div
        style={{
          opacity: badgeSpring,
          transform: `translateY(${(1 - badgeSpring) * 20}px)`,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 24px',
          borderRadius: 9999,
          border: `1px solid ${accentColor}55`,
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          color: accentColor,
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          marginBottom: 36,
          zIndex: 2,
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: accentColor,
            boxShadow: `0 0 12px ${accentColor}`,
          }}
        />
        CORE CONCEPT
      </div>

      {/* Kinetic Headline Words */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '14px 20px',
          maxWidth: 960,
          textAlign: 'center',
          zIndex: 2,
          marginBottom: 40,
        }}
      >
        {words.map((w, idx) => {
          const cleanWord = w.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
          const isEmphasis =
            cleanWord === safeEmphasis ||
            (safeEmphasis.length > 0 && cleanWord.includes(safeEmphasis));

          // Staggered word animation
          const wordSpring = spring({
            frame: frame - (idx * 3 + 2),
            fps,
            config: { damping: 12, stiffness: 140 },
          });

          return (
            <span
              key={idx}
              style={{
                display: 'inline-block',
                opacity: wordSpring,
                transform: `translateY(${(1 - wordSpring) * 28}px) scale(${wordSpring})`,
                fontSize: isEmphasis ? 84 : 68,
                fontWeight: isEmphasis ? 900 : 800,
                color: isEmphasis ? accentColor : '#FFFFFF',
                textShadow: isEmphasis
                  ? `0 0 40px ${accentColor}88, 0 10px 25px rgba(0,0,0,0.8)`
                  : '0 8px 24px rgba(0,0,0,0.6)',
                letterSpacing: '-0.02em',
                lineHeight: 1.15,
              }}
            >
              {w}
            </span>
          );
        })}
      </div>

      {/* Subtitle Card */}
      {subtitle && (
        <div
          style={{
            opacity: subSpring,
            transform: `translateY(${(1 - subSpring) * 25}px)`,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(12px)',
            borderRadius: 20,
            padding: '24px 40px',
            maxWidth: 880,
            textAlign: 'center',
            fontSize: 32,
            lineHeight: 1.45,
            color: '#CBD5E1',
            zIndex: 2,
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
};
