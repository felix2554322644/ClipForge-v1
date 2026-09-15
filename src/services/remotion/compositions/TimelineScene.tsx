import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { TimelineParams } from '../types';

export const TimelineScene: React.FC<TimelineParams> = ({
  title,
  events = [],
  accentColor = '#F5A623',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  const cameraScale = interpolate(frame, [0, durationInFrames], [1.0, 1.04], {
    extrapolateRight: 'clamp',
  });

  const titleSpring = spring({ frame, fps, config: { damping: 14, stiffness: 100 } });

  const defaultEvents = [
    { time: '1970', title: 'The Initial Discovery', description: 'Early laboratory trials establish the baseline.' },
    { time: '1995', title: 'Paradigm Shift', description: 'Breakthrough imaging reveals neuroplastic adaptation.' },
    { time: 'PRESENT', title: 'Global Consensus', description: 'Empirical replication confirms the fundamental rule.' },
  ];

  const actualEvents = events && events.length > 0 ? events : defaultEvents;

  // Timeline vertical line drawing progression
  const lineProgress = interpolate(frame, [5, Math.min(50, durationInFrames - 5)], [0, 100], {
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
          width: 700,
          height: 700,
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
          marginBottom: 44,
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
          HISTORICAL CHRONOLOGY
        </div>
        <h1
          style={{
            fontSize: 54,
            fontWeight: 800,
            color: '#FFFFFF',
            lineHeight: 1.2,
            letterSpacing: '-0.02em',
          }}
        >
          {title}
        </h1>
      </div>

      {/* Timeline track container */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 860,
          display: 'flex',
          flexDirection: 'column',
          gap: 32,
          paddingLeft: 40,
          boxSizing: 'border-box',
          zIndex: 2,
        }}
      >
        {/* Background track line */}
        <div
          style={{
            position: 'absolute',
            left: 20,
            top: 24,
            bottom: 24,
            width: 4,
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            borderRadius: 2,
          }}
        />

        {/* Animated fill track line */}
        <div
          style={{
            position: 'absolute',
            left: 20,
            top: 24,
            height: `${lineProgress}%`,
            width: 4,
            backgroundColor: accentColor,
            boxShadow: `0 0 12px ${accentColor}`,
            borderRadius: 2,
          }}
        />

        {actualEvents.map((evt, idx) => {
          const itemSpring = spring({
            frame: frame - (idx * 10 + 8),
            fps,
            config: { damping: 14, stiffness: 120 },
          });

          return (
            <div
              key={idx}
              style={{
                opacity: itemSpring,
                transform: `translateX(${(1 - itemSpring) * 30}px)`,
                position: 'relative',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 24,
              }}
            >
              {/* Dot node */}
              <div
                style={{
                  position: 'absolute',
                  left: -28,
                  top: 8,
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  backgroundColor: accentColor,
                  border: '4px solid #090D16',
                  boxShadow: `0 0 14px ${accentColor}`,
                }}
              />

              {/* Event card */}
              <div
                style={{
                  flex: 1,
                  backgroundColor: 'rgba(15, 23, 42, 0.85)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 20,
                  padding: '24px 32px',
                  boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
                }}
              >
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: accentColor,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    marginBottom: 6,
                  }}
                >
                  {(evt as any).time || (evt as any).yearOrTime}
                </div>
                <div
                  style={{
                    fontSize: 32,
                    fontWeight: 800,
                    color: '#FFFFFF',
                    marginBottom: 8,
                  }}
                >
                  {(evt as any).title || (evt as any).label}
                </div>
                {evt.description && (
                  <div
                    style={{
                      fontSize: 24,
                      color: '#94A3B8',
                      lineHeight: 1.4,
                    }}
                  >
                    {evt.description}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
