import { useEffect, useMemo, useState } from 'react';
import { IconHeart, IconMenu2 } from '@tabler/icons-react';
import { useTranslation } from '@/shared/i18n';
import { EmptyState } from '@/shared/ui';
import { queryClaims, type Video } from '@/entities/video';
import { resolveChannels, type Channel } from '@/entities/channel';
import { useSession } from '@/entities/session';
import { channelFeed, FEED_PAGE_SIZE } from '@/features/browse-feeds';
import { getFollowingVideos, getSubscriptions, type Subscription } from '@/features/following';
import { FeedGrid } from '@/widgets/item-grid';
import { MasterDetail, type MasterEntry } from '@/widgets/master-detail';

const FIRST_BATCH = 15;
const BATCH = 10;
const RECENT_SECONDS = 48 * 3600;
const ALL = 'all';

export function FollowingPage() {
  const t = useTranslation();
  const { user } = useSession();
  const [subscriptions, setSubscriptions] = useState<Subscription[] | null>(null);
  const [recent, setRecent] = useState<Video[]>([]);
  const [channels, setChannels] = useState<Record<string, Channel>>({});

  useEffect(() => {
    if (!user) return;
    void getSubscriptions().then(setSubscriptions);
    void getFollowingVideos(1, FEED_PAGE_SIZE).then(setRecent).catch(() => setRecent([]));
  }, [user]);

  useEffect(() => {
    const ids = (subscriptions || []).map((sub) => sub.claim_id).filter(Boolean);
    let cancelled = false;
    const resolve = (batch: string[]) => resolveChannels(batch).then((resolved) => {
      if (!cancelled) setChannels((previous) => ({ ...previous, ...Object.fromEntries(resolved.map((channel) => [channel.id, channel])) }));
    }).catch(() => undefined);
    void resolve(ids.slice(0, FIRST_BATCH)).then(async () => {
      for (let at = FIRST_BATCH; at < ids.length && !cancelled; at += BATCH) await resolve(ids.slice(at, at + BATCH));
    });
    return () => { cancelled = true; };
  }, [subscriptions]);

  const entries = useMemo<MasterEntry[]>(() => {
    const activity = new Map<string, number>();
    const thumbs = new Map<string, string>();
    recent.forEach((video) => {
      if (!video.channelId) return;
      activity.set(video.channelId, Math.max(activity.get(video.channelId) || 0, video.releaseTime));
      if (video.channelThumb && !thumbs.has(video.channelId)) thumbs.set(video.channelId, video.channelThumb);
    });
    const now = Date.now() / 1000;
    const sorted = (subscriptions || []).slice().sort((a, b) => (activity.get(b.claim_id) || 0) - (activity.get(a.claim_id) || 0));
    return [
      { id: ALL, label: t('All'), icon: <IconMenu2 size={40} /> },
      ...sorted.map((sub): MasterEntry => {
        const name = (sub.channel_name || t('Unknown')).replace('@', '');
        const channel = channels[sub.claim_id];
        return {
          id: sub.claim_id,
          label: channel?.title || name,
          avatar: channel?.thumb || thumbs.get(sub.claim_id) || null,
          dot: now - (activity.get(sub.claim_id) || 0) < RECENT_SECONDS,
        };
      }),
    ];
  }, [subscriptions, recent, channels, t]);

  if (!user) return <EmptyState icon={<IconHeart size={64} />} title={t('Please log in to see channels you follow')} />;

  return (
    <MasterDetail
      stateKey="following"
      title={t('Following')}
      entries={entries}
      loading={subscriptions === null}
      emptyTitle={t('You are not following anyone yet')}
      emptyIcon={<IconHeart size={64} />}
      renderDetail={(entry, context) => (
        <FeedGrid
          key={entry.id}
          feedKey={`following:${entry.id}`}
          fetchPage={(page) => (entry.id === ALL ? getFollowingVideos(page, FEED_PAGE_SIZE) : queryClaims(channelFeed(entry.id, page)))}
          pageSize={FEED_PAGE_SIZE}
          title={entry.id === ALL ? t('Following') : entry.label}
          emptyTitle={t('No recent videos')}
          emptyIcon={<IconHeart size={64} />}
          enabled={context.enabled}
          onLeftEdge={context.leaveToList}
          width={context.width}
          height={context.height}
        />
      )}
    />
  );
}
