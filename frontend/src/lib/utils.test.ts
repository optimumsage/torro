import { describe, it, expect } from 'vitest';
import { formatBytes, formatEta, formatSpeed } from './utils';

describe('formatBytes', () => {
  it('handles units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 ** 2)).toBe('1.0 MB');
    expect(formatBytes(1024 ** 3)).toBe('1.00 GB');
  });
  it('handles nullish', () => {
    expect(formatBytes(null)).toBe('0 B');
    expect(formatBytes(undefined)).toBe('0 B');
  });
});

describe('formatSpeed', () => {
  it('shows a dash for zero', () => expect(formatSpeed(0)).toBe('—'));
  it('formats per-second', () => expect(formatSpeed(1024)).toBe('1.0 KB/s'));
});

describe('formatEta', () => {
  it('dashes invalid', () => {
    expect(formatEta(0)).toBe('—');
    expect(formatEta(8640000)).toBe('—');
  });
  it('formats durations', () => {
    expect(formatEta(45)).toBe('45s');
    expect(formatEta(90)).toBe('1m 30s');
    expect(formatEta(3700)).toBe('1h 1m');
  });
});
