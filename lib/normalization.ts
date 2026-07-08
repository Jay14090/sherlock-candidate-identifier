import { DEVICE_NAME_WORDS } from './constants';

/** Lowercase, trim, strip punctuation, collapse whitespace. Keeps device words. */
export function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeName(raw: string): string[] {
  const normalized = normalizeName(raw);
  return normalized.length === 0 ? [] : normalized.split(' ');
}

/** True when a display name looks like a device/placeholder, e.g. "MacBook Pro", "Guest", "User 2". */
export function isDeviceLikeName(raw: string): boolean {
  const tokens = tokenizeName(raw);
  if (tokens.length === 0) return true;
  return tokens.every(
    (token) => DEVICE_NAME_WORDS.includes(token) || /^\d+$/.test(token),
  );
}

/** "neha.verma@example.com" -> "neha.verma" */
export function emailLocalPart(email: string): string {
  const at = email.indexOf('@');
  return at === -1 ? email : email.slice(0, at);
}

/** "neha.verma" -> ["neha", "verma"] */
export function emailLocalPartTokens(email: string): string[] {
  return emailLocalPart(email)
    .toLowerCase()
    .split(/[._\-+\d]+/)
    .filter((t) => t.length > 0);
}

export function emailDomain(email: string): string {
  const at = email.indexOf('@');
  return at === -1 ? '' : email.slice(at + 1).toLowerCase();
}

/** Classic Levenshtein edit distance. Small inputs only (names), so O(n*m) is fine. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitutionCost,
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/** 1.0 = identical, 0.0 = nothing shared. */
export function similarityRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

export type NameMatchTier =
  | 'exact'
  | 'strong_token'
  | 'fuzzy_full'
  | 'token_plus_initial'
  | 'shared_token'
  | 'weak'
  | 'none';

export interface NameComparison {
  score: number;
  tier: NameMatchTier;
  reason: string;
}

/**
 * Tiered comparison of two person names. Returns a 0..1 score plus a
 * human-readable reason so the evidence panel can explain itself.
 */
export function compareNames(nameA: string, nameB: string): NameComparison {
  const normA = normalizeName(nameA);
  const normB = normalizeName(nameB);
  const tokensA = tokenizeName(nameA);
  const tokensB = tokenizeName(nameB);

  if (normA.length === 0 || normB.length === 0) {
    return { score: 0.1, tier: 'none', reason: 'One of the names is empty.' };
  }

  if (normA === normB) {
    return { score: 1.0, tier: 'exact', reason: 'Names match exactly after normalization.' };
  }

  const [shorter, longer] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  const allShortTokensPresent = shorter.every((t) => longer.includes(t));
  if (allShortTokensPresent && shorter.length >= 1 && shorter.some((t) => t.length > 1)) {
    if (shorter.length === longer.length || shorter.length >= 2) {
      return { score: 0.85, tier: 'strong_token', reason: 'All name tokens overlap strongly.' };
    }
  }

  if (similarityRatio(normA, normB) >= 0.85) {
    return {
      score: 0.8,
      tier: 'fuzzy_full',
      reason: 'Names are nearly identical — likely a typo or spelling variant.',
    };
  }

  const exactShared = tokensA.filter((t) => t.length > 1 && tokensB.includes(t));
  const initialPairs = countInitialMatches(tokensA, tokensB, exactShared);

  if (exactShared.length >= 1 && initialPairs >= 1) {
    return {
      score: 0.65,
      tier: 'token_plus_initial',
      reason: 'One full name token matches and another matches by initial (e.g. nickname or abbreviated name).',
    };
  }

  if (exactShared.length >= 1) {
    return {
      score: 0.5,
      tier: 'shared_token',
      reason: 'Names share a token (e.g. the same first name) but do not fully match.',
    };
  }

  const fuzzyToken = tokensA.some((a) =>
    tokensB.some((b) => a.length > 2 && b.length > 2 && similarityRatio(a, b) >= 0.8),
  );
  if (fuzzyToken || initialPairs >= 1) {
    return { score: 0.45, tier: 'weak', reason: 'Names have only a weak fuzzy or initial-level resemblance.' };
  }

  return { score: 0.1, tier: 'none', reason: 'Names do not resemble each other.' };
}

/** Counts single-letter tokens in one name that match the first letter of an unmatched multi-letter token in the other. */
function countInitialMatches(tokensA: string[], tokensB: string[], alreadyShared: string[]): number {
  let count = 0;
  const initialsOf = (single: string[], full: string[]) => {
    for (const s of single) {
      if (s.length !== 1) continue;
      if (full.some((f) => f.length > 1 && !alreadyShared.includes(f) && f.startsWith(s))) {
        count += 1;
      }
    }
  };
  initialsOf(tokensA, tokensB);
  initialsOf(tokensB, tokensA);
  return count;
}

/** How strongly an email local-part (e.g. "neha.verma") resembles a display name (e.g. "Neha V"). */
export function emailLocalPartResemblance(email: string, displayName: string): NameComparison {
  const localTokens = emailLocalPartTokens(email);
  if (localTokens.length === 0) {
    return { score: 0.1, tier: 'none', reason: 'Email local-part has no usable tokens.' };
  }
  return compareNames(localTokens.join(' '), displayName);
}
