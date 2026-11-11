import { useCallback, useRef, useState } from 'react';
import { IconAspectRatio, IconBug, IconGauge } from '@tabler/icons-react';
import { ASPECT_RATIOS, PLAYBACK_SPEEDS } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { OptionPicker } from '@/shared/ui';

export type MenuChoice = 'aspect' | 'speed';
type Screen = 'main' | MenuChoice;

interface Props {
  aspect: string;
  speed: number;
  statsOpen?: boolean;
  onPreview: (choice: MenuChoice, code: string | number) => void;
  onSelect: (choice: MenuChoice, code: string | number) => void;
  onToggleStats: () => void;
  onClose: () => void;
}

const ICON_SIZE = 36;
const OPTIONS = {
  aspect: ASPECT_RATIOS.map((aspect) => ({ code: aspect.code, name: aspect.name })),
  speed: PLAYBACK_SPEEDS,
};
const TITLES = { aspect: 'Aspect Ratio', speed: 'Playback Speed' };

export function PlayerMenu({ aspect, speed, statsOpen, onPreview, onSelect, onToggleStats, onClose }: Props) {
  const t = useTranslation();
  const [screen, setScreen] = useState<Screen>('main');
  const [last, setLast] = useState<string>('aspect');
  const opened = useRef({ aspect, speed });
  const current = { aspect, speed };
  const nameOf = (choice: MenuChoice) => {
    const option = OPTIONS[choice].find((candidate) => candidate.code === current[choice]);
    return option ? t(option.name) : choice === 'speed' ? `${speed}×` : String(current[choice]);
  };
  const preview = useCallback((code: string | number) => { if (screen !== 'main') onPreview(screen, code); }, [screen, onPreview]);
  const restore = () => { if (screen !== 'main') onPreview(screen, opened.current[screen]); };

  if (screen === 'main') {
    const options = [
      { code: 'aspect', native: true, name: t('Aspect Ratio'), value: nameOf('aspect'), icon: <IconAspectRatio size={ICON_SIZE} /> },
      { code: 'speed', native: true, name: t('Playback Speed'), value: nameOf('speed'), icon: <IconGauge size={ICON_SIZE} /> },
      ...(statsOpen === undefined ? [] : [{ code: 'stats', native: true, name: t('Stats for Nerds'), value: statsOpen ? t('On') : t('Off'), icon: <IconBug size={ICON_SIZE} /> }]),
    ];
    return (
      <OptionPicker
        key="main"
        placement="popover"
        title={t('Settings')}
        options={options}
        value={last}
        onDismiss={onClose}
        onClose={(confirmed, code) => {
          if (!confirmed) onClose();
          else if (code === 'stats') { onToggleStats(); onClose(); }
          else { setLast(String(code)); setScreen(code as MenuChoice); }
        }}
      />
    );
  }

  return (
    <OptionPicker
      key={screen}
      placement="popover"
      title={t(TITLES[screen])}
      options={OPTIONS[screen]}
      value={current[screen]}
      onPreview={preview}
      onDismiss={() => { restore(); onClose(); }}
      onClose={(confirmed, code) => {
        if (!confirmed) { restore(); setScreen('main'); }
        else { onSelect(screen, code); onClose(); }
      }}
    />
  );
}
