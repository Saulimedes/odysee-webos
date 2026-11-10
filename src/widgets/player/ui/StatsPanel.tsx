import { memo } from 'react';
import { useTranslation } from '@/shared/i18n';
import type { StatRow } from '../model/playbackStats';

export const StatsPanel = memo(function StatsPanel({ rows }: { rows: StatRow[] }) {
  const t = useTranslation();
  return (
    <div className="playerStats" role="region" aria-label={t('Stats for Nerds')}>
      {rows.map((row) => (
        <div className="playerStats__row" key={row.label}>
          <span className="playerStats__label">{row.label}</span>
          <span className="playerStats__value">{row.value}</span>
        </div>
      ))}
    </div>
  );
});
