export class NarrationPreprocessor {
  private static readonly ORDINALS: Record<string, string> = {
    '1st': 'first',
    '2nd': 'second',
    '3rd': 'third',
    '4th': 'fourth',
    '5th': 'fifth',
    '6th': 'sixth',
    '7th': 'seventh',
    '8th': 'eighth',
    '9th': 'ninth',
    '10th': 'tenth',
    '11th': 'eleventh',
    '12th': 'twelfth',
    '13th': 'thirteenth',
    '14th': 'fourteenth',
    '15th': 'fifteenth',
    '16th': 'sixteenth',
    '17th': 'seventeenth',
    '18th': 'eighteenth',
    '19th': 'nineteenth',
    '20th': 'twentieth',
    '21st': 'twenty-first',
    '22nd': 'twenty-second',
    '23rd': 'twenty-third',
    '24th': 'twenty-fourth',
    '25th': 'twenty-fifth',
    '26th': 'twenty-sixth',
    '27th': 'twenty-seventh',
    '28th': 'twenty-eighth',
    '29th': 'twenty-ninth',
    '30th': 'thirtieth',
    '40th': 'fortieth',
    '50th': 'fiftieth',
    '60th': 'sixtieth',
    '70th': 'seventieth',
    '80th': 'eightieth',
    '90th': 'ninetieth',
    '100th': 'one hundredth',
  };

