import { callLuna, isWebOS } from './luna';

const SET_PLAY_RATE = 'luna://com.webos.media/setPlayRate';

export type RateResult = 'ok' | 'pending' | 'failed';

// The web view mutes the sound at any other playbackRate, the TV's media service speeds up picture and sound together
export async function applyPlayRate(video: HTMLVideoElement, rate: number): Promise<RateResult> {
  if (!isWebOS()) {
    video.defaultPlaybackRate = rate;
    video.playbackRate = rate;
    return 'ok';
  }
  if (!video.mediaId) return 'pending';
  const reply = await callLuna(SET_PLAY_RATE, { mediaId: video.mediaId, playRate: rate, audioOutput: true });
  return reply.returnValue ? 'ok' : 'failed';
}
