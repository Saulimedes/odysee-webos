import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  IconArrowLeft, IconClock, IconClockFilled, IconHeart, IconHeartFilled, IconPlayerPause, IconPlayerPlay,
  IconPlayerTrackNext, IconRewindBackward10, IconRewindForward10, IconSettings, IconStar, IconStarFilled,
} from '@tabler/icons-react';
import { ASPECT_RATIOS, KEY, PLAYBACK_SPEEDS, getSetting, useSetting } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { PRIORITY, pointerMoved, useKeys, useRemembered } from '@/shared/lib';
import { Avatar, OdyseeIcon, Spinner, Thumb } from '@/shared/ui';
import { fileUrl, resolveSource, type StreamSource, type Video } from '@/entities/video';
import { isLoggedIn, useSession } from '@/entities/session';
import { toggleInCollection, useCollections } from '@/features/collections';
import { isFollowing, setFollowing } from '@/features/following';
import { getSavedPosition, removePlaybackItem, savePlaybackPosition } from '@/features/playback-history';
import { getReactions, setReaction, type Reaction } from '../api/reactions';
import { attachHls, canPlayHls, playsHlsNatively } from '../lib/hls';
import { useNextVideo } from '../model/useNextVideo';
import { useOutputWindow } from '../model/useOutputWindow';
import { usePlaybackSpeed } from '../model/usePlaybackSpeed';
import { usePlaybackStats } from '../model/usePlaybackStats';
import { useSeek } from '../model/useSeek';
import { PlayerMenu, type MenuChoice } from './PlayerMenu';
import { StatsPanel } from './StatsPanel';
import { Timeline } from './Timeline';

const CONTROLS = ['channel', 'follow', 'favorites', 'watchLater', 'skipBack', 'play', 'skipForward', 'next', 'like', 'dislike', 'settings'] as const;
type Control = (typeof CONTROLS)[number];
type Row = 'topbar' | 'progress' | 'buttons';

const HIDE_AFTER_MS = 4000;
const SAVE_EVERY_MS = 10000;
const RELOAD_DELAYS_MS = [2000, 3000, 5000];
// The TV reports a refusal of the stream (a 429 of the server, which clears after a while) like a file it cannot play (which never does)
const REFUSED_RETRY_DELAYS_MS = [3000, 5000, 8000, 12000, 15000, 20000, 30000, 30000, 30000, 30000];
const gaveUp = new Set<string>();
const playlistFailed = new Set<string>();
const RETRY_COOLDOWN_MS = 5000;
const TOAST_MS = 3000;
const AUTOPLAY_SECONDS = 5;
const MEDIA_ERR_DECODE = 3;
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;
// Chrome reports an HTTP refusal of the stream, such as a 429, like this (other engines give no message), a real codec problem names the demuxer or pipeline instead
const REFUSED = /MEDIA_ELEMENT_ERROR: Format error/i;

const aspectOf = (code: string) => ASPECT_RATIOS.find((aspect) => aspect.code === code) ?? ASPECT_RATIOS[0];
const speedName = (speed: number) => PLAYBACK_SPEEDS.find((option) => option.code === speed)?.name ?? `${speed}×`;

interface Props {
  video: Video;
  queue?: Video[];
  onClose: () => void;
  onPlayNext: (video: Video) => void;
  onOpenChannel: (id: string, name: string) => void;
  onStarted?: (video: Video) => void;
}

