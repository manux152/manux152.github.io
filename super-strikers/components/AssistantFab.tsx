import { useEffect, useState } from 'react';
import { Platform, Pressable } from 'react-native';
import { TrText as Text } from './TrText';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../lib/app-context';
import { useLayout } from '../lib/layout';
import { useAccent } from './ui';

/** Floating "Ask" button on every public page (hidden on the assistant itself, in the admin area and on sign-in screens). */
export function AssistantFab() {
  const { settings } = useApp(); const path = usePathname(); const router = useRouter(); const accent = useAccent(); const insets = useSafeAreaInsets(); const { wide, gutter } = useLayout();
  const [hover, setHover] = useState(false);
  useEffect(() => setHover(false), [path]);
  const off = settings.assistant_enabled === false || settings.assistant_enabled === 'false';
  if (off || path === '/assistant' || path.startsWith('/chat') || path.startsWith('/admin') || ['/login', '/register', '/reset-password', '/pay-return'].includes(path)) return null;
  const name = typeof settings.assistant_name === 'string' && settings.assistant_name ? settings.assistant_name : 'Team Assistant';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Ask ${name}`} onPress={() => router.push('/assistant' as any)}
      {...(Platform.OS === 'web' ? ({ onHoverIn: () => setHover(true), onHoverOut: () => setHover(false) } as any) : {})}
      style={{ position: 'absolute', right: Math.max(14, gutter - 6), bottom: (wide ? 24 : 78) + (Platform.OS === 'web' ? 0 : Math.max(0, insets.bottom - 8)), zIndex: 50, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: accent, borderRadius: 999, paddingVertical: 12, paddingHorizontal: hover || wide ? 18 : 14, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6 }}>
      <Text style={{ fontSize: 20 }}>💬</Text>
      {wide || hover ? <Text style={{ color: '#fff', fontWeight: '800' }}>Ask {name}</Text> : null}
    </Pressable>
  );
}
