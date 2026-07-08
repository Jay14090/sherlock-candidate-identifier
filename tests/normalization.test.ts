import { describe, expect, it } from 'vitest';
import {
  compareNames,
  emailLocalPart,
  emailLocalPartResemblance,
  emailLocalPartTokens,
  isDeviceLikeName,
  levenshtein,
  normalizeName,
  similarityRatio,
  tokenizeName,
} from '@/lib/normalization';

describe('normalizeName', () => {
  it('lowercases and trims', () => {
    expect(normalizeName('  Jay Chhichhia  ')).toBe('jay chhichhia');
  });

  it('removes punctuation and collapses spaces', () => {
    expect(normalizeName("Rohit   K.  (Candidate)")).toBe('rohit k candidate');
  });
});

describe('tokenizeName', () => {
  it('splits into tokens', () => {
    expect(tokenizeName('Jay Chhichhia')).toEqual(['jay', 'chhichhia']);
  });

  it('returns empty array for empty input', () => {
    expect(tokenizeName('   ')).toEqual([]);
  });
});

describe('isDeviceLikeName', () => {
  it('detects device names', () => {
    expect(isDeviceLikeName('MacBook Pro')).toBe(true);
    expect(isDeviceLikeName('iPhone')).toBe(true);
    expect(isDeviceLikeName('User 2')).toBe(true);
    expect(isDeviceLikeName('Guest')).toBe(true);
    expect(isDeviceLikeName('Observer')).toBe(true);
  });

  it('does not flag real names', () => {
    expect(isDeviceLikeName('Ananya Sharma')).toBe(false);
    expect(isDeviceLikeName('Rohit K')).toBe(false);
    expect(isDeviceLikeName('Meeting Observer')).toBe(false); // "meeting" is a real word token
  });

  it('treats empty names as device-like (unusable)', () => {
    expect(isDeviceLikeName('')).toBe(true);
  });
});

describe('email helpers', () => {
  it('extracts local part', () => {
    expect(emailLocalPart('neha.verma@example.com')).toBe('neha.verma');
  });

  it('tokenizes local part on separators and digits', () => {
    expect(emailLocalPartTokens('neha.verma@example.com')).toEqual(['neha', 'verma']);
    expect(emailLocalPartTokens('jay_chhichhia14@example.com')).toEqual(['jay', 'chhichhia']);
  });
});

describe('levenshtein / similarityRatio', () => {
  it('computes edit distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('same', 'same')).toBe(0);
  });

  it('computes similarity ratio', () => {
    expect(similarityRatio('abcd', 'abcd')).toBe(1);
    expect(similarityRatio('abcd', 'abce')).toBeCloseTo(0.75);
  });
});

describe('compareNames', () => {
  it('exact match ignoring case', () => {
    const result = compareNames('Jay Chhichhia', 'jay chhichhia');
    expect(result.score).toBe(1.0);
    expect(result.tier).toBe('exact');
  });

  it('nickname: first name + last initial', () => {
    const result = compareNames('Rohit Kulkarni', 'Rohit K');
    expect(result.tier).toBe('token_plus_initial');
    expect(result.score).toBe(0.65);
  });

  it('initial + last name', () => {
    const result = compareNames('Aman Singh', 'A Singh');
    expect(result.tier).toBe('token_plus_initial');
    expect(result.score).toBe(0.65);
  });

  it('device name does not resemble candidate', () => {
    const result = compareNames('Ananya Sharma', 'MacBook Pro');
    expect(result.score).toBeLessThanOrEqual(0.1);
  });

  it('shared first name only is a partial match', () => {
    const result = compareNames('Amit Shah', 'Amit Sharma');
    expect(result.tier).toBe('shared_token');
    expect(result.score).toBe(0.5);
  });

  it('typo-level difference is a fuzzy full match', () => {
    const result = compareNames('Ananya Sharma', 'Ananya Sharmaa');
    expect(result.tier).toBe('fuzzy_full');
    expect(result.score).toBe(0.8);
  });

  it('subset token match is strong', () => {
    const result = compareNames('Priya Mehta', 'Priya Mehta (HR)');
    expect(result.score).toBeGreaterThanOrEqual(0.85);
  });
});

describe('emailLocalPartResemblance', () => {
  it('matches abbreviated display names', () => {
    const result = emailLocalPartResemblance('neha.verma@example.com', 'Neha V');
    expect(result.score).toBeGreaterThanOrEqual(0.65);
  });

  it('matches full display names exactly', () => {
    const result = emailLocalPartResemblance('amit.sharma@example.com', 'Amit Sharma');
    expect(result.score).toBe(1.0);
  });
});
