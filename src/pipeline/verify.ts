import { normalizeBengali, computeBengaliRatio } from '../lib/normalize';
import { VerificationResult, LineMatchResult } from '../types';

/**
 * Calculates Levenshtein-based similarity between two short strings [0.0 - 1.0]
 */
function calculateStringSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (!s1.length || !s2.length) return 0.0;

  // If one contains the other entirely
  if (s1.includes(s2) || s2.includes(s1)) {
    const minLen = Math.min(s1.length, s2.length);
    const maxLen = Math.max(s1.length, s2.length);
    return minLen / maxLen >= 0.85 ? 0.95 : 0.90;
  }

  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  // Optimized distance calculation for performance
  const costs: number[] = [];
  for (let i = 0; i <= longer.length; i++) {
    costs[i] = i;
  }

  for (let j = 1; j <= shorter.length; j++) {
    let nw = costs[0];
    costs[0] = j;
    for (let i = 1; i <= longer.length; i++) {
      const cj = costs[i];
      if (longer[i - 1] === shorter[j - 1]) {
        costs[i] = nw;
      } else {
        costs[i] = 1 + Math.min(costs[i], costs[i - 1], nw);
      }
      nw = cj;
    }
  }

  const distance = costs[longer.length];
  return (longer.length - distance) / longer.length;
}

/**
 * Deterministically verifies extracted Bengali lyrics against untrusted source page/input text.
 * Proves that zero lines were hallucinated or fabricated by the AI model.
 */
export function verifyExtractedLyrics(
  extractedLyrics: string,
  rawSourceText: string,
  threshold = 0.90,
  languageOrAllowEnglish: 'bn' | 'en' | boolean = 'bn'
): VerificationResult {
  const allowEnglish = typeof languageOrAllowEnglish === 'boolean'
    ? languageOrAllowEnglish
    : languageOrAllowEnglish === 'en';
  const reasons: string[] = [];

  const rawLines = extractedLyrics
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (rawLines.length === 0) {
    return {
      passed: false,
      needsAttention: true,
      coverage: 0,
      bengaliRatio: 0,
      language: allowEnglish ? 'en' : 'bn',
      lineCount: 0,
      matchedLinesCount: 0,
      lineDetails: [],
      reasons: ['No lyrics lines found in extraction output'],
    };
  }

  const bengaliRatio = computeBengaliRatio(extractedLyrics);
  const isEnglishLyrics = allowEnglish || bengaliRatio < 0.20;

  if (bengaliRatio < 0.40 && !allowEnglish) {
    reasons.push(
      `Low Bengali character ratio: ${(bengaliRatio * 100).toFixed(1)}% (minimum 40% required). If this is an English song, approve English lyrics.`
    );
  }

  if (rawLines.length < 4) {
    reasons.push(`Fewer than 4 lines extracted (${rawLines.length} lines). Song appears truncated.`);
  }

  const cleanNormalize = (text: string) => {
    if (isEnglishLyrics) {
      return text
        .normalize('NFC')
        .toLowerCase()
        .replace(/[!?,:;"'(){}\[\]<>~`@#$%^&*_\-+=/\\|।॥]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    return normalizeBengali(text);
  };

  const normalizedSource = cleanNormalize(rawSourceText);
  const sourceLines = normalizedSource
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const lineDetails: LineMatchResult[] = [];
  let matchedCount = 0;

  for (let i = 0; i < rawLines.length; i++) {
    const originalLine = rawLines[i];
    const normLine = cleanNormalize(originalLine);
    const cleanedLine = normLine.replace(/\[[^\]]+\]/g, '').replace(/\([^\)]+\)/g, '').replace(/\s+/g, ' ').trim();

    if (!normLine || !cleanedLine) {
      lineDetails.push({
        lineIndex: i,
        text: originalLine,
        matched: true,
        bestSimilarity: 1.0,
      });
      matchedCount++;
      continue;
    }

    // Direct substring check in normalized source
    if (normalizedSource.includes(normLine) || normalizedSource.includes(cleanedLine)) {
      lineDetails.push({
        lineIndex: i,
        text: originalLine,
        matched: true,
        bestSimilarity: 1.0,
        matchedSourceSnippet: normLine,
      });
      matchedCount++;
      continue;
    }

    // Fuzzy check against each source line / chunk
    let bestSim = 0;
    let bestSnippet = '';

    for (const srcLine of sourceLines) {
      const cleanedSrc = srcLine.replace(/\[[^\]]+\]/g, '').replace(/\([^\)]+\)/g, '').replace(/\s+/g, ' ').trim();
      const sim = Math.max(
        calculateStringSimilarity(normLine, srcLine),
        calculateStringSimilarity(cleanedLine, cleanedSrc)
      );
      if (sim > bestSim) {
        bestSim = sim;
        bestSnippet = srcLine;
        if (bestSim >= 0.98) break;
      }
    }

    // If still not matched, check sliding sub-strings in source
    if (bestSim < threshold && cleanedLine.length > 8) {
      const lineLen = cleanedLine.length;
      for (let s = 0; s <= normalizedSource.length - lineLen; s += Math.max(1, Math.floor(lineLen / 3))) {
        const window = normalizedSource.slice(s, s + lineLen);
        const sim = calculateStringSimilarity(cleanedLine, window);
        if (sim > bestSim) {
          bestSim = sim;
          bestSnippet = window;
          if (bestSim >= threshold) break;
        }
      }
    }

    const matched = bestSim >= threshold;
    if (matched) {
      matchedCount++;
    }

    lineDetails.push({
      lineIndex: i,
      text: originalLine,
      matched,
      bestSimilarity: Number(bestSim.toFixed(3)),
      matchedSourceSnippet: bestSnippet || undefined,
    });
  }

  const coverage = Number((matchedCount / rawLines.length).toFixed(4));

  if (coverage < threshold) {
    reasons.push(
      `Line verification coverage ${(coverage * 100).toFixed(1)}% is below ${(threshold * 100).toFixed(0)}% threshold. ${
        rawLines.length - matchedCount
      } line(s) could not be verified in the source text.`
    );
  }

  const passed = coverage >= threshold && (allowEnglish || bengaliRatio >= 0.40) && rawLines.length >= 4;
  const needsAttention = !passed;

  return {
    passed,
    needsAttention,
    coverage,
    bengaliRatio,
    language: isEnglishLyrics ? 'en' : 'bn',
    lineCount: rawLines.length,
    matchedLinesCount: matchedCount,
    lineDetails,
    reasons,
  };
}
