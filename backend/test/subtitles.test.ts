import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listExternalSubs, languageLabel, isSubtitleFile } from '../src/services/subtitles.js';

let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'subs-'));
  fs.mkdirSync(path.join(dir, 'Movie'));
  fs.writeFileSync(path.join(dir, 'Movie', 'film.mkv'), 'x');
  fs.writeFileSync(path.join(dir, 'Movie', 'film.en.srt'), 'x');
  fs.writeFileSync(path.join(dir, 'Movie', 'film.spa.srt'), 'x');
  fs.writeFileSync(path.join(dir, 'Movie', 'notes.txt'), 'x');
});

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('subtitles', () => {
  it('maps language codes to labels', () => {
    expect(languageLabel('en')).toBe('English');
    expect(languageLabel('spa')).toBe('Spanish');
    expect(languageLabel('xx')).toBe('XX');
    expect(languageLabel(undefined)).toBeUndefined();
  });

  it('recognises subtitle files', () => {
    expect(isSubtitleFile('a.srt')).toBe(true);
    expect(isSubtitleFile('a.vtt')).toBe(true);
    expect(isSubtitleFile('a.mp4')).toBe(false);
  });

  it('lists sibling subtitle files with parsed language', () => {
    const subs = listExternalSubs(path.join(dir, 'Movie', 'film.mkv'), 'Movie/film.mkv');
    expect(subs).toHaveLength(2);
    const en = subs.find((s) => s.lang === 'en');
    expect(en?.label).toBe('English');
    expect(en?.file).toBe(path.join('Movie', 'film.en.srt'));
    expect(subs.some((s) => s.lang === 'spa')).toBe(true);
  });
});
