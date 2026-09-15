import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { StatisticCardParams } from '../types';

export const StatisticCardScene: React.FC<StatisticCardParams> = ({
  statValue,
  statLabel,
  contextNote,
  trend = 'neutral',
  accentColor = '#10B981',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  // Subtle continuous push-in
  const cameraScale = interpolate(frame, [0, durationInFrames], [1.0, 1.04], {
    extrapolateRight: 'clamp',
  });

  const cardSpring = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 100 },
  });

  // Extract numeric portion if present for counter animation
  const matchNum = (statValue || '').match(/([0-9]+(?:\.[0-9]+)?)/);
  const targetNum = matchNum ? parseFloat(matchNum[1]) : 0;
  const isFloat = matchNum ? matchNum[1].includes('.') : false;

  const currentCount = matchNum
    ? interpolate(frame, [5, Math.min(45, durationInFrames - 10)], [0, targetNum], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 0;

  const displayValue = matchNum
    ? (statValue || '').replace(
        matchNum[1],
        isFloat ? currentCount.toFixed(1) : Math.round(currentCount).toString()
      )
    : statValue;

  // Trend icon/colors
  const trendColor =
    trend === 'up' ? '#10B981' : trend === 'down' ? '#EF4444' : '#38BDF8';
  const trendIcon = trend === 'up' ? '▲' : trend === 'down' ? '▼' : '●';
  const trendText =
    trend === 'up' ? 'SIGNIFICANT INCREASE' : trend === 'down' ? 'SHARP DECLINE' : 'MEASURED METRIC';

  // Animated progress bar
  const progressWidth = interpolate(
    frame,
    [10, Math.min(50, durationInFrames - 5)],
    [0, 100],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );

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

      {/* Main Glass Card */}
      <div
        style={{
          opacity: cardSpring,
          transform: `translateY(${(1 - cardSpring) * 35}px)`,
          width: '100%',
          maxWidth: 920,
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          backdropFilter: 'blur(16px)',
          borderRadius: 28,
          padding: '56px 48px',
          boxSizing: 'border-box',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          zIndex: 2,
        }}
      >
        {/* Trend pill */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 20px',
            borderRadius: 9999,
            backgroundColor: `${trendColor}20`,
            border: `1px solid ${trendColor}55`,
            color: trendColor,
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: '0.08em',
            marginBottom: 28,
          }}
        >
          <span>{trendIcon}</span>
          {trendText}
        </div>

        {/* Massive animated stat value */}
        <div
          style={{
            fontSize: 120,
            fontWeight: 900,
            color: accentColor,
            letterSpacing: '-0.03em',
            lineHeight: 1,
            textShadow: `0 0 50px ${accentColor}66, 0 10px 30px rgba(0,0,0,0.8)`,
            marginBottom: 20,
          }}
        >
          {displayValue}
        </div>

        {/* Progress gauge bar */}
        <div
          style={{
            width: '80%',
            height: 8,
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            borderRadius: 4,
            overflow: 'hidden',
            marginBottom: 28,
          }}
        >
          <div
            style={{
              width: `${progressWidth}%`,
              height: '100%',
              backgroundColor: accentColor,
              boxShadow: `0 0 14px ${accentColor}`,
            }}
          />
        </div>

        {/* Stat label */}
        <div
          style={{
            fontSize: 40,
            fontWeight: 800,
            color: '#FFFFFF',
            lineHeight: 1.3,
            maxWidth: 780,
            marginBottom: 16,
          }}
        >
          {statLabel}
        </div>

        {/* Context Note */}
        {contextNote && (
          <div
            style={{
              fontSize: 26,
              color: '#94A3B8',
              lineHeight: 1.45,
              maxWidth: 720,
            }}
          >
            {contextNote}
          </div>
        )}
      </div>
    </div>
  );
};
