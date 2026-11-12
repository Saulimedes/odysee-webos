import { useEffect } from 'react';
import { IconEyeOff, IconWifiOff } from '@tabler/icons-react';
import { KEY } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { useKeys } from '@/shared/lib';
import { EmptyState, Spinner } from '@/shared/ui';
import { refreshHomepage } from '@/entities/category';
import { VideoRows } from '@/widgets/video-rows';
import { useHomeRows } from '../model/useHomeRows';

export function Home() {
  const t = useTranslation();
  const { rows, ensure, loadMore, hasVideos, loading, allHidden, failed } = useHomeRows();

  useEffect(() => {
    if (!loading) window.__odyseeReady?.();
  }, [loading]);

  useKeys((event) => {
    if (event.keyCode !== KEY.ENTER) return false;
    void refreshHomepage(true);
    return true;
  }, { enabled: !hasVideos && !loading });

  if (allHidden) return <EmptyState icon={<IconEyeOff size={64} />} title={t('All home rows are hidden')} hint={t('Show them again in Settings, Customize Homepage')} />;
  if (hasVideos) return <VideoRows stateKey="home" rows={rows} onActiveRow={ensure} onLoadMore={loadMore} wrap />;
  if (loading) return <div className="center"><Spinner /></div>;
  return <EmptyState icon={<IconWifiOff size={64} />} title={failed ? t('Could not reach Odysee') : t('Nothing to show yet')} hint={t('Check your connection, then press OK to try again')} />;
}
