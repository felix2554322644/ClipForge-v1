import React from 'react';
import { Composition } from 'remotion';
import { HookTypographyOverlay } from './compositions/HookTypographyOverlay';
import { SignatureTwistReveal } from './compositions/SignatureTwistReveal';
import { EndCardOverlay } from './compositions/EndCardOverlay';
import { RemotionCaptions } from './compositions/RemotionCaptions';
import { AnyRemotionSceneProps } from './types';

export const DynamicSceneDispatcher: React.FC<AnyRemotionSceneProps> = (props) => {
  switch (props.type) {
    case 'hook_typography':
      return <HookTypographyOverlay {...props} />;
    case 'signature_twist_reveal':
      return <SignatureTwistReveal {...props} />;
    case 'end_card':
      return <EndCardOverlay {...props} />;
    case 'remotion_captions':
      return <RemotionCaptions {...props} />;
    default:
      return (
        <HookTypographyOverlay
          headline={(props as any).headline || 'What If'}
          subheadline={(props as any).subheadline}
        />
      );
  }
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Primary Dynamic Composition */}
      <Composition<any, any>
        id="ClipForgeScene"
        component={DynamicSceneDispatcher}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          type: 'hook_typography',
          headline: 'What If You Could Never Forget Anything',
          subheadline: 'Every sensory detail permanently etched into neural pathways.',
        }}
      />

      {/* Dedicated Hook Typography Composition */}
      <Composition<any, any>
        id="HookTypography"
        component={HookTypographyOverlay}
        durationInFrames={60}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          headline: 'What If Earth Lost Gravity For 5 Seconds',
          subheadline: 'The atmospheric anchor dissolves instantaneously.',
        }}
      />

      {/* Dedicated Signature Reveal Composition */}
      <Composition<any, any>
        id="SignatureTwistReveal"
        component={SignatureTwistReveal}
        durationInFrames={15}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          label: 'THE IMPLICATION',
        }}
      />

      {/* Dedicated End Card Composition */}
      <Composition<any, any>
        id="EndCard"
        component={EndCardOverlay}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          reframeText: 'You do not forget because your brain is weak. You forget so you can think.',
          brandName: 'ClipForge',
        }}
      />

      {/* Dedicated Captions Composition */}
      <Composition<any, any>
        id="CaptionsOverlay"
        component={RemotionCaptions}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          words: [
            { word: 'WHAT', startSeconds: 0.2, endSeconds: 0.6, isEmotionWord: true },
            { word: 'IF', startSeconds: 0.6, endSeconds: 0.9, isEmotionWord: false },
            { word: 'YOU', startSeconds: 0.9, endSeconds: 1.2, isEmotionWord: false },
            { word: 'COULD', startSeconds: 1.2, endSeconds: 1.5, isEmotionWord: false },
            { word: 'NEVER', startSeconds: 1.5, endSeconds: 1.9, isEmotionWord: true },
            { word: 'FORGET', startSeconds: 1.9, endSeconds: 2.4, isEmotionWord: true },
          ],
        }}
      />
    </>
  );
};
