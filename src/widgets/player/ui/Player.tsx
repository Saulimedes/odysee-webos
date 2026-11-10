import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  IconArrowLeft, IconClock, IconClockFilled, IconHeart, IconHeartFilled, IconPlayerPause, IconPlayerPlay,
  IconPlayerTrackNext, IconPlayerTrackPrev, IconSettings, IconStar, IconStarFilled,
} from '@tabler/icons-react';
import { ASPECT_RATIOS, KEY, PLAYBACK_SPEEDS, VIDEO_QUALITIES, getSetting, useSetting } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { PRIORITY, pointerMoved, useKeys, useRemembered } from '@/shared/lib';
import { Avatar, OdyseeIcon, Spinner } from '@/shared/ui';
import { queryClaims, streamSources, type Video } from '@/entities/video';
import { isLoggedIn, useSession } from '@/entities/session';
import { toggleInCollection, useCollections } from '@/features/collections';
import { isFollowing, setFollowing } from '@/features/following';
import { getSavedPosition, removePlaybackItem, savePlaybackPosition } from '@/features/playback-history';
import { getReactions, setReaction, type Reaction } from '../api/reactions';
import { useOutputWindow } from '../model/useOutputWindow';
import { usePlaybackSpeed } from '../model/usePlaybackSpeed';
import { usePlaybackStats } from '../model/usePlaybackStats';
import { useSeek } from '../model/useSeek';
import { PlayerMenu, type MenuChoice } from './PlayerMenu';
import { StatsPanel } from './StatsPanel';
import { Timeline } from './Timeline';

const CONTROLS = ['channel', 'follow', 'favorites', 'watchLater', 'skipBack', 'play', 'skipForward', 'like', 'dislike', 'settings'] as const;
type Control = (typeof CONTROLS)[number];
type Row = 'topbar' | 'progress' | 'buttons';

const HIDE_AFTER_MS = 4000;
const SAVE_EVERY_MS = 10000;
const RELOAD_AFTER_MS = 800;
const MAX_RELOADS = 3;
const TOAST_MS = 3000;

const aspectOf = (code: string) => ASPECT_RATIOS.find((aspect) => aspect.code === code) ?? ASPECT_RATIOS[0];
const speedName = (speed: number) => PLAYBACK_SPEEDS.find((option) => option.code === speed)?.name ?? `${speed}\u00d7`;
const qualityName = (code: string) => VIDEO_QUALITIES.find((option) => option.code === code)?.name ?? code;

interface Props {
  video: Video;
  startAt?: number;
  onClose: () => void;
  onPlayNext: (video: Video) => void;
  onOpenChannel: (id: string, name: string) => void;
}

