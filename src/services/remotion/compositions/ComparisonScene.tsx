import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { ComparisonParams } from '../types';

export const ComparisonScene: React.FC<ComparisonParams> = ({
  title,
  leftLabel = 'COMMON ASSUMPTION',
  leftPoints = [],
  rightLabel = 'SCIENTIFIC REALITY',
  rightPoints = [],
  accentColor = '#38BDF8',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  const cameraScale = interpolate(frame, [0, durationInFrames], [1.0, 1.04], {
    extrapolateRight: 'clamp',
  });

  const titleSpring = spring({ frame, fps, config: { damping: 14, stiffness: 100 } });
  const leftSpring = spring({ frame: frame - 4, fps, config: { damping: 14, stiffness: 110 } });
  const rightSpring = spring({ frame: frame - 8, fps, config: { damping: 14, stiffness: 110 } });
  const vsSpring = spring({ frame: frame - 12, fps, config: { damping: 12, stiffness: 140 } });

  const defaultLeft = ['Intuitive assumption', 'Unverified heuristic', 'High failure rate'];
  const defaultRight = ['Empirical mechanism', 'Replicated in clinical trials', 'Sustained outcome'];

  const actualLeft = leftPoints && leftPoints.length > 0 ? leftPoints : defaultLeft;
  const actualRight = rightPoints && rightPoints.length > 0 ? rightPoints : defaultRight;

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
        padding: '100px 56px',
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
          background: `radial-gradient(circle, ${accentColor}20 0%, transparent 70%)`,
          filter: 'blur(90px)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      />

      {/* Title */}
      <div
        style={{
          opacity: titleSpring,
          transform: `translateY(${(1 - titleSpring) * 20}px)`,
          textAlign: 'center',
          marginBottom: 36,
          zIndex: 2,
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 22px',
            borderRadius: 9999,
            border: `1px solid ${accentColor}55`,
            backgroundColor: `${accentColor}15`,
            color: accentColor,
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: 16,
          }}
        >
          DIRECT COMPARISON
        </div>
        <h1
          style={{
            fontSize: 52,
            fontWeight: 800,
            color: '#FFFFFF',
            lineHeight: 1.2,
            maxWidth: 900,
            letterSpacing: '-0.02em',
          }}
        >
          {title}
        </h1>
      </div>

      {/* Split Cards Container (Vertical Stack for portrait 9:16) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24,
          width: '100%',
          maxWidth: 900,
          position: 'relative',
          zIndex: 2,
        }}
      >
        {/* Left / Top Card (Myth / Old way) */}
        <div
          style={{
            opacity: leftSpring,
            transform: `translateY(${(1 - leftSpring) * 30}px)`,
            width: '100%',
            backgroundColor: 'rgba(30, 20, 25, 0.75)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 22,
            padding: '28px 36px',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: '#F87171',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>✕</span> {leftLabel}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {actualLeft.map((p: string, idx: number) => (
              <div
                key={idx}
                style={{
                  fontSize: 24,
                  color: '#CBD5E1',
                  lineHeight: 1.4,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                }}
              >
                <span style={{ color: '#EF4444', fontWeight: 900 }}>•</span>
                <span>{p}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Central VS Badge */}
        <div
          style={{
            opacity: vsSpring,
            transform: `scale(${vsSpring})`,
            width: 52,
            height: 52,
            borderRadius: '50%',
            backgroundColor: '#090D16',
            border: `2px solid ${accentColor}`,
            boxShadow: `0 0 16px ${accentColor}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            fontWeight: 900,
            color: accentColor,
            margin: '-12px 0',
            zIndex: 3,
          }}
        >
          VS
        </div>

        {/* Right / Bottom Card (Reality / New way) */}
        <div
          style={{
            opacity: rightSpring,
            transform: `translateY(${(1 - rightSpring) * 30}px)`,
            width: '100%',
            backgroundColor: 'rgba(15, 30, 45, 0.85)',
            border: `2px solid ${accentColor}`,
            boxShadow: `0 0 30px ${accentColor}30`,
            borderRadius: 22,
            padding: '28px 36px',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: accentColor,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>✓</span> {rightLabel}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {actualRight.map((p: string, idx: number) => (
              <div
                key={idx}
                style={{
                  fontSize: 26,
                  fontWeight: 600,
                  color: '#FFFFFF',
                  lineHeight: 1.4,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                }}
              >
                <span style={{ color: accentColor, fontWeight: 900 }}>✔</span>
                <span>{p}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
