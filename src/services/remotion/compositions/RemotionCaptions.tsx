import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND_BIBLE } from '../../../config/brandBible';
import { WordTimestamp } from '../../../contracts/renderSpec';

export interface RemotionCaptionsProps {
  words: WordTimestamp[];
  position?: 'lower_third' | 'middle_safe';
  adaptiveScrim?: boolean;
}

export const RemotionCaptions: React.FC<RemotionCaptionsProps> = ({
  words = [],
  position = 'lower_third',
  adaptiveScrim = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  // Find active cluster of words within +/- 1.2s window
  const activeWordIndex = words.findIndex(
    (w) => currentTime >= w.startSeconds && currentTime <= w.endSeconds
  );

  // Group words into 3-5 word readable clusters
  const clusterSize = 4;
  const currentIdx = activeWordIndex >= 0 ? activeWordIndex : 0;
  const clusterStart = Math.floor(currentIdx / clusterSize) * clusterSize;
  const currentCluster = words.slice(clusterStart, clusterStart + clusterSize);

  if (currentCluster.length === 0) return null;

  const bottomOffset = position === 'middle_safe' ? '40%' : '18%';

  return (
    <div
      style={{
        position: 'absolute',
        bottom: bottomOffset,
        left: 0,
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '0 32px',
        pointerEvents: 'none',
        zIndex: 50,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '12px 14px',
          backgroundColor: adaptiveScrim ? 'rgba(14, 15, 18, 0.65)' : 'transparent',
          backdropFilter: adaptiveScrim ? 'blur(6px)' : 'none',
          padding: '16px 28px',
          borderRadius: 20,
          border: adaptiveScrim ? '1px solid rgba(255, 255, 255, 0.12)' : 'none',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.45)',
          maxWidth: '880px',
        }}
      >
        {currentCluster.map((w, idx) => {
          const isActive = currentTime >= w.startSeconds && currentTime <= w.endSeconds;
          const isPast = currentTime > w.endSeconds;

          const isEmotion = !!w.isEmotionWord;

          return (
            <span
              key={`${w.word}-${w.startSeconds}-${idx}`}
              style={{
                fontFamily: BRAND_BIBLE.typography.captionFont,
                fontSize: isEmotion ? 46 : 42,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: isActive
                  ? isEmotion
                    ? BRAND_BIBLE.colors.brandAccent
                    : '#FFFFFF'
                  : isPast
                  ? '#D1D5DB'
                  : 'rgba(255, 255, 255, 0.45)',
                transform: isActive
                  ? isEmotion
                    ? 'scale(1.12)'
                    : 'scale(1.05)'
                  : 'scale(1.0)',
                transition: 'transform 0.08s ease-out, color 0.08s ease-out',
                textShadow: isActive
                  ? isEmotion
                    ? '0 0 16px rgba(255, 87, 34, 0.8), 0 3px 8px rgba(0,0,0,0.8)'
                    : '0 0 12px rgba(255, 255, 255, 0.6), 0 3px 8px rgba(0,0,0,0.8)'
                  : '0 2px 6px rgba(0,0,0,0.7)',
                display: 'inline-block',
              }}
            >
              {w.word}
            </span>
          );
        })}
      </div>
    </div>
  );
};
