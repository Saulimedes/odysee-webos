import { formatDuration, isWebOS, usesOutputWindow } from '@/shared/lib';
import type { Video } from '@/entities/video';

export interface StatRow { label: string; value: string }
export interface StatsContext {
  video: Video;
  aspect: string;
  speed: number;
  buffering: boolean;
  sourceUrl: string;
  adaptive?: boolean;
  version: string;
}
export interface StatsRate { at: number; time: number; start: number; end: number; fill: number }

type MeasuredVideo = HTMLVideoElement & { webkitDecodedFrameCount?: number; webkitDroppedFrameCount?: number };
type Connection = { downlink?: number; effectiveType?: string; rtt?: number };

const READY = ['nothing', 'metadata', 'current data', 'future data', 'enough data'];
const NETWORK = ['empty', 'idle', 'loading', 'no source'];

export function bufferedRange(video: HTMLVideoElement) {
  const ranges = video.buffered;
  for (let index = 0; index < ranges.length; index++) {
    if (ranges.start(index) <= video.currentTime + 0.1 && ranges.end(index) >= video.currentTime) return { start: ranges.start(index), end: ranges.end(index) };
  }
  return { start: video.currentTime, end: video.currentTime };
}

export function nextRate(previous: StatsRate | null, now: number, video: HTMLVideoElement, speed = 1): StatsRate {
  const { start, end } = bufferedRange(video);
  const time = video.currentTime;
  const base = { at: now, time, start, end, fill: 0 };
  if (!previous || now <= previous.at) return base;
  const elapsed = (now - previous.at) / 1000;
  const moved = time - previous.time;
  if (start !== previous.start || moved < -0.5 || moved > elapsed * Math.max(1, video.playbackRate, speed) + 1.5) return base;
  const fill = Math.max(0, (end - previous.end) / elapsed);
  return { ...base, fill: fill < 0.01 ? 0 : fill };
}

const fixed = (value: number, digits = 1) => (Math.round(value * 10 ** digits) / 10 ** digits).toFixed(digits);

function frames(video: MeasuredVideo) {
  const quality = typeof video.getVideoPlaybackQuality === 'function' ? video.getVideoPlaybackQuality() : null;
  const total = quality ? quality.totalVideoFrames : video.webkitDecodedFrameCount || 0;
  const dropped = quality ? quality.droppedVideoFrames : video.webkitDroppedFrameCount || 0;
  return total > 0 ? `${dropped} dropped of ${total}` : 'not reported by this TV';
}

function host(url: string) {
  try { return new URL(url).host; } catch { return 'unknown'; }
}

function bitrate(video: Video, adaptive?: boolean) {
  const original = video.size && video.duration > 0 ? `${fixed((video.size * 8) / video.duration / 1e6, 2)} Mbit/s` : '';
  if (adaptive) return original ? `chosen by the player (original file about ${original})` : 'chosen by the player';
  return original ? `about ${original} (original file)` : 'unknown';
}

export function collectStats(element: HTMLVideoElement, context: StatsContext, rate: StatsRate | null): StatRow[] {
  const { video } = context;
  const source = element.currentSrc || context.sourceUrl;
  const connection = (navigator as Navigator & { connection?: Connection }).connection;
  const ahead = Math.max(0, bufferedRange(element).end - element.currentTime);
  const resolution = element.videoWidth ? `${element.videoWidth}x${element.videoHeight}` : 'waiting for the video';
  const listed = video.height > 0 ? ` (listed ${video.height}p)` : '';
  const state = element.ended ? 'ended' : context.buffering ? 'buffering' : element.paused ? 'paused' : 'playing';
  const chrome = (navigator.userAgent.match(/Chrom(?:e|ium)\/(\d+)/) || [])[1];
  const duration = Number.isFinite(element.duration) ? element.duration : video.duration;
  return [
    { label: 'Video', value: `${video.id.slice(0, 10)} (${video.claimName})` },
    { label: 'Stream', value: `${context.adaptive ? 'adaptive stream (HLS)' : 'original file'} from ${host(source)}` },
    { label: 'File', value: [video.mediaType, video.size ? `${fixed(video.size / 1048576)} MB` : ''].filter(Boolean).join(', ') || 'unknown' },
    { label: 'Bitrate', value: bitrate(video, context.adaptive) },
    { label: 'Resolution', value: `${resolution}${listed}` },
    { label: 'Aspect', value: `${element.videoHeight ? fixed(element.videoWidth / element.videoHeight, 2) : '-'} (${context.aspect})` },
    { label: 'Viewport', value: `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio || 1}x` },
    { label: 'Frames', value: frames(element) },
    { label: 'Buffer', value: `${fixed(ahead)} s ahead, ${element.buffered.length} range${element.buffered.length === 1 ? '' : 's'}` },
    { label: 'Buffer fill', value: rate && rate.fill > 0 ? `${fixed(rate.fill)}x realtime` : 'buffer full or idle' },
    { label: 'Connection', value: connection && connection.downlink ? [`about ${connection.downlink} Mbit/s`, connection.effectiveType, connection.rtt ? `${connection.rtt} ms` : ''].filter(Boolean).join(', ') : 'not reported by this TV' },
    { label: 'Position', value: `${formatDuration(element.currentTime) || '0:00'} / ${formatDuration(duration) || '0:00'}` },
    { label: 'State', value: `${state}, ${fixed(context.speed, 2).replace(/\.?0+$/, '')}x, ${READY[element.readyState] || element.readyState}, network ${NETWORK[element.networkState] || element.networkState}` },
    { label: 'Volume', value: `player ${Math.round(element.volume * 100)}%${element.muted ? ' (muted)' : ''}` },
    { label: 'Display', value: isWebOS() ? `webOS${element.mediaId ? ', media id set' : ', no media id'}, ${usesOutputWindow() ? 'TV output service crops and stretches' : 'object-fit'}` : 'browser, object-fit' },
    { label: 'Engine', value: `${chrome ? `Chrome ${chrome}` : 'unknown browser'}, app ${context.version}` },
  ];
}
