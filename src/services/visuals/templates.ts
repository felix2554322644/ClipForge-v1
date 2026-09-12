import { CustomSceneParams, RenderSceneOptions } from './types';

export function generateSceneHtml(options: RenderSceneOptions): string {
  const { sceneParams, format, durationSeconds } = options;
  const isVertical = format === 'short';
  const width = isVertical ? 1080 : 1920;
  const height = isVertical ? 1920 : 1080;
  const accent = sceneParams.accentColor || '#F5A623';

  const innerContent = renderSceneContent(sceneParams);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>ClipForge Visual Engine - ${sceneParams.type}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: ${width}px;
      height: ${height}px;
      background: linear-gradient(135deg, #090D16 0%, #121826 100%);
      color: #F8FAFC;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      position: relative;
    }
    .safe-area {
      width: 100%;
      height: 100%;
      padding: ${isVertical ? '180px 72px' : '96px 128px'};
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      position: relative;
      z-index: 2;
    }
    .background-grid {
      position: absolute;
      top: 0; left: 0; width: 100%; height: 100%;
      background-image: radial-gradient(rgba(245, 166, 35, 0.08) 1px, transparent 1px);
      background-size: 48px 48px;
      z-index: 1;
      opacity: 0.6;
    }
    .ambient-glow {
      position: absolute;
      width: 600px;
      height: 600px;
      background: radial-gradient(circle, ${accent}22 0%, transparent 70%);
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 1;
      filter: blur(80px);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 18px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 9999px;
      font-size: ${isVertical ? '22px' : '18px'};
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: ${accent};
      margin-bottom: 24px;
    }
    h1 {
      font-size: ${isVertical ? '64px' : '56px'};
      font-weight: 800;
      line-height: 1.15;
      text-align: center;
      margin-bottom: 20px;
      letter-spacing: -0.02em;
    }
    p {
      font-size: ${isVertical ? '32px' : '26px'};
      line-height: 1.5;
      color: #94A3B8;
      text-align: center;
      max-width: ${isVertical ? '900px' : '1200px'};
    }
    .card {
      background: rgba(18, 24, 38, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 24px;
      padding: ${isVertical ? '48px' : '36px'};
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      width: 100%;
      max-width: ${isVertical ? '920px' : '1300px'};
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
    }
    .accent-bar {
      position: absolute;
      top: 0;
      left: 32px;
      right: 32px;
      height: 4px;
      background: linear-gradient(90deg, transparent, ${accent}, transparent);
      border-radius: 2px;
    }
    .timeline-container {
      display: flex;
      flex-direction: column;
      gap: 24px;
      width: 100%;
      margin-top: 20px;
    }
    .timeline-item {
      display: flex;
      align-items: center;
      gap: 20px;
      background: rgba(255, 255, 255, 0.03);
      padding: 20px 24px;
      border-radius: 16px;
      border-left: 4px solid ${accent};
    }
    .comparison-grid {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 32px;
      width: 100%;
      align-items: center;
      margin-top: 24px;
    }
    .comparison-box {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 20px;
      padding: 32px;
      text-align: center;
    }
    .vs-badge {
      font-weight: 900;
      font-size: 28px;
      color: ${accent};
      background: rgba(245, 166, 35, 0.1);
      width: 64px;
      height: 64px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid ${accent}44;
    }
  </style>
</head>
<body>
  <div class="background-grid"></div>
  <div class="ambient-glow"></div>
  <div class="safe-area">
    ${innerContent}
  </div>
</body>
</html>
  `.trim();
}

function renderSceneContent(params: CustomSceneParams): string {
  const accent = params.accentColor || '#F5A623';

  switch (params.type) {
    case 'kinetic_typography': {
      const headlineParts = params.headline.split(params.emphasisWord || '');
      return `
        <div class="badge">ClipForge Kinetic</div>
        <h1>
          ${headlineParts[0]}
          <span style="color: ${accent}; text-shadow: 0 0 30px ${accent}66;">${params.emphasisWord || ''}</span>
          ${headlineParts[1] || ''}
        </h1>
        ${params.subtitle ? `<p>${params.subtitle}</p>` : ''}
      `;
    }

    case 'statistic_card': {
      return `
        <div class="card">
          <div class="accent-bar"></div>
          <div class="badge">${params.subtitle || 'Key Metric'}</div>
          <div style="font-size: ${params.statValue.length > 6 ? '80px' : '110px'}; font-weight: 900; color: ${accent}; margin: 24px 0; letter-spacing: -0.03em;">
            ${params.statValue}
          </div>
          <h2 style="font-size: 36px; font-weight: 700; margin-bottom: 16px; text-align: center;">${params.statLabel}</h2>
          ${params.contextNote ? `<p>${params.contextNote}</p>` : ''}
        </div>
      `;
    }

    case 'timeline': {
      const eventsHtml = params.events
        .map(
          (ev, idx) => `
        <div class="timeline-item" style="${ev.active ? `background: rgba(245, 166, 35, 0.08); border-left-color: ${accent};` : ''}">
          <div style="font-size: 20px; font-weight: 800; color: ${accent}; min-width: 100px;">${ev.yearOrTime}</div>
          <div>
            <div style="font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 4px;">${ev.label}</div>
            ${ev.description ? `<div style="font-size: 16px; color: #94A3B8;">${ev.description}</div>` : ''}
          </div>
        </div>
      `
        )
        .join('');

      return `
        <div class="card" style="align-items: flex-start;">
          <div class="accent-bar"></div>
          <div class="badge">${params.title || 'Evolution Timeline'}</div>
          <div class="timeline-container">
            ${eventsHtml}
          </div>
        </div>
      `;
    }

    case 'comparison': {
      return `
        <div class="card">
          <div class="accent-bar"></div>
          <div class="badge">${params.title || 'Comparative Analysis'}</div>
          <div class="comparison-grid">
            <div class="comparison-box">
              <div style="font-size: 24px; font-weight: 700; color: #fff; margin-bottom: 16px;">${params.leftLabel}</div>
              <div style="font-size: 18px; color: #94A3B8; line-height: 1.6;">${params.leftText}</div>
            </div>
            <div class="vs-badge">${params.versusText || 'VS'}</div>
            <div class="comparison-box" style="border-color: ${accent}44; background: rgba(245, 166, 35, 0.03);">
              <div style="font-size: 24px; font-weight: 700; color: ${accent}; margin-bottom: 16px;">${params.rightLabel}</div>
              <div style="font-size: 18px; color: #CBD5E1; line-height: 1.6;">${params.rightText}</div>
            </div>
          </div>
        </div>
      `;
    }

    case 'diagram_flow': {
      const nodesHtml = params.nodes
        .map(
          (node, idx) => `
        <div style="display: flex; align-items: center; gap: 16px; background: rgba(255,255,255,0.04); padding: 18px 24px; border-radius: 14px; border: 1px solid ${node.status === 'highlight' ? accent : 'rgba(255,255,255,0.08)'}; width: 100%;">
          <div style="background: ${accent}22; color: ${accent}; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700;">${idx + 1}</div>
          <div style="flex: 1;">
            <div style="font-size: 20px; font-weight: 700; color: #fff;">${node.label}</div>
            ${node.sublabel ? `<div style="font-size: 14px; color: #94A3B8;">${node.sublabel}</div>` : ''}
          </div>
        </div>
      `
        )
        .join('');

      return `
        <div class="card" style="align-items: flex-start;">
          <div class="accent-bar"></div>
          <div class="badge">${params.title || 'System Diagram'}</div>
          <div style="display: flex; flex-direction: column; gap: 14px; width: 100%; margin-top: 16px;">
            ${nodesHtml}
          </div>
        </div>
      `;
    }

    case 'behavioral_psychology': {
      return `
        <div class="card">
          <div class="accent-bar"></div>
          <div class="badge">Behavioral Insight</div>
          <h2 style="font-size: 38px; font-weight: 800; color: #fff; margin: 20px 0; text-align: center;">${params.principleName}</h2>
          <p style="font-size: 22px; color: #E2E8F0; margin-bottom: 24px;">${params.keyTakeaway}</p>
          ${
            params.metricBarPercent !== undefined
              ? `
            <div style="width: 100%; background: rgba(255,255,255,0.08); height: 16px; border-radius: 8px; overflow: hidden; margin-top: 16px;">
              <div style="width: ${params.metricBarPercent}%; background: ${accent}; height: 100%; border-radius: 8px;"></div>
            </div>
            <div style="font-size: 14px; color: #94A3B8; margin-top: 8px; text-align: right;">Impact Strength: ${params.metricBarPercent}%</div>
          `
              : ''
          }
        </div>
      `;
    }

    case 'ui_simulation': {
      return `
        <div class="card" style="padding: 0; overflow: hidden;">
          <div style="background: #1E293B; width: 100%; padding: 14px 20px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.08);">
            <div style="width: 12px; height: 12px; border-radius: 50%; background: #EF4444;"></div>
            <div style="width: 12px; height: 12px; border-radius: 50%; background: #F59E0B;"></div>
            <div style="width: 12px; height: 12px; border-radius: 50%; background: #10B981;"></div>
            <div style="margin-left: 12px; font-size: 14px; font-family: monospace; color: #94A3B8;">${params.windowTitle}</div>
          </div>
          <div style="padding: 40px; width: 100%; font-family: monospace; font-size: 20px; color: #38BDF8; background: #0A0F1D; text-align: left; min-height: 200px; white-space: pre-wrap;">
            ${params.actionCodeOrOutput}
          </div>
        </div>
      `;
    }

    case 'visual_metaphor': {
      return `
        <div class="card">
          <div class="accent-bar"></div>
          <div class="badge">Visual Metaphor</div>
          <h2 style="font-size: 42px; font-weight: 800; color: #fff; margin: 20px 0; text-align: center;">${params.metaphorTitle}</h2>
          <p style="font-size: 22px; color: #CBD5E1; text-align: center;">${params.metaphorDescription}</p>
          ${params.scaleFactor ? `<div style="margin-top: 24px; font-size: 28px; font-weight: 900; color: ${accent};">${params.scaleFactor}</div>` : ''}
        </div>
      `;
    }

    case 'branded_transition': {
      return `
        <div style="text-align: center;">
          <div style="font-size: 18px; font-weight: 700; letter-spacing: 0.2em; color: ${accent}; text-transform: uppercase; margin-bottom: 12px;">${params.brandName}</div>
          <h1 style="font-size: 56px; font-weight: 900; color: #fff; letter-spacing: -0.02em;">${params.sectionTitle}</h1>
        </div>
      `;
    }

    default:
      return `<h1>${(params as any).title || 'ClipForge Custom Visual'}</h1>`;
  }
}
