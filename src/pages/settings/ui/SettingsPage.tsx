import { useCallback, useMemo, useRef, useState } from 'react';
import { IconEdit, IconLogin, IconLogout, IconTrash } from '@tabler/icons-react';
import { KEY, THEME_MODES, getSetting, paletteFor, setSetting, useSetting, type SettingKey } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { PRIORITY, cycle, pointerMoved, useKeys, useNav, useRemembered } from '@/shared/lib';
import { Avatar, OptionPicker, ThemeSwatch, VirtualGrid, type PickerOption } from '@/shared/ui';
import { invalidate } from '@/shared/api';
import { useHomepage } from '@/entities/category';
import { useSession } from '@/entities/session';
import { clearCollections, syncCollections } from '@/features/collections';
import { LayoutEditor, type LayoutKind, type LayoutOption } from '@/features/customize-layout';
import { clearPlaybackHistory } from '@/features/playback-history';
import { MasterDetail, type MasterEntry } from '@/widgets/master-detail';
import { homeEntries, sidebarEntries } from './layoutEntries';
import { SETTINGS_CATEGORIES, type SettingsCategory, type SettingsRow } from './rows';

type ChoiceRow = Extract<SettingsRow, { kind: 'choice' }>;

const SECTION_HEIGHT = 40;
const ROW_GAP = 12;
const HEADING = 96;

const interactive = (row: SettingsRow) => row.kind !== 'about';

function aboutVersion(t: ReturnType<typeof useTranslation>) {
  const version = typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'dev';
  const commit = typeof APP_COMMIT !== 'undefined' ? APP_COMMIT : '';
  return commit ? t('Version {version}, build {commit}', { version, commit }) : t('Version {version}', { version });
}
const write = (key: SettingKey, value: string | number | boolean) => setSetting(key, value as never);

const EDITOR_TITLES: Record<LayoutKind, string> = { home: 'Customize Homepage', sidebar: 'Customize Sidebar' };

function themeOptions(accent: string): PickerOption[] {
  return THEME_MODES.map((mode) => {
    const palette = paletteFor(mode.code, accent);
    return { ...mode, preview: { bg: palette.bg, surface: palette.surface, text: palette.text } };
  });
}

function ChoiceValue({ row, code }: { row: ChoiceRow; code: string | number }) {
  const t = useTranslation();
  const [accent] = useSetting('accentColor');
  const option = row.options.find((candidate) => candidate.code === code);
  const palette = row.variant === 'theme' ? paletteFor(String(code), accent) : null;
  return (
    <span className="row__value" style={row.variant === 'font' && option?.family ? { fontFamily: `'${option.family}', sans-serif` } : undefined}>
      {row.variant === 'swatch' && <i className="swatch" style={{ background: String(code) }} />}
      {palette && <ThemeSwatch preview={{ bg: palette.bg, surface: palette.surface, text: palette.text }} />}
      {option ? (option.native ? option.name : t(option.name)) : String(code)}
    </span>
  );
}

function Value({ row }: { row: Extract<SettingsRow, { kind: 'choice' | 'toggle' }> }) {
  const [value] = useSetting(row.key);
  if (row.kind === 'toggle') return <span className={`switch${value ? ' switch--on' : ''}`}><i /></span>;
  return <ChoiceValue row={row} code={value as string | number} />;
}

interface DetailProps {
  category: SettingsCategory;
  enabled: boolean;
  width: number;
  onSignOut: () => void;
}

