import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IconArrowLeft, IconClock, IconClockFilled, IconHeart, IconHeartFilled, IconPlayerPause, IconPlayerPlay,
  IconPlayerTrackNext, IconPlayerTrackPrev, IconStar, IconStarFilled,
} from '@tabler/icons-react';
import { KEY, getSetting } from '@/shared/config';
import { PRIORITY, useKeys } from '@/shared/lib';
import { Avatar, OdyseeIcon, Spinner } from '@/shared/ui';
import { queryClaims, streamUrl, type Video } from '@/entities/video';
import { isLoggedIn, useSession } from '@/entities/session';
import { toggleInCollection, useCollections } from '@/features/collections';
import { isFollowing, setFollowing } from '@/features/following';
import { getSavedPosition, removePlaybackItem, savePlaybackPosition } from '@/features/playback-history';
import { getReactions, setReaction, type Reaction } from '../api/reactions';
import { useSeek } from '../model/useSeek';
import { Timeline } from './Timeline';

const CONTROLS = ['channel', 'follow', 'favorites', 'watchLater', 'skipBack', 'play', 'skipForward', 'like', 'dislike'] as const;
type Control = (typeof CONTROLS)[number];
type Row = 'topbar' | 'progress' | 'buttons';

const HIDE_AFTER_MS = 4000;
const SAVE_EVERY_MS = 10000;

interface Props {
  video: Video;
  startAt?: number;
  onClose: () => void;
  onPlayNext: (video: Video) => void;
  onOpenChannel: (id: string, name: string) => void;
}

