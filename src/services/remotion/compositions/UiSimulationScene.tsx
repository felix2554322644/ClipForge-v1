import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { UiSimulationParams } from '../types';

export const UiSimulationScene: React.FC<UiSimulationParams> = ({
  windowTitle = 'ClipForge Terminal',
  queryOrCommand,
  actionCodeOrOutput,
  accentColor = '#06B6D4',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  const cameraScale = interpolate(frame, [0, durationInFrames], [1.0, 1.04], {
    extrapolateRight: 'clamp',
  });

  const windowSpring = spring({ frame, fps, config: { damping: 14, stiffness: 100 } });

  // Typewriter effect for command/code
  const fullText = actionCodeOrOutput || queryOrCommand || 'clipforge --execute-analysis';
  const charsToShow = Math.min(
    fullText.length,
    Math.floor(interpolate(frame, [8, Math.min(40, durationInFrames - 10)], [0, fullText.length]))
  );
  const currentText = fullText.slice(0, charsToShow);

  // Blinking cursor
  const showCursor = Math.floor(frame / 6) % 2 === 0;

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

      {/* Terminal Window */}
      <div
        style={{
          opacity: windowSpring,
          transform: `translateY(${(1 - windowSpring) * 35}px)`,
          width: '100%',
          maxWidth: 920,
          backgroundColor: '#0F172A',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 30px 70px rgba(0, 0, 0, 0.7)',
          zIndex: 2,
        }}
      >
        {/* Titlebar */}
        <div
          style={{
            backgroundColor: '#1E293B',
            padding: '16px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          {/* Traffic lights */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: '#EF4444' }} />
            <div style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: '#F59E0B' }} />
            <div style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: '#10B981' }} />
          </div>
          <div
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: 18,
              fontWeight: 600,
              color: '#94A3B8',
              letterSpacing: '0.04em',
              fontFamily: 'monospace',
            }}
          >
            {windowTitle}
          </div>
        </div>

        {/* Content Body */}
        <div
          style={{
            padding: '36px 32px',
            fontFamily: '"JetBrains Mono", Menlo, Monaco, Consolas, monospace',
            fontSize: 26,
            lineHeight: 1.6,
            color: '#E2E8F0',
            minHeight: 280,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {queryOrCommand && (
            <div style={{ color: accentColor, fontWeight: 700 }}>
              <span>$ </span>
              {queryOrCommand}
            </div>
          )}

          <div style={{ color: '#38BDF8', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            <span>&gt; </span>
            {currentText}
            {showCursor && (
              <span
                style={{
                  display: 'inline-block',
                  width: 12,
                  height: 24,
                  backgroundColor: accentColor,
                  marginLeft: 4,
                  verticalAlign: 'middle',
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