function SettingsDetail({ category, enabled, width, onSignOut }: DetailProps) {
  const t = useTranslation();
  const { user } = useSession();
  const nav = useNav<unknown>();
  const [textScale] = useSetting('textScale');
  const [followHome, setFollowHome] = useSetting('categoriesFollowHome');
  const { rows } = category;
  const grouped = rows.some((row) => 'section' in row && row.section);
  const [stored, setIndex] = useRemembered(`settings:${category.id}:row`, 0);
  const index = Math.min(stored, rows.length - 1);
  const homepage = useHomepage();
  const [picker, setPicker] = useState<ChoiceRow | null>(null);
  const [editor, setEditor] = useState<LayoutKind | null>(null);
  const pickerOptions = useMemo(
    () => (!picker ? [] : picker.variant === 'theme' ? themeOptions(getSetting('accentColor')) : picker.options),
    [picker],
  );
  const entries = useMemo(() => (editor === 'home' ? homeEntries(homepage, t) : sidebarEntries(t)), [editor, homepage, t]);
  const option = useMemo<LayoutOption | undefined>(
    () => (editor === 'home' ? { label: t('Use this order for Categories too'), checked: followHome, onToggle: () => setFollowHome(!followHome) } : undefined),
    [editor, followHome, setFollowHome, t],
  );
  const [confirming, setConfirming] = useState(false);
  const [cleared, setCleared] = useState(false);
  const original = useRef<string | number | boolean>('');
  const row = rows[index];

  const activate = (target: SettingsRow) => {
    if (target.kind === 'account') {
      if (user) onSignOut();
      else nav.go('login');
    } else if (target.kind === 'toggle') {
      if (!target.requiresLogin || user) write(target.key, !getSetting(target.key));
    } else if (target.kind === 'choice') {
      original.current = getSetting(target.key);
      setPicker(target);
    } else if (target.kind === 'editor') {
      setEditor(target.editor);
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
    if (!row || !interactive(row)) return false;
    switch (event.keyCode) {
      case KEY.UP: setConfirming(false); setIndex(cycle(index, -1, rows.length)); return true;
      case KEY.DOWN: setConfirming(false); setIndex(cycle(index, 1, rows.length)); return true;
      case KEY.ENTER: activate(row); return true;
      default: return false;
    }
  }, { enabled: enabled && !picker && !editor, priority: PRIORITY.content });

  const preview = useCallback((code: string | number) => { if (picker) write(picker.key, code); }, [picker]);
  const closePicker = (confirmed: boolean) => {
    if (picker && !confirmed) write(picker.key, original.current);
    setPicker(null);
  };

  const sectionHeight = grouped ? SECTION_HEIGHT : 0;
  const rowHeight = category.id === 'about' ? Math.round(64 + 50 * textScale) : Math.round(60 + 24 * textScale);
  return (
    <>
      <h2 className="masterDetail__title">{t(category.label)}</h2>
      <VirtualGrid
        items={rows}
        columns={1}
        cellWidth={width}
        cellHeight={sectionHeight + rowHeight}
        gap={ROW_GAP}
        height={window.innerHeight - HEADING}
        activeIndex={index}
        getKey={(item) => item.id}
        renderItem={(item, at) => {
          const active = at === index && enabled && item.kind !== 'about';
          return (
            <div>
              {grouped && <div className="row__section">{'section' in item && item.section ? t(item.section) : ''}</div>}
              <div className={`row${active ? ' row--active' : ''}${item.kind === 'about' ? ' row--static row--about' : ''}`} onClick={() => { setIndex(at); activate(item); }} onMouseMove={(event) => { if (interactive(item) && at !== index && pointerMoved(event)) { setConfirming(false); setIndex(at); } }}>
                {item.kind === 'account' && user && (
                  <>
                    <Avatar src={user.profile_image} name={user.primary_email || 'U'} size={72} />
                    <div className="row__text"><div className="row__label">{user.primary_email}</div>{user.channel?.name && <div className="row__hint">@{user.channel.name}</div>}</div>
                    <span className="row__button"><IconLogout size={32} /> {t('Sign Out')}</span>
                  </>
                )}
                {item.kind === 'account' && !user && (
                  <>
                    <span className="chip"><IconLogin size={30} /></span>
                    <div className="row__text">
                      <div className="row__label">{t('Sign in to Odysee')}</div>
                      <div className="row__hint">{t('Sign in to access your subscriptions and watchlist')}</div>
                    </div>
                    <span className="row__button"><IconLogin size={32} /> {t('Sign In')}</span>
                  </>
                )}
                {(item.kind === 'toggle' || item.kind === 'choice') && (
                  <>
                    <span className="chip"><item.Icon size={30} /></span>
                    <div className="row__text">
                      <div className="row__label">{t(item.label)}</div>
                      <div className="row__hint">{item.kind === 'toggle' && item.requiresLogin && !user ? t('Sign in required') : t(item.hint)}</div>
                    </div>
                    <Value row={item} />
                  </>
                )}
                {item.kind === 'editor' && (
                  <>
                    <span className="chip"><item.Icon size={30} /></span>
                    <div className="row__text">
                      <div className="row__label">{t(item.label)}</div>
                      <div className="row__hint">{t(item.hint)}</div>
                    </div>
                    <span className="row__button"><IconEdit size={32} /> {t('Edit')}</span>
                  </>
                )}
                {item.kind === 'clear' && (
                  <>
                    <span className="chip"><item.Icon size={30} /></span>
                    <div className="row__text">
                      <div className="row__label">{t('Clear Cache')}</div>
                      <div className="row__hint">{confirming ? t('Press OK again to remove history, favorites and watch later') : cleared ? t('Cleared') : t('Remove watch history, favorites, watch later and continue watching')}</div>
                    </div>
                    <span className="row__button"><IconTrash size={32} /> {confirming ? t('Confirm') : t('Clear')}</span>
                  </>
                )}
                {item.kind === 'about' && (
                  <>
                    <span className="chip"><item.Icon size={30} /></span>
                    <div className="row__text">
                      <div className="row__label">Odysee for webOS</div>
                      <div className="row__hint">{t('Unofficial App for LG webOS')}</div>
                      <div className="row__hint">{aboutVersion(t)}</div>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        }}
      />
      {picker && (
        <OptionPicker
          title={t(picker.label)}
          options={pickerOptions}
          value={getSetting(picker.key) as string | number}
          variant={picker.variant}
          onPreview={preview}
          onClose={closePicker}
        />
      )}
      {editor && <LayoutEditor kind={editor} title={t(EDITOR_TITLES[editor])} entries={entries} option={option} onClose={() => setEditor(null)} />}
    </>
  );
}

export function SettingsPage({ onSignOut }: { onSignOut: () => void }) {
  const t = useTranslation();
  const entries = useMemo<MasterEntry[]>(
    () => SETTINGS_CATEGORIES.map((category) => ({ id: category.id, label: t(category.label), icon: <span className="chip"><category.Icon size={30} /></span> })),
    [t],
  );
  return (
    <MasterDetail
      stateKey="settings"
      title={t('Settings')}
      entries={entries}
      emptyTitle=""
      renderDetail={(entry, context) => {
        const category = SETTINGS_CATEGORIES.find((candidate) => candidate.id === entry.id) ?? SETTINGS_CATEGORIES[0];
        return <SettingsDetail key={category.id} category={category} enabled={context.enabled} width={context.width} onSignOut={onSignOut} />;
      }}
    />
  );
}