export function Player({ video, startAt, onClose, onPlayNext, onOpenChannel }: Props) {
  const t = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;
  const { user } = useSession();
  const lists = useCollections();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const playingRef = useRef(false);
  const nextRef = useRef<Video | null>(null);
  const endTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [initialStart] = useState(() => startAt ?? (getSetting('resume') ? getSavedPosition(video.id) : 0));
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [controls, setControls] = useState(true);
  const [row, setRow] = useState<Row>('buttons');
  const [focused, setFocused] = useState<Control>('play');
  const [following, setFollowingState] = useState(false);
  const [mine, setMine] = useState<Reaction | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [source, setSource] = useState({ key: '', index: 0 });
  const startedRef = useRef(false);
  const reloads = useRef(0);
  const userPaused = useRef(false);
  const stale = useRef(false);
  const [aspect, setAspect] = useState(() => aspectOf(getSetting('aspectRatio')).code);
  const [speed, setSpeed] = useState(() => getSetting('playbackSpeed'));
  const [quality, setQuality] = useState(() => getSetting('quality'));
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
  const controlList = useMemo(() => CONTROLS.filter((control) => control !== 'follow' || canFollow), [canFollow]);

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

  const sourceKey = `${video.id}:${quality}`;
  const sources = useMemo(() => streamSources(video, quality), [video, quality]);
  const sourceIndex = source.key === sourceKey ? source.index : 0;

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return undefined;
    setError(null);
    setBuffering(true);
    startedRef.current = false;
    stale.current = false;
    userPaused.current = false;
    let settled = false;
    let reload: ReturnType<typeof setTimeout> | undefined;
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      if (!startedRef.current && sourceIndex + 1 < sources.length) setSource({ key: sourceKey, index: sourceIndex + 1 });
      // A paused stream drops its connection, loading it again would start the video by itself
      else if (startedRef.current && element.paused) stale.current = true;
      else if (startedRef.current && reloads.current < MAX_RELOADS) { reloads.current += 1; reload = setTimeout(() => setAttempt((count) => count + 1), RELOAD_AFTER_MS); }
      else setError(message);
    };
    const onFail = () => fail(tRef.current('Video playback error: {message}', { message: element.error?.message || tRef.current('Unknown error') }));
    element.addEventListener('error', onFail);
    element.src = sources[sourceIndex];
    element.load();
    element.play().catch((reason: Error) => { if (reason.name !== 'AbortError') fail(tRef.current('Failed to play video: {message}', { message: reason.message })); });
    return () => {
      clearTimeout(reload);
      element.removeEventListener('error', onFail);
      if (element.currentTime > 0) resumeAt.current = element.currentTime;
      savePosition(element);
      element.pause();
      element.removeAttribute('src');
      element.load();
    };
  }, [sources, sourceIndex, sourceKey, attempt, savePosition]);

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
      const next = nextRef.current;
      endTimer.current = setTimeout(() => (getSetting('autoplay') && next ? onPlayNext(next) : onClose()), 500);
    };
    const onWaiting = () => setBuffering(true);
    const onReady = () => { startedRef.current = true; reloads.current = 0; setBuffering(false); };
    const handlers: [string, () => void][] = [
      ['loadedmetadata', onMetadata], ['play', onPlay], ['pause', onPause], ['ended', onEnded],
      ['waiting', onWaiting], ['playing', onReady], ['canplay', onReady],
    ];
    handlers.forEach(([name, handler]) => element.addEventListener(name, handler));
    return () => handlers.forEach(([name, handler]) => element.removeEventListener(name, handler));
  }, [video.id, reveal, savePosition, onClose, onPlayNext]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    const timer = setInterval(() => {
      const element = videoRef.current;
      if (element && !element.paused && !element.ended) savePosition();
    }, SAVE_EVERY_MS);
    return () => { clearInterval(timer); clearTimeout(hideTimer.current); clearTimeout(endTimer.current); };
  }, [savePosition]);

  useEffect(() => {
    let cancelled = false;
    nextRef.current = null;
    if (video.channelId) {
      queryClaims({ channelIds: [video.channelId], order: 'new', days: 90, pageSize: 10 }, { background: true })
        .then((videos) => { if (!cancelled) nextRef.current = videos.find((candidate) => candidate.id !== video.id) || null; })
        .catch((reason) => console.error('Failed to load related videos', reason));
    }
    return () => { cancelled = true; };
  }, [video.id, video.channelId]);

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
      const next = { ...previous };
      const key = type === 'like' ? 'likes' : 'dislikes';
      const other = type === 'like' ? 'dislikes' : 'likes';
      next[key] = Math.max(0, next[key] + (remove ? -1 : 1));
      if (!remove && mine) next[other] = Math.max(0, next[other] - 1);
      return next;
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
      case 'like': void react('like'); break;
      case 'dislike': void react('dislike'); break;
      case 'settings': setMenuOpen(true); break;
    }
  };

  const closeMenu = () => {
    setMenuOpen(false);
    reveal();
  };

  const select = (choice: MenuChoice, code: string | number) => {
    if (choice === 'aspect') {
      setAspect(String(code));
      showToast(t('Aspect ratio: {name}', { name: t(aspectOf(String(code)).name) }));
    } else if (choice === 'speed') {
      setSpeed(Number(code));
      showToast(t('Speed: {speed}', { speed: speedName(Number(code)) }));
    } else if (String(code) !== quality) {
      setQuality(String(code));
      showToast(t('Quality: {name}', { name: t(qualityName(String(code))) }));
    }
  };

  const statsRows = usePlaybackStats(videoRef, { video, quality, aspect, speed, buffering, sourceUrl: sources[sourceIndex], version: typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'dev' }, statsEnabled && statsOpen);

  useKeys((event) => {
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
        if (error) { reloads.current = 0; setSource({ key: sourceKey, index: 0 }); setAttempt((count) => count + 1); }
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
          const next = controlList.indexOf(focused) + direction;
          if (next >= 0 && next < controlList.length) setFocused(controlList[next]);
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
      {error && <div className="player__error"><div>{error}</div><small>{t('Press OK to retry')}</small></div>}
      {statsEnabled && statsOpen && <StatsPanel rows={statsRows} />}
      <div className={`player__controls${controls ? ' player__controls--visible' : ''}`}>
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
              <div className={`pbtn pbtn--round${active('skipBack')}`} onClick={() => run('skipBack')} onMouseMove={(event) => point(event, 'skipBack')}><IconPlayerTrackPrev size={34} /></div>
              <div className={`pbtn pbtn--play${active('play')}`} onClick={() => run('play')} onMouseMove={(event) => point(event, 'play')}>
                {playing ? <IconPlayerPause size={42} /> : <IconPlayerPlay size={42} />}
              </div>
              <div className={`pbtn pbtn--round${active('skipForward')}`} onClick={() => run('skipForward')} onMouseMove={(event) => point(event, 'skipForward')}><IconPlayerTrackNext size={34} /></div>
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
          quality={quality}
          statsOpen={statsEnabled ? statsOpen : undefined}
          onSelect={select}
          onToggleStats={() => setStatsOpen((open) => !open)}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}
