import { describe, it, expect } from 'vitest';
import { classify, type MediaInfo } from '../src/services/ffmpeg.js';
import { buildPlaylist, segmentCount, SEGMENT_SECONDS } from '../src/services/transcode.js';
import { storyboardMeta, buildStoryboardVtt } from '../src/services/thumbnails.js';

function info(partial: Partial<MediaInfo>): MediaInfo {
  return {
    durationSec: 100,
    videoCodec: 'h264',
    audioCodec: 'aac',
    width: 1920,
    height: 1080,
    hasVideo: true,
    hasAudio: true,
    ...partial,
  };
}

describe('classify', () => {
  it('plays H.264/AAC MP4 directly', () => {
    expect(classify('movie.mp4', info({}))).toBe('direct');
  });
  it('plays VP9/Opus WebM directly', () => {
    expect(classify('clip.webm', info({ videoCodec: 'vp9', audioCodec: 'opus' }))).toBe('direct');
  });
  it('transcodes MKV even with web-friendly codecs (container)', () => {
    expect(classify('movie.mkv', info({}))).toBe('hls');
  });
  it('transcodes HEVC', () => {
    expect(classify('movie.mp4', info({ videoCodec: 'hevc' }))).toBe('hls');
  });
  it('transcodes AC3 audio', () => {
    expect(classify('movie.mp4', info({ audioCodec: 'ac3' }))).toBe('hls');
  });
});

describe('buildPlaylist', () => {
  it('emits one segment per window, ending with ENDLIST', () => {
    const m = info({ durationSec: 20 });
    const pl = buildPlaylist('Movies%2Fx.mkv', m);
    expect(segmentCount(m)).toBe(Math.ceil(20 / SEGMENT_SECONDS));
    expect(pl).toContain('#EXTM3U');
    expect(pl).toContain('segment?path=Movies%2Fx.mkv&i=0');
    expect(pl.trim().endsWith('#EXT-X-ENDLIST')).toBe(true);
    expect((pl.match(/#EXTINF/g) || []).length).toBe(segmentCount(m));
  });
});

describe('storyboard', () => {
  it('produces a VTT with one cue per thumbnail and #xywh fragments', () => {
    const m = info({ durationSec: 300 });
    const meta = storyboardMeta(m);
    const vtt = buildStoryboardVtt('x.mkv', m);
    expect(vtt.startsWith('WEBVTT')).toBe(true);
    expect((vtt.match(/#xywh=/g) || []).length).toBe(meta.count);
    expect(vtt).toContain('sprite?path=x.mkv#xywh=0,0,160,90');
  });
});