  /**
   * Deterministically normalizes narration text for natural, smooth Piper TTS delivery.
   * Expands abbreviations, currencies, percentages, symbols, technical terms, and ordinals,
   * while eliminating unnatural pauses caused by awkward punctuation.
   */
  static normalizeText(text: string): string {
    if (!text || typeof text !== 'string') {
      return '';
    }

    let s = text.trim();

    // 1. Unicode quotes, dashes, and markdown formatting cleanup
    s = s.replace(/[\u2018\u2019]/g, "'"); // Curly single quotes
    s = s.replace(/[\u201C\u201D\u00AB\u00BB]/g, '"'); // Curly/guillemet double quotes
    s = s.replace(/[\u2013\u2014]/g, ', '); // En-dash & em-dash -> conversational pause
    s = s.replace(/--+/g, ', ');
    s = s.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1'); // Markdown bold/italic
    s = s.replace(/_{1,3}([^_]+)_{1,3}/g, '$1'); // Markdown underline
    s = s.replace(/`([^`]+)`/g, '$1'); // Markdown inline code
    s = s.replace(/#[a-zA-Z0-9_-]+/g, ''); // Hashtags

    // 2. Pause Handling: Ellipses & awkward stops
    // Replace ellipses (...) with a clean punctuation mark depending on following casing.
    s = s.replace(/\.{2,}|…/g, (match, offset, str) => {
      const rest = str.slice(offset + match.length).trim();
      return rest && /^[A-Z]/.test(rest) ? '. ' : ', ';
    });

    // 3. Currency expansion
    s = s.replace(/\$(\d+(?:\.\d+)?)\s*(?:B|billion)\b/gi, '$1 billion dollars');
    s = s.replace(/\$(\d+(?:\.\d+)?)\s*(?:M|million)\b/gi, '$1 million dollars');
    s = s.replace(/\$(\d+(?:\.\d+)?)\s*(?:K|thousand)\b/gi, '$1 thousand dollars');
    s = s.replace(/\$(\d+(?:\.\d+)?)/g, (_, num) => `${num} dollars`);
    s = s.replace(/€(\d+(?:\.\d+)?)/g, (_, num) => `${num} euros`);
    s = s.replace(/£(\d+(?:\.\d+)?)/g, (_, num) => `${num} pounds`);

    // 4. Percentages & Multipliers
    s = s.replace(/(\d+(?:\.\d+)?)%/g, '$1 percent');
    s = s.replace(/\b(\d+(?:\.\d+)?)[xX]\b/g, '$1 times');

    // 5. Temperatures, Signs & Math symbols
    s = s.replace(/-\s*(\d+)\s*°\s*C\b/gi, 'minus $1 degrees Celsius');
    s = s.replace(/(\d+)\s*°\s*C\b/gi, '$1 degrees Celsius');
    s = s.replace(/-\s*(\d+)\s*°\s*F\b/gi, 'minus $1 degrees Fahrenheit');
    s = s.replace(/(\d+)\s*°\s*F\b/gi, '$1 degrees Fahrenheit');
    s = s.replace(/°/g, ' degrees ');
    s = s.replace(/\s*&\s*/g, ' and ');
    s = s.replace(/\s*\+\s*/g, ' plus ');
    s = s.replace(/\s*=\s*/g, ' equals ');
    s = s.replace(/\s*~\s*/g, ' approximately ');

    // 6. Speed & Measurement Units
    s = s.replace(/(\d+(?:\.\d+)?)\s*km\/h\b/gi, '$1 kilometers per hour');
    s = s.replace(/(\d+(?:\.\d+)?)\s*mph\b/gi, '$1 miles per hour');
    s = s.replace(/(\d+(?:\.\d+)?)\s*m\/s\b/gi, '$1 meters per second');
    s = s.replace(/(\d+(?:\.\d+)?)\s*km\b/gi, '$1 kilometers');
    s = s.replace(/(\d+(?:\.\d+)?)\s*kg\b/gi, '$1 kilograms');

    // 7. Common Latin abbreviations & shorthands
    s = s.replace(/\be\.g\.,?\s*/gi, 'for example, ');
    s = s.replace(/\bi\.e\.,?\s*/gi, 'that is, ');
    s = s.replace(/\bvs\.?\s+/gi, 'versus ');
    s = s.replace(/\bapprox\.?\s+/gi, 'approximately ');
    s = s.replace(/\betc\.?/gi, 'etcetera');
    s = s.replace(/\bDr\.\s+/gi, 'Doctor ');
    s = s.replace(/\bMr\.\s+/gi, 'Mister ');
    s = s.replace(/\bMrs\.\s+/gi, 'Missus ');
    s = s.replace(/\bMs\.\s+/gi, 'Ms ');

    // 8. Numbers with commas (e.g., 10,000 -> 10000) so Piper doesn't treat comma as a pause
    s = s.replace(/(\d+),(\d{3})\b/g, '$1$2');

    // 9. Ordinals
    s = s.replace(/\b(\d+(?:st|nd|rd|th))\b/gi, (match) => {
      const lower = match.toLowerCase();
      return this.ORDINALS[lower] || match;
    });

    // 10. Technical Acronyms (spelling out letters for Piper clarity where needed)
    s = s.replace(/\bAI\b/g, 'A.I.');
    s = s.replace(/\bDNA\b/g, 'D.N.A.');
    s = s.replace(/\bRNA\b/g, 'R.N.A.');
    s = s.replace(/\bGPU\b/g, 'G.P.U.');
    s = s.replace(/\bCPU\b/g, 'C.P.U.');
    s = s.replace(/\bJWST\b/g, 'J.W.S.T.');
    s = s.replace(/\bISS\b/g, 'I.S.S.');

    // 11. Decimals (e.g. 3.14 -> 3 point 14, 0.5 -> zero point 5)
    s = s.replace(/\b0\.(\d+)/g, 'zero point $1');
    s = s.replace(/(\d+)\.(\d+)/g, '$1 point $2');

    // 12. Punctuation smoothing
    // Replace semicolons and colons with natural pause commas
    s = s.replace(/;\s*/g, ', ');
    s = s.replace(/:\s+/g, ', ');

    // Remove parentheses, brackets, quotes that disrupt flow
    s = s.replace(/[()\[\]{}"`]/g, ' ');

    // Collapse repetitive punctuation (e.g. !!! -> !, ??? -> ?)
    s = s.replace(/!+/g, '!');
    s = s.replace(/\?+/g, '?');
    s = s.replace(/,+/g, ',');
    s = s.replace(/\.{2,}/g, '.');

    // Fix spacing around punctuation
    s = s.replace(/\s+([,.!?])/g, '$1');
    s = s.replace(/([,.!?])([^\s0-9A-Z.!?])/g, '$1 $2');

    // Collapse whitespace
    s = s.replace(/\s+/g, ' ').trim();

    return s;
  }

  /**
   * Joins individual scene narrations into one cohesive continuous narrative delivery.
   * Avoids artificial pauses (such as '...') and ensures clean terminal punctuation between scenes.
   */
  static joinSceneNarrations(scenes: Array<{ narration: string } | string>): string {
    if (!scenes || scenes.length === 0) {
      return '';
    }

    const cleaned = scenes
      .map((scene) => {
        const text = typeof scene === 'string' ? scene : scene?.narration;
        return (text || '').trim();
      })
      .filter((text) => text.length > 0)
      .map((text) => {
        // Ensure scene ends with standard terminal punctuation
        if (/[.!?]$/.test(text)) {
          return text;
        }
        if (/[,;:\-]$/.test(text)) {
          return text.slice(0, -1) + '.';
        }
        return text + '.';
      });

    return cleaned.join(' ');
  }
}
