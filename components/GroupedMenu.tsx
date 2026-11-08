import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { T } from './ui';
import { useTheme } from '../lib/theme';
import { useNavLook } from '../lib/useNavLook';
import type { MenuGroup, MenuItem } from '../lib/menuGroups';

// Expandable groups of links, shared by the side menu and the "More" page.
export function GroupedMenu({ home, groups, onGo, active }: { home: MenuItem | null; groups: MenuGroup[]; onGo: (href: string) => void; active: (href: string) => boolean }) {
  const { colors, accentFor } = useTheme(); const look = useNavLook(); const gold = accentFor(look.accent);
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const toggle = (k: string) => setOpenKeys((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]));
  const link = (i: MenuItem, pad: number) => (
    <Pressable key={i.href + i.label} accessibilityRole="link" onPress={() => onGo(i.href)} style={{ paddingVertical: pad, paddingHorizontal: 8 }}>
      <T style={{ fontWeight: active(i.href) ? '800' : '600', fontSize: 16 }}>{i.label}{i.badge ? ` (${i.badge > 99 ? '99+' : i.badge})` : ''}</T>
    </Pressable>
  );
  return (
    <View>
      {home ? <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>{link(home, 14)}</View> : null}
      {groups.map((gr) => {
        const open = openKeys.includes(gr.key) || gr.items.some((i) => active(i.href));
        const total = gr.items.reduce((a, i) => a + (i.badge || 0), 0);
        return (
          <View key={gr.key} style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${gr.key}, ${open ? 'collapse' : 'expand'}`} onPress={() => toggle(gr.key)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 8 }}>
              <T style={{ fontWeight: '800', fontSize: 13, letterSpacing: 1.2, textTransform: 'uppercase', color: gold }}>{gr.key}{total > 0 ? ` (${total > 99 ? '99+' : total})` : ''}</T>
              <T style={{ fontSize: 14, color: gold }}>{open ? '▴' : '▾'}</T>
            </Pressable>
            {open ? <View style={{ paddingLeft: 12, paddingBottom: 6 }}>{gr.items.map((i) => link(i, 11))}</View> : null}
          </View>
        );
      })}
    </View>
  );
}
