import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { DiagramFlowParams } from '../types';

export const DiagramFlowScene: React.FC<DiagramFlowParams> = ({
  title,
  steps = [],
  highlightIndex,
  accentColor = '#38BDF8',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  const cameraScale = interpolate(frame, [0, durationInFrames], [1.0, 1.04], {
    extrapolateRight: 'clamp',
  });

  const titleSpring = spring({ frame, fps, config: { damping: 14, stiffness: 100 } });

  const defaultSteps = [
    { label: 'TRIGGER', description: 'Initial sensory signal or external event' },
    { label: 'MECHANISM', description: 'Neurological routing via the amygdala' },
    { label: 'OUTCOME', description: 'Immediate behavioral response cascade' },
  ];

  const actualSteps = steps && steps.length > 0 ? steps : defaultSteps;

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
          background: `radial-gradient(circle, ${accentColor}20 0%, transparent 70%)`,
          filter: 'blur(90px)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      />

      {/* Header */}
      <div
        style={{
          opacity: titleSpring,
          transform: `translateY(${(1 - titleSpring) * 20}px)`,
          textAlign: 'center',
          marginBottom: 48,
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
          CAUSAL MECHANISM
        </div>
        <h1
          style={{
            fontSize: 54,
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

      {/* Flow Steps (Vertical Stack for 9:16 portrait) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
          width: '100%',
          maxWidth: 860,
          zIndex: 2,
        }}
      >
        {actualSteps.map((step: any, idx: number) => {
          const isHighlighted = highlightIndex === idx || (highlightIndex === undefined && idx === 1);
          const nodeSpring = spring({
            frame: frame - (idx * 8 + 6),
            fps,
            config: { damping: 14, stiffness: 120 },
          });

          return (
            <React.Fragment key={idx}>
              {idx > 0 && (
                <div
                  style={{
                    width: 4,
                    height: 24,
                    backgroundColor: accentColor,
                    opacity: nodeSpring * 0.7,
                    boxShadow: `0 0 10px ${accentColor}`,
                  }}
                />
              )}
              <div
                style={{
                  opacity: nodeSpring,
                  transform: `translateY(${(1 - nodeSpring) * 30}px) scale(${
                    isHighlighted ? 1.03 : 1
                  })`,
                  width: '100%',
                  backgroundColor: isHighlighted
                    ? 'rgba(30, 41, 59, 0.95)'
                    : 'rgba(15, 23, 42, 0.8)',
                  border: isHighlighted
                    ? `2px solid ${accentColor}`
                    : '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: isHighlighted
                    ? `0 0 35px ${accentColor}40, 0 15px 30px rgba(0,0,0,0.6)`
                    : '0 10px 25px rgba(0,0,0,0.4)',
                  borderRadius: 20,
                  padding: '28px 36px',
                  boxSizing: 'border-box',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 24,
                }}
              >
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: '50%',
                    backgroundColor: isHighlighted ? accentColor : 'rgba(255, 255, 255, 0.08)',
                    color: isHighlighted ? '#090D16' : '#94A3B8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 26,
                    fontWeight: 900,
                    flexShrink: 0,
                  }}
                >
                  {idx + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 32,
                      fontWeight: 800,
                      color: isHighlighted ? accentColor : '#FFFFFF',
                      marginBottom: 6,
                    }}
                  >
                    {step.label}
                  </div>
                  {step.description && (
                    <div
                      style={{
                        fontSize: 24,
                        color: '#94A3B8',
                        lineHeight: 1.4,
                      }}
                    >
                      {step.description}
                    </div>
                  )}
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
