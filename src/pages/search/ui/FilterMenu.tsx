import { useState } from 'react';
import { useTranslation } from '@/shared/i18n';
import { OptionPicker, type PickerOption } from '@/shared/ui';
import { DEFAULT_FILTERS, isFiltered, type SearchFilters } from '../model/filters';

type Field = keyof SearchFilters;

interface Props {
  filters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
  onClose: () => void;
}

export function FilterMenu({ filters, onChange, onClose }: Props) {
  const t = useTranslation();
  const [screen, setScreen] = useState<'main' | Field>('main');
  const [last, setLast] = useState('sort');
  const option = (code: string, name: string): PickerOption => ({ code, native: true, name });
  const fields: { code: Field; title: string; options: PickerOption[] }[] = [
    { code: 'sort', title: t('Sort by'), options: [option('relevance', t('Relevance')), option('newest', t('Newest'))] },
    {
      code: 'time',
      title: t('Uploaded'),
      options: [option('any', t('Any time')), option('today', t('Today')), option('week', t('This week')), option('month', t('This month')), option('year', t('This year'))],
    },
    { code: 'length', title: t('Length'), options: [option('any', t('Any length')), option('short', t('Under 4 minutes')), option('long', t('Over 20 minutes'))] },
  ];

  if (screen === 'main') {
    const options: PickerOption[] = [
      ...fields.map((field) => ({ ...option(field.code, field.title), value: field.options.find((choice) => choice.code === filters[field.code])?.name })),
      ...(isFiltered(filters) ? [option('reset', t('Reset filters'))] : []),
    ];
    return (
      <OptionPicker
        key="main"
        title={t('Filters')}
        options={options}
        value={last}
        onClose={(confirmed, code) => {
          if (!confirmed) onClose();
          else if (code === 'reset') { onChange(DEFAULT_FILTERS); onClose(); }
          else { setLast(String(code)); setScreen(code as Field); }
        }}
      />
    );
  }

  const field = fields.find((candidate) => candidate.code === screen) as (typeof fields)[number];
  return (
    <OptionPicker
      key={screen}
      title={field.title}
      options={field.options}
      value={filters[screen]}
      onClose={(confirmed, code) => {
        if (!confirmed) setScreen('main');
        else { onChange({ ...filters, [screen]: String(code) }); onClose(); }
      }}
    />
  );
}
