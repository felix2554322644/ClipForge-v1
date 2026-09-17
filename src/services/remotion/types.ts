import { WordTimestamp } from '../../contracts/renderSpec';

export type RemotionSceneType =
  | 'hook_typography'
  | 'signature_twist_reveal'
  | 'end_card'
  | 'remotion_captions';

export interface RemotionBaseProps {
  durationInFrames?: number;
  width?: number;
  height?: number;
  fps?: number;
  accentColor?: string;
}

export interface HookTypographyParams extends RemotionBaseProps {
  type: 'hook_typography';
  headline: string;
  subheadline?: string;
}

export interface SignatureTwistRevealParams extends RemotionBaseProps {
  type: 'signature_twist_reveal';
  label?: string;
}

export interface EndCardParams extends RemotionBaseProps {
  type: 'end_card';
  reframeText: string;
  brandName?: string;
}

export interface RemotionCaptionsParams extends RemotionBaseProps {
  type: 'remotion_captions';
  words: WordTimestamp[];
  position?: 'lower_third' | 'middle_safe';
  adaptiveScrim?: boolean;
}

export type AnyRemotionSceneProps =
  | HookTypographyParams
  | SignatureTwistRevealParams
  | EndCardParams
  | RemotionCaptionsParams;
