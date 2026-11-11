import { useEffect, useRef, useState } from 'react';
import { IconHeart, IconHeartFilled, IconStar } from '@tabler/icons-react';
import { KEY, channelGridHeight } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { PRIORITY, pointerMoved, useKeys, useNav } from '@/shared/lib';
import { Avatar } from '@/shared/ui';
import { queryClaims } from '@/entities/video';
import { resolveChannels, type Channel } from '@/entities/channel';
import { isLoggedIn, useSession } from '@/entities/session';
import { channelFeed, FEED_PAGE_SIZE } from '@/features/browse-feeds';
import { isFollowing, setFollowing } from '@/features/following';
import { FeedGrid } from '@/widgets/item-grid';

interface Props { id: string; name: string }

export function ChannelPage({ id, name }: Props) {
  const t = useTranslation();
  const nav = useNav<unknown>();
  const { user } = useSession();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [following, setFollowingState] = useState(false);
  const [zone, setZone] = useState<'header' | 'grid'>('grid');
  const busy = useRef(false);
  const canFollow = Boolean(user) && isLoggedIn();
  const title = channel?.title || name;

  useEffect(() => {
    let cancelled = false;
    setChannel(null);
    resolveChannels([id]).then((found) => { if (!cancelled) setChannel(found[0] ?? null); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    setFollowingState(false);
    if (canFollow) isFollowing(id).then((value) => { if (!cancelled) setFollowingState(value); });
    return () => { cancelled = true; };
  }, [id, canFollow]);

  const toggleFollow = async () => {
    if (!channel || busy.current) return;
    busy.current = true;
    if (await setFollowing(id, `@${channel.name}`, !following)) setFollowingState(!following);
    busy.current = false;
  };

  const inHeader = zone === 'header' && canFollow && !nav.sidebarFocused;
  useKeys((event) => {
    switch (event.keyCode) {
      case KEY.ENTER: void toggleFollow(); return true;
      case KEY.DOWN: setZone('grid'); return true;
      case KEY.LEFT: nav.focusSidebar(); return true;
      case KEY.UP:
      case KEY.RIGHT: return true;
      default: return false;
    }
  }, { enabled: inHeader, priority: PRIORITY.content });

  useKeys((event) => {
    if (event.keyCode !== KEY.UP) return false;
    setZone('header');
    return true;
  }, { enabled: zone === 'grid' && canFollow && !nav.sidebarFocused, priority: PRIORITY.content - 1 });

  return (
    <div className="page channelPage">
      <header className="channelHeader">
        <Avatar src={channel?.thumb} name={title} size={112} />
        <div className="channelHeader__text">
          <h1>{title}</h1>
          {channel && <div className="channelHeader__handle">@{channel.name}</div>}
          {channel?.description && <p className="channelHeader__about">{channel.description}</p>}
        </div>
        {canFollow && (
          <div
            className={`channelHeader__follow${following ? ' channelHeader__follow--on' : ''}${inHeader ? ' channelHeader__follow--active' : ''}`}
            onClick={() => void toggleFollow()}
            onMouseMove={(event) => { if (pointerMoved(event)) setZone('header'); }}
          >
            {following ? <IconHeartFilled size={34} /> : <IconHeart size={34} />}
            {following ? t('Following') : t('Follow')}
          </div>
        )}
      </header>
      <div onMouseMove={(event) => { if (zone !== 'grid' && pointerMoved(event)) setZone('grid'); }}>
        <FeedGrid
          key={id}
          feedKey={`channel:${id}`}
          fetchPage={(page) => queryClaims(channelFeed(id, page))}
          pageSize={FEED_PAGE_SIZE}
          emptyTitle={t('No videos found')}
          emptyIcon={<IconStar size={64} />}
          enabled={zone === 'grid'}
          height={channelGridHeight()}
          onTopEdge={canFollow ? () => setZone('header') : undefined}
        />
      </div>
    </div>
  );
}
