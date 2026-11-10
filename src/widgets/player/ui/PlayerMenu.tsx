import { useState } from 'react';
import { IconAdjustmentsHorizontal, IconAspectRatio, IconBug, IconGauge } from '@tabler/icons-react';
import { ASPECT_RATIOS, PLAYBACK_SPEEDS, VIDEO_QUALITIES } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { OptionPicker } from '@/shared/ui';

export type MenuChoice = 'aspect' | 'speed' | 'quality';
type Screen = 'main' | MenuChoice | 'stats';

interface Props {
  aspect: string;
  speed: number;
  quality: string;
  statsOpen?: boolean;
  onSelect: (choice: MenuChoice, code: string | number) => void;
  onToggleStats: () => void;
  onClose: () => void;
}

const ICON_SIZE = 36;
const OPTIONS = {
  aspect: ASPECT_RATIOS.map((aspect) => ({ code: aspect.code, name: aspect.name })),
  speed: PLAYBACK_SPEEDS,
  quality: VIDEO_QUALITIES.map((quality) => ({ code: quality.code, name: quality.name })),
};

export function PlayerMenu({ aspect, speed, quality, statsOpen, onSelect, onToggleStats, onClose }: Props) {
  const t = useTranslation();
  const [screen, setScreen] = useState<Screen>('main');
  const [last, setLast] = useState<string>('aspect');
  const current = { aspect, speed, quality };
  const nameOf = (choice: MenuChoice) => {
    const option = OPTIONS[choice].find((candidate) => candidate.code === current[choice]);
    return option ? t(option.name) : choice === 'speed' ? `${speed}\u00d7` : String(current[choice]);
  };

  if (screen === 'main') {
    const options = [
      { code: 'aspect', native: true, name: t('Aspect Ratio'), value: nameOf('aspect'), icon: <IconAspectRatio size={ICON_SIZE} /> },
      { code: 'speed', native: true, name: t('Playback Speed'), value: nameOf('speed'), icon: <IconGauge size={ICON_SIZE} /> },
      { code: 'quality', native: true, name: t('Video Quality'), value: nameOf('quality'), icon: <IconAdjustmentsHorizontal size={ICON_SIZE} /> },
      ...(statsOpen === undefined ? [] : [{ code: 'stats', native: true, name: t('Stats for Nerds'), value: statsOpen ? t('On') : t('Off'), icon: <IconBug size={ICON_SIZE} /> }]),
    ];
    return (
      <OptionPicker
        key="main"
        title={t('Settings')}
        options={options}
        value={last}
        onClose={(confirmed, code) => {
          if (!confirmed) onClose();
          else if (code === 'stats') { onToggleStats(); onClose(); }
          else { setLast(String(code)); setScreen(code as MenuChoice); }
        }}
      />
    );
  }

  const choice = screen as MenuChoice;
  const titles = { aspect: 'Aspect Ratio', speed: 'Playback Speed', quality: 'Video Quality' };
  return (
    <OptionPicker
      key={choice}
      title={t(titles[choice])}
      options={OPTIONS[choice]}
      value={current[choice]}
      onClose={(confirmed, code) => {
        if (!confirmed) setScreen('main');
        else { onSelect(choice, code); onClose(); }
      }}
    />
  );
}
