import { useMemo } from 'react';
import { useApp } from './app-context';
import { resolveNavLook } from './navTheme';
import { useTheme } from './theme';

export function useNavLook() {
  const { settings } = useApp(); const { prefs, isDark } = useTheme();
  return useMemo(() => resolveNavLook(settings, prefs, isDark), [settings, prefs, isDark]);
}
