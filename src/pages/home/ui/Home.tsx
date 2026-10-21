import { IconWifiOff } from '@tabler/icons-react';
import { EmptyState, Spinner } from '@/shared/ui';
import { VideoRows } from '@/widgets/video-rows';
import { useHomeRows } from '../model/useHomeRows';

export function Home() {
  const { rows, ensure, loadMore, ready } = useHomeRows();

  if (rows.length === 0) {
    return ready
      ? <EmptyState icon={<IconWifiOff size={64} />} title="Nothing to show yet" hint="Check your connection and try again" />
      : <div className="center"><Spinner /></div>;
  }
  return <VideoRows stateKey="home" rows={rows} onActiveRow={ensure} onLoadMore={loadMore} />;
}
