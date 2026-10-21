import { useCallback, useRef, useState } from 'react';
import { IconLogout, IconTrash } from '@tabler/icons-react';
import { KEY, getSetting, setSetting, useSetting, type SettingKey } from '@/shared/config';
import { PRIORITY, useKeys, useNav, useRemembered } from '@/shared/lib';
import { Avatar, PageTitle, VirtualGrid } from '@/shared/ui';
import { invalidate } from '@/shared/api';
import { useSession } from '@/entities/session';
import { clearCollections, syncCollections } from '@/features/collections';
import { clearPlaybackHistory } from '@/features/playback-history';
import { OptionPicker } from './OptionPicker';
import { SETTINGS_ROWS, type Option, type SettingsRow } from './rows';

const ROW_HEIGHT = 124;
const ROW_GAP = 12;

const interactive = (row: SettingsRow) => row.kind !== 'about';
const write = (key: SettingKey, value: string | number | boolean) => setSetting(key, value as never);

function ChoiceValue({ row, code }: { row: Extract<SettingsRow, { kind: 'choice' }>; code: string | number }) {
  const option = row.options.find((candidate) => candidate.code === code);
  return (
    <span className="row__value" style={row.variant === 'font' && option?.family ? { fontFamily: `'${option.family}', sans-serif` } : undefined}>
      {row.variant === 'swatch' && <i className="swatch" style={{ background: String(code) }} />}
      {option?.name ?? String(code)}
    </span>
  );
}

function Value({ row }: { row: Extract<SettingsRow, { kind: 'choice' | 'toggle' }> }) {
  const [value] = useSetting(row.key);
  if (row.kind === 'toggle') return <span className={`switch${value ? ' switch--on' : ''}`}><i /></span>;
  return <ChoiceValue row={row} code={value as string | number} />;
}

export function SettingsPage({ onSignOut }: { onSignOut: () => void }) {
  const nav = useNav<unknown>();
  const { user } = useSession();
  const rows = SETTINGS_ROWS.filter((row) => row.kind !== 'account' || user);
  const [stored, setIndex] = useRemembered('settings:index', 0);
  const index = Math.min(stored, rows.length - 1);
  const [picker, setPicker] = useState<Extract<SettingsRow, { kind: 'choice' }> | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [cleared, setCleared] = useState(false);
  const original = useRef<string | number | boolean>('');
  const row = rows[index];

  const cycle = (target: Extract<SettingsRow, { kind: 'choice' }>, direction: number) => {
    const current = target.options.findIndex((option) => option.code === getSetting(target.key));
    const next = target.options[Math.max(0, Math.min(target.options.length - 1, current + direction))];
    write(target.key, next.code);
  };

  const activate = (target: SettingsRow) => {
    if (target.kind === 'account') onSignOut();
    else if (target.kind === 'toggle') {
      if (!target.requiresLogin || user) write(target.key, !getSetting(target.key));
    } else if (target.kind === 'choice') {
      original.current = getSetting(target.key);
      setPicker(target);
    } else if (target.kind === 'clear') {
      if (!confirming) { setConfirming(true); setCleared(false); return; }
      clearCollections();
      clearPlaybackHistory();
      invalidate();
      setConfirming(false);
      setCleared(true);
      if (user) void syncCollections();
    }
  };

  useKeys((event) => {
    if (!interactive(row)) return false;
    switch (event.keyCode) {
      case KEY.UP: setConfirming(false); setIndex(Math.max(0, index - 1)); return true;
      case KEY.DOWN: setConfirming(false); setIndex(Math.min(rows.length - 1, index + 1)); return true;
      case KEY.LEFT:
        if (row.kind === 'choice') cycle(row, -1);
        else nav.focusSidebar();
        return true;
      case KEY.RIGHT:
        if (row.kind === 'choice') cycle(row, 1);
        return true;
      case KEY.ENTER: activate(row); return true;
      default: return false;
    }
  }, { enabled: !nav.sidebarFocused && !picker, priority: PRIORITY.content });

  const preview = useCallback((code: string | number) => { if (picker) write(picker.key, code); }, [picker]);
  const closePicker = (confirmed: boolean) => {
    if (picker && !confirmed) write(picker.key, original.current);
    setPicker(null);
  };

  const height = window.innerHeight - 140;
  return (
    <div className="page settingsPage">
      <PageTitle>Settings</PageTitle>
      <VirtualGrid
        items={rows}
        columns={1}
        cellWidth={window.innerWidth - 96 - 96}
        cellHeight={ROW_HEIGHT}
        gap={ROW_GAP}
        height={height}
        activeIndex={index}
        getKey={(item) => item.id}
        renderItem={(item, at) => {
          const active = at === index && !nav.sidebarFocused;
          return (
            <div>
              <div className="row__section">{'section' in item ? item.section : ''}</div>
              <div className={`row${active ? ' row--active' : ''}${item.kind === 'about' ? ' row--static' : ''}`} onClick={() => { setIndex(at); activate(item); }}>
                {item.kind === 'account' && user && (
                  <>
                    <Avatar src={user.profile_image} name={user.primary_email || 'U'} size={72} />
                    <div className="row__text"><div className="row__label">{user.primary_email}</div>{user.channel?.name && <div className="row__hint">@{user.channel.name}</div>}</div>
                    <span className="row__button"><IconLogout size={32} /> Sign Out</span>
                  </>
                )}
                {(item.kind === 'toggle' || item.kind === 'choice') && (
                  <>
                    <div className="row__text">
                      <div className="row__label">{item.label}</div>
                      <div className="row__hint">{item.kind === 'toggle' && item.requiresLogin && !user ? 'Sign in required' : item.hint}</div>
                    </div>
                    <Value row={item} />
                  </>
                )}
                {item.kind === 'clear' && (
                  <>
                    <div className="row__text">
                      <div className="row__label">Clear Cache</div>
                      <div className="row__hint">{confirming ? 'Press OK again to remove history, favorites and watch later' : cleared ? 'Cleared' : 'Remove watch history, favorites, watch later and continue watching'}</div>
                    </div>
                    <span className="row__button"><IconTrash size={32} /> {confirming ? 'Confirm' : 'Clear'}</span>
                  </>
                )}
                {item.kind === 'about' && (
                  <div className="row__text">
                    <div className="row__label">Odysee for webOS</div>
                    <div className="row__hint">Unofficial app for LG Smart TVs, version {typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'dev'}</div>
                  </div>
                )}
              </div>
            </div>
          );
        }}
      />
      {picker && <OptionPicker title={picker.label} options={picker.options as Option[]} value={getSetting(picker.key) as string | number} variant={picker.variant} onPreview={preview} onClose={closePicker} />}
    </div>
  );
}