export function Player({ video, queue, onClose, onPlayNext, onOpenChannel, onStarted }: Props) {
  const t = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;
  const { user } = useSession();
  const lists = useCollections();
  const next = useNextVideo(video, queue);
  const nextRef = useRef(next);
  nextRef.current = next;
  const onStartedRef = useRef(onStarted);
  onStartedRef.current = onStarted;
  const onPlayNextRef = useRef(onPlayNext);
  onPlayNextRef.current = onPlayNext;
  const reported = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const playingRef = useRef(false);
  const endTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [initialStart] = useState(() => (getSetting('resume') ? getSavedPosition(video.id) : 0));
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [error, setError] = useState<{ text: string; busy: boolean } | null>(null);
  const [controls, setControls] = useState(true);
  const [row, setRow] = useState<Row>('buttons');
  const [focused, setFocused] = useState<Control>('play');
  const [following, setFollowingState] = useState(false);
  const [mine, setMine] = useState<Reaction | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [source, setSource] = useState<{ kind: 'hls' | 'file'; url: string } | null>(null);
  const refusals = useRef(0);
  const loadedAt = useRef(0);
  const started = useRef(false);
  const reloads = useRef(0);
  const userPaused = useRef(false);
  const stale = useRef(false);
  const [aspect, setAspect] = useState(() => aspectOf(getSetting('aspectRatio')).code);
  const [speed, setSpeed] = useState(() => getSetting('playbackSpeed'));
  const [menuOpen, setMenuOpen] = useState(false);
  const [statsEnabled] = useSetting('statsForNerds');
  const [backButton] = useSetting('osdBackButton');
  const [statsOpen, setStatsOpen] = useRemembered('player:stats', false);
  const [toast, setToast] = useState('');
  // Used up by the first loadedmetadata, a busy TV can be late to notice
  const resumeAt = useRef(initialStart);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seek = useSeek(videoRef);
  const loggedIn = Boolean(user) && isLoggedIn();
  const canFollow = loggedIn && Boolean(video.channelId);
  const controlList = useMemo(
    () => CONTROLS.filter((control) => (control !== 'follow' || canFollow) && (control !== 'next' || next !== null)),
    [canFollow, next],
  );

  const reveal = useCallback(() => {
    setControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => { if (playingRef.current) setControls(false); }, HIDE_AFTER_MS);
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), TOAST_MS);
  }, []);

  const speedUnsupported = useCallback(() => {
    setSpeed(1);
    showToast(t('Playback speed is not available on this device'));
  }, [showToast, t]);

  useOutputWindow(videoRef, aspect);
  usePlaybackSpeed(videoRef, speed, speedUnsupported);

  const savePosition = useCallback((element: HTMLVideoElement | null = videoRef.current) => {
    if (!element || !element.currentTime) return;
    const duration = Number.isFinite(element.duration) ? element.duration : video.duration;
    savePlaybackPosition(video, element.currentTime, duration);
  }, [video]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return undefined;
    setError(null);
    setBuffering(true);
    started.current = false;
    loadedAt.current = Date.now();
    stale.current = false;
    userPaused.current = false;
    let settled = false;
    let cancelled = false;
    let adaptive = false;
    let reload: ReturnType<typeof setTimeout> | undefined;
    let detach: (() => void) | undefined;
    const later = (delay: number) => { reload = setTimeout(() => setAttempt((count) => count + 1), delay); };
    const patient = () => {
      if (refusals.current === 0 && gaveUp.has(video.id)) refusals.current = REFUSED_RETRY_DELAYS_MS.length - 1;
      return refusals.current < REFUSED_RETRY_DELAYS_MS.length;
    };
    const wait = () => {
      setWaiting(true);
      later(REFUSED_RETRY_DELAYS_MS[refusals.current]);
      refusals.current += 1;
    };
    const giveUp = () => {
      gaveUp.add(video.id);
      setWaiting(false);
      setError({ text: tRef.current('The video could not be loaded. The server may be busy, or this TV cannot play this file. Try again, or pick another video.'), busy: true });
    };
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      // A paused stream drops its connection, loading it again would start the video by itself
      if (started.current && element.paused) stale.current = true;
      else if (started.current && reloads.current < RELOAD_DELAYS_MS.length) {
        const delay = RELOAD_DELAYS_MS[reloads.current];
        reloads.current += 1;
        later(delay);
      } else setError({ text: message, busy: false });
    };
    const problem = (message: string) => {
      if (settled) return;
      if (adaptive) playlistFailed.add(video.id);
      if (adaptive && !started.current) {
        settled = true;
        setAttempt((count) => count + 1);
        return;
      }
      fail(message);
    };
    const onError = () => {
      if (settled) return;
      const failure = element.error;
      const t = tRef.current;
      if (!adaptive && !started.current && failure?.code === MEDIA_ERR_SRC_NOT_SUPPORTED && (!failure.message || REFUSED.test(failure.message))) {
        settled = true;
        if (patient()) wait();
        else giveUp();
        return;
      }
      if (failure?.message) problem(t('Video playback error: {message}', { message: failure.message }));
      else if (failure && (failure.code === MEDIA_ERR_DECODE || failure.code === MEDIA_ERR_SRC_NOT_SUPPORTED)) problem(t('This device cannot play this video file.'));
      else problem(t('Video playback error: {message}', { message: t('Unknown error') }));
    };
    const begin = (target: StreamSource) => {
      adaptive = target.kind === 'hls';
      const viaHlsJs = adaptive && !playsHlsNatively(element);
      const address = target.kind === 'hls' && !viaHlsJs ? target.start : target.url;
      setSource({ kind: target.kind, url: address });
      if (viaHlsJs) {
        const broken = (details: string) => problem(tRef.current('Video playback error: {message}', { message: details }));
        attachHls(element, target.url, broken).then((stop) => { if (cancelled) stop(); else detach = stop; }, (reason: Error) => broken(reason.message));
      } else {
        element.src = address;
        element.load();
      }
      element.play().catch((reason: Error) => {
        if (reason.name === 'AbortError') return;
        const text = tRef.current('Failed to play video: {message}', { message: reason.message });
        if (reason.name === 'NotAllowedError') fail(text);
        else problem(text);
      });
    };
    element.addEventListener('error', onError);
    if (canPlayHls(element) && !playlistFailed.has(video.id)) {
      resolveSource(video).then((resolved) => { if (!cancelled) begin(resolved); }, () => { if (!cancelled) begin({ kind: 'file', url: fileUrl(video) }); });
    } else begin({ kind: 'file', url: fileUrl(video) });
    return () => {
      cancelled = true;
      clearTimeout(reload);
      element.removeEventListener('error', onError);
      detach?.();
      if (element.currentTime > 0) resumeAt.current = element.currentTime;
      savePosition(element);
      element.pause();
      element.removeAttribute('src');
      element.load();
    };
  }, [attempt, savePosition, video]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return undefined;
    const onMetadata = () => {
      const target = resumeAt.current;
      resumeAt.current = 0;
      if (target > 0 && target < element.duration - 5) element.currentTime = target;
    };
    const onPlay = () => {
      // Something else started it (the TV, a stream that restarted), the pause stays
      if (userPaused.current) { element.pause(); return; }
      playingRef.current = true;
      setPlaying(true);
      reveal();
    };
    const onPause = () => {
      playingRef.current = false;
      setPlaying(false);
      setControls(true);
      setRow('buttons');
      setFocused('play');
      clearTimeout(hideTimer.current);
      savePosition();
    };
    const onEnded = () => {
      playingRef.current = false;
      setPlaying(false);
      setControls(true);
      removePlaybackItem(video.id);
      if (getSetting('autoplay') && nextRef.current) setCountdown(AUTOPLAY_SECONDS);
      else endTimer.current = setTimeout(onClose, 500);
    };
    const onWaiting = () => setBuffering(true);
    const onReady = () => { started.current = true; reloads.current = 0; refusals.current = 0; setWaiting(false); setBuffering(false); };
    const onPlaying = () => {
      onReady();
      if (reported.current) return;
      reported.current = true;
      onStartedRef.current?.(video);
    };
    const handlers: [string, () => void][] = [
      ['loadedmetadata', onMetadata], ['play', onPlay], ['pause', onPause], ['ended', onEnded],
      ['waiting', onWaiting], ['playing', onPlaying], ['canplay', onReady],
    ];
    handlers.forEach(([name, handler]) => element.addEventListener(name, handler));
    return () => handlers.forEach(([name, handler]) => element.removeEventListener(name, handler));
  }, [video, reveal, savePosition, onClose]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    const timer = setInterval(() => {
      const element = videoRef.current;
      if (element && !element.paused && !element.ended) savePosition();
    }, SAVE_EVERY_MS);
    const onHide = () => { if (document.visibilityState !== 'visible') savePosition(); };
    const onLeave = () => savePosition();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onLeave);
    return () => {
      clearInterval(timer);
      clearTimeout(hideTimer.current);
      clearTimeout(endTimer.current);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onLeave);
    };
  }, [savePosition]);

  const playNext = useCallback(() => {
    const target = nextRef.current;
    if (target) onPlayNextRef.current(target);
  }, []);

  useEffect(() => {
    if (countdown === null) return undefined;
    if (countdown <= 0) {
      setCountdown(null);
      playNext();
      return undefined;
    }
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, playNext]);

  const [counts, setCounts] = useState({ likes: 0, dislikes: 0 });
  useEffect(() => {
    let cancelled = false;
    getReactions(video.id).then((reactions) => {
      if (cancelled) return;
      setCounts({ likes: reactions.likes, dislikes: reactions.dislikes });
      setMine(reactions.mine);
    });
    if (video.channelId && loggedIn) isFollowing(video.channelId).then((value) => { if (!cancelled) setFollowingState(value); });
    return () => { cancelled = true; };
  }, [video.id, video.channelId, loggedIn]);

  const resume = useCallback(() => {
    const element = videoRef.current;
    if (!element) return;
    userPaused.current = false;
    if (stale.current) {
      stale.current = false;
      reloads.current = 0;
      setAttempt((count) => count + 1);
    } else void element.play();
  }, []);

  const pause = useCallback(() => {
    userPaused.current = true;
    videoRef.current?.pause();
  }, []);

  const togglePlay = useCallback(() => {
    const element = videoRef.current;
    if (!element) return;
    if (element.paused) resume();
    else pause();
  }, [resume, pause]);

  const react = async (type: Reaction) => {
    if (!loggedIn) return;
    const remove = mine === type;
    if (!(await setReaction(video.id, type, remove))) return;
    setCounts((previous) => {
      const updated = { ...previous };
      const key = type === 'like' ? 'likes' : 'dislikes';
      const other = type === 'like' ? 'dislikes' : 'likes';
      updated[key] = Math.max(0, updated[key] + (remove ? -1 : 1));
      if (!remove && mine) updated[other] = Math.max(0, updated[other] - 1);
      return updated;
    });
    setMine(remove ? null : type);
  };

  const follow = async () => {
    if (!loggedIn || !video.channelId) return;
    if (await setFollowing(video.channelId, `@${video.channelName}`, !following)) setFollowingState(!following);
  };

  const run = (control: Control) => {
    switch (control) {
      case 'channel':
        if (video.channelId) { onClose(); onOpenChannel(video.channelId, video.channelTitle); }
        break;
      case 'follow': void follow(); break;
      case 'favorites': toggleInCollection('favorites', video); break;
      case 'watchLater': toggleInCollection('watchLater', video); break;
      case 'skipBack': seek(-1, false); break;
      case 'play': togglePlay(); break;
      case 'skipForward': seek(1, false); break;
      case 'next': playNext(); break;
      case 'like': void react('like'); break;
      case 'dislike': void react('dislike'); break;
      case 'settings': setMenuOpen(true); break;
    }
  };

  const closeMenu = () => {
    setMenuOpen(false);
    reveal();
  };

  const previewChoice = useCallback((choice: MenuChoice, code: string | number) => {
    if (choice === 'aspect') setAspect(String(code));
    else setSpeed(Number(code));
  }, []);

  const select = (choice: MenuChoice, code: string | number) => {
    if (choice === 'aspect') {
      setAspect(String(code));
      showToast(t('Aspect ratio: {name}', { name: t(aspectOf(String(code)).name) }));
    } else {
      setSpeed(Number(code));
      showToast(t('Speed: {speed}', { speed: speedName(Number(code)) }));
    }
  };

  const retry = () => {
    const wait = error?.busy ? loadedAt.current + RETRY_COOLDOWN_MS - Date.now() : 0;
    if (wait > 0) {
      showToast(t('Please wait {seconds} s before trying again', { seconds: Math.ceil(wait / 1000) }));
      return;
    }
    reloads.current = 0;
    refusals.current = 0;
    playlistFailed.delete(video.id);
    setAttempt((count) => count + 1);
  };

  const statsRows = usePlaybackStats(videoRef, { video, aspect, speed, buffering, sourceUrl: source?.url ?? '', adaptive: source?.kind === 'hls', version: typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'dev' }, statsEnabled && statsOpen);

  useKeys((event) => {
    if (countdown !== null) {
      if (event.keyCode === KEY.ENTER) { setCountdown(null); playNext(); }
      else if (event.keyCode === KEY.WEBOS_BACK || event.keyCode === KEY.ESCAPE || event.keyCode === KEY.BACKSPACE || event.keyCode === KEY.STOP) setCountdown(null);
      return true;
    }
    const visible = controls;
    reveal();
    switch (event.keyCode) {
      case KEY.WEBOS_BACK:
      case KEY.ESCAPE:
      case KEY.BACKSPACE:
        if (visible) { setControls(false); clearTimeout(hideTimer.current); } else onClose();
        return true;
      case KEY.STOP: onClose(); return true;
      case KEY.ENTER:
        if (event.repeat || waiting) return true;
        if (error) retry();
        else if (row === 'topbar') onClose();
        else if (!visible) togglePlay();
        else run(row === 'progress' ? 'play' : focused);
        return true;
      case KEY.PLAY: resume(); return true;
      case KEY.PAUSE: pause(); return true;
      case KEY.PLAY_PAUSE:
      case KEY.MEDIA_PLAY_PAUSE: togglePlay(); return true;
      case KEY.REWIND: seek(-1); return true;
      case KEY.FAST_FORWARD: seek(1); return true;
      case KEY.LEFT:
      case KEY.RIGHT: {
        const direction = event.keyCode === KEY.LEFT ? -1 : 1;
        if (!visible) { setRow('progress'); seek(direction); }
        else if (row === 'progress') seek(direction);
        else if (row === 'buttons') {
          const at = controlList.indexOf(focused);
          const target = (at < 0 ? controlList.indexOf('play') : at) + direction;
          if (target >= 0 && target < controlList.length) setFocused(controlList[target]);
        }
        return true;
      }
      case KEY.UP:
        if (visible) setRow(row === 'buttons' ? 'progress' : backButton ? 'topbar' : 'progress');
        return true;
      case KEY.DOWN:
        if (visible) setRow(row === 'topbar' ? 'progress' : 'buttons');
        return true;
      default: return false;
    }
  }, { enabled: !menuOpen, priority: PRIORITY.player });

  const point = (event: React.MouseEvent, control: Control) => {
    if (!pointerMoved(event)) return;
    setRow('buttons');
    setFocused(control);
  };

  const active = (control: Control) => (controls && row === 'buttons' && focused === control ? ' pbtn--active' : '');
  const on = (state: boolean, tone = '') => (state ? ` pbtn--on${tone}` : '');
  const inWatchLater = lists.watchLater.some((entry) => entry.id === video.id);
  const inFavorites = lists.favorites.some((entry) => entry.id === video.id);

  return (
    <div className="player" onMouseMove={reveal}>
      <video ref={videoRef} className="player__video" style={{ objectFit: aspectOf(aspect).objectFit }} playsInline autoPlay />
      {buffering && !error && <div className="player__buffering"><Spinner scale={0.6} /></div>}
      {toast && <div className="player__toast">{toast}</div>}
      {error && <div className="player__error"><div>{error.text}</div><small>{t('Press OK to retry')}</small></div>}
      {statsEnabled && statsOpen && <StatsPanel rows={statsRows} />}
      {countdown !== null && next && (
        <div className="player__upNext">
          <div className="player__upNextThumb"><Thumb src={next.thumb} width={320} /></div>
          <div className="player__upNextText">
            <div className="player__upNextLabel">{t('Up next')}</div>
            <div className="player__upNextTitle">{next.title}</div>
            <div className="player__upNextCount">{t('Playing in {seconds} s', { seconds: countdown })}</div>
            <small>{t('OK plays it now, Back cancels')}</small>
          </div>
        </div>
      )}
      <div className={`player__controls${controls || menuOpen ? ' player__controls--visible' : ''}`}>
        <div className="player__top">
          {backButton && <div className={`pbtn pbtn--round${controls && row === 'topbar' ? ' pbtn--active' : ''}`} onClick={onClose} onMouseMove={(event) => { if (pointerMoved(event)) setRow('topbar'); }}><IconArrowLeft size={42} /></div>}
          <div className={`player__title${backButton ? '' : ' player__title--first'}`}>{video.title}</div>
        </div>
        <div className="player__bottom">
          <Timeline videoRef={videoRef} focused={controls && row === 'progress'} onActivity={reveal} />
          <div className="player__row">
            <div className="player__group player__group--left">
              <div className={`pbtn pbtn--avatar${active('channel')}`} onClick={() => run('channel')} onMouseMove={(event) => point(event, 'channel')}>
                <Avatar src={video.channelThumb} name={video.channelTitle} size={78} />
              </div>
              {canFollow && (
                <div className={`pbtn pbtn--round${on(following)}${active('follow')}`} onClick={() => run('follow')} onMouseMove={(event) => point(event, 'follow')}>
                  {following ? <IconHeartFilled size={36} /> : <IconHeart size={36} />}
                </div>
              )}
              <div className={`pbtn pbtn--round${on(inFavorites)}${active('favorites')}`} onClick={() => run('favorites')} onMouseMove={(event) => point(event, 'favorites')}>
                {inFavorites ? <IconStarFilled size={36} /> : <IconStar size={36} />}
              </div>
              <div className={`pbtn pbtn--round${on(inWatchLater)}${active('watchLater')}`} onClick={() => run('watchLater')} onMouseMove={(event) => point(event, 'watchLater')}>
                {inWatchLater ? <IconClockFilled size={36} /> : <IconClock size={36} />}
              </div>
            </div>
            <div className="player__group">
              <div className={`pbtn pbtn--round${active('skipBack')}`} onClick={() => run('skipBack')} onMouseMove={(event) => point(event, 'skipBack')}><IconRewindBackward10 size={34} /></div>
              <div className={`pbtn pbtn--play${active('play')}`} onClick={() => run('play')} onMouseMove={(event) => point(event, 'play')}>
                {playing ? <IconPlayerPause size={42} /> : <IconPlayerPlay size={42} />}
              </div>
              <div className={`pbtn pbtn--round${active('skipForward')}`} onClick={() => run('skipForward')} onMouseMove={(event) => point(event, 'skipForward')}><IconRewindForward10 size={34} /></div>
              {next && <div className={`pbtn pbtn--round${active('next')}`} onClick={() => run('next')} onMouseMove={(event) => point(event, 'next')}><IconPlayerTrackNext size={34} /></div>}
            </div>
            <div className="player__group player__group--right">
              <div className={`pbtn pbtn--round${on(mine === 'like')}${active('like')}`} onClick={() => run('like')} onMouseMove={(event) => point(event, 'like')}>
                <OdyseeIcon name="Fire" size={36} filled={mine === 'like'} />
              </div>
              <div className={`pbtn pbtn--round${on(mine === 'dislike', ' pbtn--slime')}${active('dislike')}`} onClick={() => run('dislike')} onMouseMove={(event) => point(event, 'dislike')}>
                <OdyseeIcon name="Slime" size={36} filled={mine === 'dislike'} />
              </div>
              <div className={`pbtn pbtn--round${active('settings')}`} onClick={() => run('settings')} onMouseMove={(event) => point(event, 'settings')}><IconSettings size={36} /></div>
            </div>
          </div>
          {(counts.likes > 0 || counts.dislikes > 0) && <div className="player__counts">{t('{count} like|{count} likes', { count: counts.likes })}</div>}
        </div>
      </div>
      {menuOpen && (
        <PlayerMenu
          aspect={aspect}
          speed={speed}
          statsOpen={statsEnabled ? statsOpen : undefined}
          onPreview={previewChoice}
          onSelect={select}
          onToggleStats={() => setStatsOpen((open) => !open)}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}