export function Player({ video, startAt, onClose, onPlayNext, onOpenChannel }: Props) {
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
  const seek = useSeek(videoRef);
  const loggedIn = Boolean(user) && isLoggedIn();

  const reveal = useCallback(() => {
    setControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => { if (playingRef.current) setControls(false); }, HIDE_AFTER_MS);
  }, []);

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
    element.src = streamUrl(video, getSetting('quality'));
    element.load();
    element.play().catch((reason: Error) => setError(`Failed to play video: ${reason.message}`));
    return () => {
      savePosition(element);
      element.pause();
      element.removeAttribute('src');
      element.load();
    };
  }, [video, attempt, savePosition]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return undefined;
    const onMetadata = () => {
      if (initialStart > 0 && element.currentTime === 0 && initialStart < element.duration - 5) element.currentTime = initialStart;
    };
    const onPlay = () => { playingRef.current = true; setPlaying(true); reveal(); };
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
    const onError = () => setError(`Video playback error: ${element.error?.message || 'Unknown error'}`);
    const onWaiting = () => setBuffering(true);
    const onReady = () => setBuffering(false);
    const handlers: [string, () => void][] = [
      ['loadedmetadata', onMetadata], ['play', onPlay], ['pause', onPause], ['ended', onEnded], ['error', onError],
      ['waiting', onWaiting], ['playing', onReady], ['canplay', onReady],
    ];
    handlers.forEach(([name, handler]) => element.addEventListener(name, handler));
    return () => handlers.forEach(([name, handler]) => element.removeEventListener(name, handler));
  }, [video.id, initialStart, reveal, savePosition, onClose, onPlayNext]);

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

  const togglePlay = useCallback(() => {
    const element = videoRef.current;
    if (!element) return;
    if (element.paused) void element.play();
    else element.pause();
  }, []);

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
    }
  };

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
        if (error) setAttempt((count) => count + 1);
        else if (row === 'topbar') onClose();
        else if (!visible) togglePlay();
        else run(row === 'progress' ? 'play' : focused);
        return true;
      case KEY.PLAY: void videoRef.current?.play(); return true;
      case KEY.PAUSE: videoRef.current?.pause(); return true;
      case KEY.PLAY_PAUSE:
      case KEY.MEDIA_PLAY_PAUSE: togglePlay(); return true;
      case KEY.REWIND: seek(-1); return true;
      case KEY.FAST_FORWARD: seek(1); return true;
      case KEY.LEFT:
      case KEY.RIGHT: {
        const direction = event.keyCode === KEY.LEFT ? -1 : 1;
        if (!visible || row === 'progress') seek(direction);
        else if (row === 'buttons') {
          const next = CONTROLS.indexOf(focused) + direction;
          if (next >= 0 && next < CONTROLS.length) setFocused(CONTROLS[next]);
        }
        return true;
      }
      case KEY.UP:
        if (visible) setRow(row === 'buttons' ? 'progress' : 'topbar');
        return true;
      case KEY.DOWN:
        if (visible) setRow(row === 'topbar' ? 'progress' : 'buttons');
        return true;
      default: return false;
    }
  }, { priority: PRIORITY.player });

  const active = (control: Control) => (controls && row === 'buttons' && focused === control ? ' pbtn--active' : '');
  const on = (state: boolean, tone = '') => (state ? ` pbtn--on${tone}` : '');
  const inWatchLater = lists.watchLater.some((entry) => entry.id === video.id);
  const inFavorites = lists.favorites.some((entry) => entry.id === video.id);

  return (
    <div className="player" onMouseMove={reveal}>
      <video ref={videoRef} className="player__video" playsInline autoPlay crossOrigin="anonymous" />
      {buffering && !error && <div className="player__buffering"><Spinner /></div>}
      {error && <div className="player__error"><div>{error}</div><small>Press OK to retry</small></div>}
      <div className={`player__controls${controls ? ' player__controls--visible' : ''}`}>
        <div className="player__top">
          <div className={`pbtn pbtn--round${controls && row === 'topbar' ? ' pbtn--active' : ''}`} onClick={onClose}><IconArrowLeft size={42} /></div>
          <div className="player__title">{video.title}</div>
        </div>
        <div className="player__bottom">
          <Timeline videoRef={videoRef} focused={controls && row === 'progress'} />
          <div className="player__row">
            <div className="player__group player__group--left">
              <div className={`pbtn pbtn--avatar${active('channel')}`} onClick={() => run('channel')}>
                <Avatar src={video.channelThumb} name={video.channelTitle} size={78} />
              </div>
              <div className={`pbtn pbtn--round${on(following)}${active('follow')}`} onClick={() => run('follow')}>
                {following ? <IconHeartFilled size={36} /> : <IconHeart size={36} />}
              </div>
              <div className={`pbtn pbtn--round${on(inFavorites)}${active('favorites')}`} onClick={() => run('favorites')}>
                {inFavorites ? <IconStarFilled size={36} /> : <IconStar size={36} />}
              </div>
              <div className={`pbtn pbtn--round${on(inWatchLater)}${active('watchLater')}`} onClick={() => run('watchLater')}>
                {inWatchLater ? <IconClockFilled size={36} /> : <IconClock size={36} />}
              </div>
            </div>
            <div className="player__group">
              <div className={`pbtn pbtn--round${active('skipBack')}`} onClick={() => run('skipBack')}><IconPlayerTrackPrev size={34} /></div>
              <div className={`pbtn pbtn--play${active('play')}`} onClick={() => run('play')}>
                {playing ? <IconPlayerPause size={42} /> : <IconPlayerPlay size={42} />}
              </div>
              <div className={`pbtn pbtn--round${active('skipForward')}`} onClick={() => run('skipForward')}><IconPlayerTrackNext size={34} /></div>
            </div>
            <div className="player__group player__group--right">
              <div className={`pbtn pbtn--round${on(mine === 'like')}${active('like')}`} onClick={() => run('like')}>
                <OdyseeIcon name="Fire" size={36} filled={mine === 'like'} />
              </div>
              <div className={`pbtn pbtn--round${on(mine === 'dislike', ' pbtn--slime')}${active('dislike')}`} onClick={() => run('dislike')}>
                <OdyseeIcon name="Slime" size={36} filled={mine === 'dislike'} />
              </div>
            </div>
          </div>
          {(counts.likes > 0 || counts.dislikes > 0) && <div className="player__counts">{counts.likes} likes</div>}
        </div>
      </div>
    </div>
  );
}
