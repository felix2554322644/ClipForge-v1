import React from 'react';
import { Composition } from 'remotion';
import { KineticTypographyScene } from './compositions/KineticTypographyScene';
import { StatisticCardScene } from './compositions/StatisticCardScene';
import { DiagramFlowScene } from './compositions/DiagramFlowScene';
import { TimelineScene } from './compositions/TimelineScene';
import { ComparisonScene } from './compositions/ComparisonScene';
import { VisualMetaphorScene } from './compositions/VisualMetaphorScene';
import { BehavioralPsychologyScene } from './compositions/BehavioralPsychologyScene';
import { UiSimulationScene } from './compositions/UiSimulationScene';
import { BrandedTransitionScene } from './compositions/BrandedTransitionScene';
import { MotionCutComposition } from './compositions/MotionCutComposition';
import { AnyRemotionSceneProps } from './types';

export const DynamicSceneDispatcher: React.FC<AnyRemotionSceneProps> = (props) => {
  const type = props.type;

  switch (type) {
    case 'kinetic_typography':
      return <KineticTypographyScene {...(props as any)} />;
    case 'statistic_card':
      return <StatisticCardScene {...(props as any)} />;
    case 'diagram_flow':
      return <DiagramFlowScene {...(props as any)} />;
    case 'timeline':
      return <TimelineScene {...(props as any)} />;
    case 'comparison':
      return <ComparisonScene {...(props as any)} />;
    case 'visual_metaphor':
      return <VisualMetaphorScene {...(props as any)} />;
    case 'behavioral_psychology':
      return <BehavioralPsychologyScene {...(props as any)} />;
    case 'ui_simulation':
      return <UiSimulationScene {...(props as any)} />;
    case 'branded_transition':
      return <BrandedTransitionScene {...(props as any)} />;
    case 'motion_cut':
      return <MotionCutComposition {...(props as any)} />;
    default:
      return (
        <KineticTypographyScene
          type="kinetic_typography"
          headline={(props as any).title || (props as any).headline || 'ClipForge'}
          subtitle={(props as any).subtitle || (props as any).description}
          emphasisWord={(props as any).emphasisWord}
          accentColor={(props as any).accentColor || '#F5A623'}
        />
      );
  }
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Primary dynamic scene composition */}
      <Composition<any, any>
        id="ClipForgeScene"
        component={DynamicSceneDispatcher}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          type: 'kinetic_typography',
          headline: 'Neuroplastic Adaptation Under Pressure',
          emphasisWord: 'Adaptation',
          subtitle: 'Empirical replication proves synaptic density increases within 72 hours.',
          accentColor: '#F5A623',
        }}
        calculateMetadata={({ props }: { props: any }) => {
          return {
            durationInFrames: Number(props?.durationInFrames) || 90,
            fps: Number(props?.fps) || 30,
            width: Number(props?.width) || 1080,
            height: Number(props?.height) || 1920,
          };
        }}
      />

      {/* Individual dedicated compositions */}
      <Composition<any, any>
        id="KineticTypography"
        component={KineticTypographyScene}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          type: 'kinetic_typography',
          headline: 'Deep Focus Changes Neural Wiring',
          emphasisWord: 'Wiring',
          subtitle: 'Consistent stimulus creates myelin sheaths around high-traffic axons.',
          accentColor: '#F5A623',
        }}
      />

      <Composition<any, any>
        id="StatisticCard"
        component={StatisticCardScene}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          type: 'statistic_card',
          statValue: '78%',
          statLabel: 'Retention Rate Under Spaced Repetition',
          contextNote: 'Compared to 18% with traditional single-session cramming.',
          trend: 'up',
          accentColor: '#10B981',
        }}
      />

      <Composition<any, any>
        id="DiagramFlow"
        component={DiagramFlowScene}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          type: 'diagram_flow',
          title: 'The Dopamine Prediction Loop',
          steps: [
            { label: 'CUE', description: 'Environmental context activates expectation' },
            { label: 'SPIKE', description: 'Phasic dopamine release precedes action' },
            { label: 'REINFORCE', description: 'Prediction error calibration hardens habit' },
          ],
          highlightIndex: 1,
          accentColor: '#38BDF8',
        }}
      />

      <Composition<any, any>
        id="Timeline"
        component={TimelineScene}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          type: 'timeline',
          title: 'Evolution of Cognitive Protocols',
          events: [
            { time: '1906', title: 'Santiago Ramón y Cajal', description: 'The Neuron Doctrine is validated.' },
            { time: '1949', title: 'Donald Hebb', description: 'Neurons that fire together wire together.' },
            { time: 'TODAY', title: 'Connectomics', description: 'Synaptic reconstruction at nanoscale.' },
          ],
          accentColor: '#F5A623',
        }}
      />

      <Composition<any, any>
        id="Comparison"
        component={ComparisonScene}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          type: 'comparison',
          title: 'Working Memory vs Long-Term Storage',
          leftLabel: 'WORKING MEMORY',
          leftPoints: ['Limited to 4-7 chunks', 'Decays in seconds', 'Easily overloaded'],
          rightLabel: 'LONG-TERM MEMORY',
          rightPoints: ['Near-infinite capacity', 'Chemically consolidated', 'Durable across decades'],
          accentColor: '#38BDF8',
        }}
      />

      <Composition<any, any>
        id="VisualMetaphor"
        component={VisualMetaphorScene}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          type: 'visual_metaphor',
          concept: 'The Flywheel Effect',
          metaphorDescription: 'Each push builds invisible momentum until breakthrough velocity occurs effortlessly.',
          accentColor: '#8B5CF6',
        }}
      />

      <Composition<any, any>
        id="BehavioralPsychology"
        component={BehavioralPsychologyScene}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          type: 'behavioral_psychology',
          principleName: 'Hyperbolic Discounting',
          biasOrMechanism: 'The brain undervalues future rewards exponentially compared to immediate gratification.',
          takeaway: 'Anchor future consequences to immediate sensory feedback loops.',
          accentColor: '#EC4899',
        }}
      />

      <Composition<any, any>
        id="UiSimulation"
        component={UiSimulationScene}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          type: 'ui_simulation',
          windowTitle: 'ClipForge Neural Core',
          queryOrCommand: 'clipforge --analyze-attention-spans',
          actionCodeOrOutput: '✓ Retention peak predicted at frame 142 (94.2% engagement probability)',
          accentColor: '#06B6D4',
        }}
      />

      <Composition<any, any>
        id="BrandedTransition"
        component={BrandedTransitionScene}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          type: 'branded_transition',
          channelName: 'CLIPFORGE',
          topicTitle: 'Next Generation Visual Pipeline',
          tagline: 'Deterministic Motion & AI Automation',
          accentColor: '#F5A623',
        }}
      />

      <Composition<any, any>
        id="MotionCut"
        component={MotionCutComposition}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          type: 'motion_cut',
          motionEffect: 'push_in',
          cropMode: 'standard',
          headline: 'High-Impact Key Takeaway',
        }}
      />
    </>
  );
};
