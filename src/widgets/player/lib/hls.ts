const HLS_TYPE = 'application/vnd.apple.mpegurl';

const inDevServer = () => typeof DEV_SERVER !== 'undefined' && DEV_SERVER;

export const playsHlsNatively = (element: HTMLVideoElement) => element.canPlayType(HLS_TYPE) !== '';

export const canPlayHls = (element: HTMLVideoElement) => playsHlsNatively(element) || inDevServer();

function loadHlsJs() {
  // Only the dev server bundles it, a TV plays HLS itself
  if (typeof DEV_SERVER !== 'undefined' && DEV_SERVER) return import('hls.js');
  return Promise.reject(new Error('hls.js is not part of this build'));
}

export async function attachHls(element: HTMLVideoElement, url: string, onFatal: (details: string) => void) {
  const { default: Hls } = await loadHlsJs();
  if (!Hls.isSupported()) throw new Error('This browser cannot play HLS');
  const hls = new Hls();
  hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) onFatal(data.details); });
  hls.loadSource(url);
  hls.attachMedia(element);
  return () => hls.destroy();
}
