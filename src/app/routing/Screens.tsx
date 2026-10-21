import { lazy, Suspense } from 'react';
import { ErrorBoundary, Spinner } from '@/shared/ui';
import type { User } from '@/entities/session';
import { Home } from '@/pages/home';

const SearchPage = lazy(() => import('@/pages/search').then((module) => ({ default: module.SearchPage })));
const LoginPage = lazy(() => import('@/pages/login').then((module) => ({ default: module.LoginPage })));
const SettingsPage = lazy(() => import('@/pages/settings').then((module) => ({ default: module.SettingsPage })));
const FeedPage = lazy(() => import('@/pages/feed').then((module) => ({ default: module.FeedPage })));
const CategoriesPage = lazy(() => import('@/pages/categories').then((module) => ({ default: module.CategoriesPage })));
const FollowingPage = lazy(() => import('@/pages/following').then((module) => ({ default: module.FollowingPage })));
const PlaylistsPage = lazy(() => import('@/pages/playlists').then((module) => ({ default: module.PlaylistsPage })));
const LibraryPage = lazy(() => import('@/pages/library').then((module) => ({ default: module.LibraryPage })));
const ListPage = lazy(() => import('@/pages/library').then((module) => ({ default: module.ListPage })));

interface Props {
  screen: string;
  channel: { id: string; name: string } | null;
  onLoggedIn: (user: User) => void;
  onSignOut: () => void;
}

const LIST_SCREENS = ['continue', 'history', 'watch-later', 'favorites'] as const;
type ListScreen = (typeof LIST_SCREENS)[number];
const isListScreen = (screen: string): screen is ListScreen => (LIST_SCREENS as readonly string[]).includes(screen);

function Screen({ screen, channel, onLoggedIn, onSignOut }: Props) {
  switch (screen) {
    case 'search': return <SearchPage />;
    case 'login': return <LoginPage onLoggedIn={onLoggedIn} />;
    case 'settings': return <SettingsPage onSignOut={onSignOut} />;
    case 'discover': return <FeedPage source={{ kind: 'discover' }} />;
    case 'featured': return <FeedPage source={{ kind: 'featured' }} />;
    case 'categories': return <CategoriesPage />;
    case 'following': return <FollowingPage />;
    case 'playlists': return <PlaylistsPage />;
    case 'library': return <LibraryPage />;
    case 'channel': return channel ? <FeedPage source={{ kind: 'channel', id: channel.id, name: channel.name }} /> : <Home />;
    default: return isListScreen(screen) ? <ListPage section={screen} /> : <Home />;
  }
}

export function Screens(props: Props) {
  return (
    <ErrorBoundary key={props.screen}>
      <Suspense fallback={<div className="center"><Spinner /></div>}>
        <Screen {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}
