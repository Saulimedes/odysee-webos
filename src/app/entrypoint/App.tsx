import { useCallback, useEffect, useMemo, useState } from 'react';
import { KEY } from '@/shared/config';
import { NavContext, useKeys, type NavApi } from '@/shared/lib';
import type { Video } from '@/entities/video';
import { addToHistory, flushCollections, removeFromCollection } from '@/features/collections';
import { Player } from '@/widgets/player';
import { Sidebar } from '@/widgets/sidebar';
import { Screens } from '../routing/Screens';
import { handleLogin, handleLogout } from '../model/account';

const BACK_TARGET: Record<string, string> = { continue: 'library', history: 'library', 'watch-later': 'library', favorites: 'library' };
const BACK_PRIORITY = 1;

export default function App() {
  const [screen, setScreen] = useState('home');
  const [sidebarFocused, setSidebarFocused] = useState(false);
  const [channel, setChannel] = useState<{ id: string; name: string } | null>(null);
  const [playing, setPlaying] = useState<{ video: Video; startAt?: number } | null>(null);

  useEffect(() => {
    window.__odyseeReady?.();
    const flush = () => flushCollections();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, []);

  const go = useCallback((target: string) => {
    setScreen(target);
    setSidebarFocused(false);
  }, []);

  const play = useCallback((video: Video, startAt?: number) => {
    removeFromCollection('watchLater', video.id);
    addToHistory(video);
    setPlaying({ video, startAt });
  }, []);

  const nav = useMemo<NavApi<Video>>(() => ({
    sidebarFocused,
    focusSidebar: () => setSidebarFocused(true),
    play,
    openChannel: (id, name) => { setChannel({ id, name }); go('channel'); },
    go,
  }), [sidebarFocused, play, go]);

  useKeys((event) => {
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
        <Player
          key={playing.video.id}
          video={playing.video}
          startAt={playing.startAt}
          onClose={() => setPlaying(null)}
          onPlayNext={(next) => play(next)}
          onOpenChannel={nav.openChannel}
        />
      ) : (
        <div className="appShell">
          <Sidebar selected={screen} focused={sidebarFocused} onSelect={go} onLeave={() => setSidebarFocused(false)} />
          <main className="appShell__main">
            <Screens
              screen={screen}
              channel={channel}
              onLoggedIn={() => { void handleLogin(); go('home'); }}
              onSignOut={() => { void handleLogout().then(() => go('home')); }}
            />
          </main>
        </div>
      )}
    </NavContext.Provider>
  );
}
