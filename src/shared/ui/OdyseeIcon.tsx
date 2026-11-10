import { memo } from 'react';
import { iconKey, ODYSEE_ICONS } from './icons';

interface Props {
  name: string;
  size?: number;
  filled?: boolean;
  follow?: boolean;
}

export const OdyseeIcon = memo(function OdyseeIcon({ name, size = 24, filled = false, follow = false }: Props) {
  const key = iconKey(name);
  if (!key) return null;
  const icon = ODYSEE_ICONS[key];
  const solid = icon.fill === 'solid' || (icon.fill === 'toggle' && filled);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={icon.viewBox}
      width={size}
      height={size}
      className={follow ? 'odyIcon' : undefined}
      fill={solid ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={icon.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
});
