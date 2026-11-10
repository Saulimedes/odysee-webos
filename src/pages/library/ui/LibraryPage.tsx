import { useMemo } from 'react';
import { IconHistory } from '@tabler/icons-react';
import { KEY } from '@/shared/config';
import { PRIORITY, pointerMoved, thumbUrl, useKeys, useNav, useRemembered } from '@/shared/lib';
import { useTranslation } from '@/shared/i18n';
import { EmptyState, PageTitle } from '@/shared/ui';
import { VideoRows, type VideoRow } from '@/widgets/video-rows';
import { SECTIONS } from './sections';
import { useSectionVideos } from './useSectionVideos';

const PREVIEW = 10;

export function LibraryPage() {
  const t = useTranslation();
  const nav = useNav<unknown>();
  const { videos, progress } = useSectionVideos();
  const [zone, setZone] = useRemembered<'cards' | 'rows'>('library:zone', 'cards');
  const [cardIndex, setCardIndex] = useRemembered('library:card', 0);

  const sections = useMemo(() => SECTIONS.filter((section) => videos[section.id].length > 0), [videos]);
  const rows = useMemo<VideoRow[]>(() => sections.map((section) => ({
    id: section.id, title: t(section.title), videos: videos[section.id].slice(0, PREVIEW), status: 'ready', progress,
  })), [sections, videos, progress, t]);
  const index = Math.min(cardIndex, Math.max(0, sections.length - 1));
  const cardsActive = zone === 'cards' && !nav.sidebarFocused;

  useKeys((event) => {
    switch (event.keyCode) {
      case KEY.LEFT:
        if (index === 0) nav.focusSidebar();
        else setCardIndex(index - 1);
        return true;
      case KEY.RIGHT: setCardIndex(Math.min(sections.length - 1, index + 1)); return true;
      case KEY.DOWN: setZone('rows'); return true;
      case KEY.ENTER: nav.go(sections[index].id); return true;
      default: return false;
    }
  }, { enabled: cardsActive && sections.length > 0, priority: PRIORITY.content });

  if (sections.length === 0) {
    return (
      <div className="page">
        <PageTitle>{t('Library')}</PageTitle>
        <EmptyState icon={<IconHistory size={80} />} title={t('Your library is empty')} hint={t('Videos you watch, save, or favorite will appear here')} />
      </div>
    );
  }

  return (
    <div className="page">
      <PageTitle>{t('Library')}</PageTitle>
      <div className="libraryCards" onMouseMove={(event) => { if (zone !== 'cards' && pointerMoved(event)) setZone('cards'); }}>
        {sections.map((section, position) => {
          const first = videos[section.id][0];
          return (
            <div
              key={section.id}
              className={`libraryCard${cardsActive && position === index ? ' libraryCard--active' : ''}`}
              onClick={() => nav.go(section.id)}
              onMouseMove={(event) => { if (position !== index && pointerMoved(event)) setCardIndex(position); }}
            >
              <div className="libraryCard__thumb">
                {first?.thumb ? <img src={thumbUrl(first.thumb, 280) as string} alt="" /> : section.icon}
              </div>
              <div className="libraryCard__text">
                <div className="libraryCard__title">{t(section.title)}</div>
                <div className="libraryCard__count">{section.id === 'history' ? t('Your watch history') : t('{count} video|{count} videos', { count: videos[section.id].length })}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="libraryRows" onMouseMove={(event) => { if (zone !== 'rows' && pointerMoved(event)) setZone('rows'); }}>
        <VideoRows
          stateKey="library"
          rows={rows}
          enabled={zone === 'rows'}
          onTopEdge={() => setZone('cards')}
        />
      </div>
    </div>
  );
}
