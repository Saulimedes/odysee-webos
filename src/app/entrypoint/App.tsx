import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { KEY } from '@/shared/config';
import { NavContext, pointerMoved, useKeys, useWheelNavigation, type NavApi } from '@/shared/lib';
import { Spinner } from '@/shared/ui';
import type { Video } from '@/entities/video';
import { addToHistory, flushCollections, removeFromCollection } from '@/features/collections';
import { Sidebar } from '@/widgets/sidebar';
import { Screens } from '../routing/Screens';
import { handleLogin, handleLogout } from '../model/account';

const loadPlayer = () => import('@/widgets/player');
const Player = lazy(() => loadPlayer().then((module) => ({ default: module.Player })));
const VideoMenu = lazy(() => import('@/widgets/video-menu').then((module) => ({ default: module.VideoMenu })));
const PLAYER_PREFETCH_MS = 3000;

const BACK_TARGET: Record<string, string> = { continue: 'library', history: 'library', 'watch-later': 'library', favorites: 'library' };
const BACK_PRIORITY = 1;
const START_TIMEOUT_MS = 8000;

export default function App() {
  const [screen, setScreen] = useState('home');
  const [sidebarFocused, setSidebarFocused] = useState(false);
  const [channel, setChannel] = useState<{ id: string; name: string } | null>(null);
  const [playing, setPlaying] = useState<{ video: Video; queue?: Video[] } | null>(null);
  const [menu, setMenu] = useState<Video | null>(null);
  useWheelNavigation();

  useEffect(() => {
    const giveUp = setTimeout(() => window.__odyseeReady?.(), START_TIMEOUT_MS);
    const warmUp = setTimeout(() => { void loadPlayer(); }, PLAYER_PREFETCH_MS);
    const flush = () => flushCollections();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      clearTimeout(giveUp);
      clearTimeout(warmUp);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, []);

  const go = useCallback((target: string) => {
    setScreen(target);
    setSidebarFocused(false);
  }, []);

  const play = useCallback((video: Video, queue?: Video[]) => setPlaying({ video, queue }), []);

  const started = useCallback((video: Video) => {
    removeFromCollection('watchLater', video.id);
    addToHistory(video);
  }, []);

  const nav = useMemo<NavApi<Video>>(() => ({
    sidebarFocused,
    focusSidebar: () => setSidebarFocused(true),
    play,
    openChannel: (id, name) => { setChannel({ id, name }); go('channel'); },
    openMenu: setMenu,
    go,
  }), [sidebarFocused, play, go]);

  useKeys((event) => {
    if (event.keyCode === KEY.LEFT) {
      setSidebarFocused(true);
      return true;
    }
    if (event.keyCode !== KEY.WEBOS_BACK && event.keyCode !== KEY.ESCAPE && event.keyCode !== KEY.BACKSPACE) return false;
    if (sidebarFocused) {
      setSidebarFocused(false);
      return true;
    }
    if (screen !== 'home') {
      go(BACK_TARGET[screen] || 'home');
      return true;
    }
    if (window.webOS?.platformBack) window.webOS.platformBack();
    else window.close();
    return true;
  }, { enabled: !playing, priority: BACK_PRIORITY });

  return (
    <NavContext.Provider value={nav as unknown as NavApi}>
      {playing ? (
        <Suspense fallback={<div className="player"><div className="player__buffering"><Spinner scale={0.6} /></div></div>}>
          <Player
            key={playing.video.id}
            video={playing.video}
            queue={playing.queue}
            onClose={() => setPlaying(null)}
            onPlayNext={(next) => play(next, playing.queue)}
            onOpenChannel={nav.openChannel}
            onStarted={started}
          />
        </Suspense>
      ) : (
        <div className="appShell">
          <Sidebar selected={screen} focused={sidebarFocused} onSelect={go} onLeave={() => setSidebarFocused(false)} onFocus={() => setSidebarFocused(true)} />
          <main className="appShell__main" onMouseMove={(event) => { if (sidebarFocused && pointerMoved(event)) setSidebarFocused(false); }}>
            <Screens
              screen={screen}
              channel={channel}
              onLoggedIn={() => { void handleLogin(); go('home'); }}
              onSignOut={() => { void handleLogout().then(() => go('home')); }}
            />
          </main>
          {menu && (
            <Suspense fallback={null}>
              <VideoMenu video={menu} onPlay={play} onOpenChannel={nav.openChannel} onClose={() => setMenu(null)} />
            </Suspense>
          )}
        </div>
      )}
    </NavContext.Provider>
  );
}
