import { useEffect, useRef, useState } from 'react';
import { IconAdjustmentsHorizontal, IconSearch } from '@tabler/icons-react';
import { KEY } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { PRIORITY, isTextField, pointerMoved, useDebounced, useKeys, useNav, useRemembered } from '@/shared/lib';
import { Spinner } from '@/shared/ui';
import { ChannelGrid, VideoGrid } from '@/widgets/item-grid';
import { searchChannelPage, searchVideoPage } from '../api/search';
import { DEFAULT_FILTERS, filtersKey, isFiltered, type SearchFilters } from '../model/filters';
import { FilterMenu } from './FilterMenu';
import { useSearchResults } from './useSearchResults';

type Zone = 'input' | 'filters' | 'type' | 'results';
type Kind = 'videos' | 'channels';

const MIN_QUERY = 3;
const DEBOUNCE_MS = 300;

export function SearchPage() {
  const t = useTranslation();
  const nav = useNav<unknown>();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useRemembered('search:text', '');
  const [kind, setKind] = useRemembered<Kind>('search:kind', 'videos');
  const [zone, setZone] = useRemembered<Zone>('search:zone', 'input');
  const [filters, setFilters] = useRemembered<SearchFilters>('search:filters', DEFAULT_FILTERS);
  const [menuOpen, setMenuOpen] = useState(false);
  const debounced = useDebounced(text, DEBOUNCE_MS);
  const key = debounced.length >= MIN_QUERY ? `${kind}:${debounced}` : null;
  const videoKey = key && `${key}:${filtersKey(filters)}`;
  const videos = useSearchResults(kind === 'videos' ? videoKey : null, (from, isCurrent) => searchVideoPage(debounced, from, isCurrent, filters));
  const channels = useSearchResults(kind === 'channels' ? key : null, (from, isCurrent) => searchChannelPage(debounced, from, isCurrent));
  const active = kind === 'videos' ? videos : channels;
  const hasResults = active.items.length > 0;
  const enabled = !nav.sidebarFocused;

  const focusInput = () => { setZone('input'); inputRef.current?.focus(); };
  const enter = (target: Zone) => {
    inputRef.current?.blur();
    setZone(target);
  };

  useEffect(() => {
    if (zone === 'input') inputRef.current?.focus();
  }, []);

  useKeys((event) => {
    if (isTextField(document.activeElement)) {
      if (event.keyCode === KEY.DOWN) {
        inputRef.current?.blur();
        setZone('type');
        return true;
      }
      if (event.keyCode === KEY.LEFT && text === '') {
        inputRef.current?.blur();
        nav.focusSidebar();
        return true;
      }
      const input = inputRef.current;
      if (event.keyCode === KEY.RIGHT && kind === 'videos' && input && input.selectionStart === input.value.length && input.selectionEnd === input.value.length) {
        input.blur();
        setZone('filters');
        return true;
      }
      return false;
    }
    if (zone === 'input') {
      if (event.keyCode === KEY.DOWN) { setZone('type'); return true; }
      if (event.keyCode === KEY.LEFT && text === '') { nav.focusSidebar(); return true; }
      if (event.keyCode === KEY.ENTER) { inputRef.current?.focus(); return true; }
      if (event.keyCode === KEY.RIGHT && kind === 'videos') { setZone('filters'); return true; }
      return false;
    }
    if (zone === 'filters') {
      switch (event.keyCode) {
        case KEY.LEFT: focusInput(); return true;
        case KEY.DOWN: setZone('type'); return true;
        case KEY.ENTER: setMenuOpen(true); return true;
        case KEY.UP:
        case KEY.RIGHT: return true;
        default: return false;
      }
    }
    if (zone === 'type') {
      switch (event.keyCode) {
        case KEY.UP: focusInput(); return true;
        case KEY.DOWN: if (hasResults) setZone('results'); return true;
        case KEY.LEFT: if (kind === 'videos') nav.focusSidebar(); else setKind('videos'); return true;
        case KEY.RIGHT: setKind('channels'); return true;
        default: return false;
      }
    }
    return false;
  }, { enabled: enabled && !menuOpen, priority: PRIORITY.content });

  const resultsHeight = window.innerHeight - 250;
  const inResults = zone === 'results' && enabled;

  return (
    <div className="page searchPage">
      <div className={`searchInput${zone === 'input' && enabled ? ' searchInput--active' : ''}`}>
        <IconSearch size={36} />
        <input
          ref={inputRef}
          type="text"
          value={text}
          placeholder={t('Search Odysee...')}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setText(event.target.value)}
          onFocus={() => setZone('input')}
        />
        {(videos.loading || channels.loading) && <Spinner inline />}
        {kind === 'videos' && (
          <div
            className={`searchInput__filters${zone === 'filters' && enabled ? ' searchInput__filters--active' : ''}${isFiltered(filters) ? ' searchInput__filters--on' : ''}`}
            onClick={() => setMenuOpen(true)}
            onMouseMove={(event) => { if (zone !== 'filters' && pointerMoved(event)) enter('filters'); }}
          >
            <IconAdjustmentsHorizontal size={36} />
          </div>
        )}
      </div>
      <div
        className={`tabs${zone === 'type' && enabled ? ' tabs--active' : ''}`}
        onMouseMove={(event) => { if (zone !== 'type' && pointerMoved(event)) enter('type'); }}
      >
        <span className={kind === 'videos' ? 'tab tab--on' : 'tab'} onClick={() => setKind('videos')}>{t('Videos')}</span>
        <span className={kind === 'channels' ? 'tab tab--on' : 'tab'} onClick={() => setKind('channels')}>{t('Channels')}</span>
      </div>
      <div className="searchResults" onMouseMove={(event) => { if (zone !== 'results' && hasResults && pointerMoved(event)) enter('results'); }}>
        {kind === 'videos' ? (
          <VideoGrid
            stateKey={`search:videos:${debounced}:${filtersKey(filters)}`}
            videos={videos.items}
            loading={videos.loading}
            loadingMore={videos.loadingMore}
            emptyTitle={key ? t('No results found') : t('Type at least 3 characters')}
            emptyIcon={<IconSearch size={64} />}
            onLoadMore={videos.loadMore}
            onTopEdge={() => setZone('type')}
            enabled={inResults}
            height={resultsHeight}
          />
        ) : (
          <ChannelGrid
            stateKey={`search:channels:${debounced}`}
            channels={channels.items}
            loading={channels.loading}
            loadingMore={channels.loadingMore}
            emptyTitle={key ? t('No results found') : t('Type at least 3 characters')}
            onSelect={(channel) => nav.openChannel(channel.id, channel.title)}
            onLoadMore={channels.loadMore}
            onTopEdge={() => setZone('type')}
            enabled={inResults}
            height={resultsHeight}
          />
        )}
      </div>
      {menuOpen && <FilterMenu filters={filters} onChange={setFilters} onClose={() => setMenuOpen(false)} />}
    </div>
  );
}
