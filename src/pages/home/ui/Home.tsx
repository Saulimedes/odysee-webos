import { IconWifiOff } from '@tabler/icons-react';
import { KEY } from '@/shared/config';
import { useKeys } from '@/shared/lib';
import { EmptyState, Spinner } from '@/shared/ui';
import { refreshHomepage } from '@/entities/category';
import { VideoRows } from '@/widgets/video-rows';
import { useHomeRows } from '../model/useHomeRows';

export function Home() {
  const { rows, ensure, loadMore, hasVideos, loading, failed } = useHomeRows();

  useKeys((event) => {
    if (event.keyCode !== KEY.ENTER) return false;
    void refreshHomepage(true);
    return true;
  }, { enabled: !hasVideos && !loading });

  if (hasVideos) return <VideoRows stateKey="home" rows={rows} onActiveRow={ensure} onLoadMore={loadMore} />;
  if (loading) return <div className="center"><Spinner /></div>;
  return <EmptyState icon={<IconWifiOff size={64} />} title={failed ? 'Could not reach Odysee' : 'Nothing to show yet'} hint="Check your connection, then press OK to try again" />;
}
