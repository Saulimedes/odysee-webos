import { memo } from 'react';
import { ODYSEE_ICONS } from './icons';

export const OdyseeIcon = memo(function OdyseeIcon({ name, size = 24, filled = false }: { name: string; size?: number; filled?: boolean }) {
  const icon = ODYSEE_ICONS[name];
  if (!icon) return null;
  const solid = icon.fill === 'solid' || (icon.fill === 'toggle' && filled);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={icon.viewBox}
      width={size}
      height={size}
      fill={solid ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={icon.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
});
