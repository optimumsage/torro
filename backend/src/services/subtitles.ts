import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SUB_FILE_EXTS = new Set(['.srt', '.vtt', '.ass', '.ssa', '.sub']);

// Common language codes/names → display label.
const LANG_NAMES: Record<string, string> = {
  en: 'English', eng: 'English', es: 'Spanish', spa: 'Spanish', fr: 'French', fre: 'French', fra: 'French',
  de: 'German', ger: 'German', deu: 'German', it: 'Italian', ita: 'Italian', pt: 'Portuguese', por: 'Portuguese',
  ru: 'Russian', rus: 'Russian', ar: 'Arabic', ara: 'Arabic', hi: 'Hindi', hin: 'Hindi', ur: 'Urdu', urd: 'Urdu',
  zh: 'Chinese', chi: 'Chinese', zho: 'Chinese', ja: 'Japanese', jpn: 'Japanese', ko: 'Korean', kor: 'Korean',
  nl: 'Dutch', tr: 'Turkish', pl: 'Polish', sv: 'Swedish', fa: 'Persian', per: 'Persian', fas: 'Persian',
};

export function languageLabel(code?: string): string | undefined {
  if (!code) return undefined;
  const k = code.toLowerCase();
  return LANG_NAMES[k] ?? code.toUpperCase();
}

// Guess a language from a subtitle filename, e.g. "Movie.en.srt" or "Movie.eng.forced.srt".
function langFromFilename(name: string): string | undefined {
  const base = name.replace(/\.[^.]+$/, ''); // strip extension
  const parts = base.split('.');
  for (let i = parts.length - 1; i >= 0 && i >= parts.length - 2; i--) {
    const p = parts[i]?.toLowerCase();
    if (p && LANG_NAMES[p]) return p;
  }
  return undefined;
}

export interface ExternalSub {
  file: string; // path relative to downloads root
  label: string;
  lang?: string;
}

// List subtitle files sitting next to the video (same directory).
export function listExternalSubs(videoFullPath: string, videoRelPath: string): ExternalSub[] {
  const dir = path.dirname(videoFullPath);
  const relDir = path.dirname(videoRelPath);
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out: ExternalSub[] = [];
  for (const name of entries) {
    if (!SUB_FILE_EXTS.has(path.extname(name).toLowerCase())) continue;
    const lang = langFromFilename(name);
    const label = languageLabel(lang) ?? name.replace(/\.[^.]+$/, '');
    out.push({ file: relDir === '.' ? name : path.join(relDir, name), label, lang });
  }
  return out;
}

function runToBuffer(args: string[], timeoutMs = 30000): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'ignore'] });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d) => chunks.push(d));
    child.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0 && chunks.length ? Buffer.concat(chunks) : null);
    });
  });
}

// Extract an embedded subtitle stream as WebVTT.
export function extractEmbeddedVtt(videoPath: string, index: number): Promise<Buffer | null> {
  return runToBuffer(['-nostdin', '-loglevel', 'error', '-i', videoPath, '-map', `0:s:${index}`, '-f', 'webvtt', 'pipe:1']);
}

// Convert an external subtitle file to WebVTT (already-VTT files are returned as-is).
export async function externalSubToVtt(subPath: string): Promise<Buffer | null> {
  if (path.extname(subPath).toLowerCase() === '.vtt') {
    try {
      return await fs.promises.readFile(subPath);
    } catch {
      return null;
    }
  }
  return runToBuffer(['-nostdin', '-loglevel', 'error', '-i', subPath, '-f', 'webvtt', 'pipe:1']);
}

export function isSubtitleFile(p: string): boolean {
  return SUB_FILE_EXTS.has(path.extname(p).toLowerCase());
}
