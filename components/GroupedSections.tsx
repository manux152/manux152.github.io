import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { T, useAccent } from './ui';
import { CATEGORY_ORDER } from '../lib/adminCategories';
import { useTheme } from '../lib/theme';

const ICONS: Record<string, string> = { 'My area': '🙋', People: '👥', 'Matches & team': '⚽', Content: '📰', Shop: '🛍️', Communication: '📣', 'Site design': '🎨', 'Reports & logs': '📊', Other: '🧰' };

/** Shows items under collapsible group headings. With grouped=false it just renders the flat list (used for A–Z sorting). */
export function GroupedSections<I>({ items, grouped, getCat, render }: { items: I[]; grouped: boolean; getCat: (i: I) => string; render: (items: I[]) => React.ReactNode }) {
  const [closed, setClosed] = useState<Record<string, boolean>>({}); const accent = useAccent(); const { colors } = useTheme();
  if (!grouped) return <>{render(items)}</>;
  const groups = CATEGORY_ORDER.map((c) => ({ c, list: items.filter((i) => getCat(i) === c) })).filter((g) => g.list.length);
  const allClosed = groups.length > 0 && groups.every((g) => closed[g.c]);
  return (
    <View style={{ gap: 14 }}>
      {groups.length > 1 ? (
        <Pressable accessibilityRole="button" onPress={() => setClosed(allClosed ? {} : Object.fromEntries(groups.map((g) => [g.c, true])))} style={{ alignSelf: 'flex-end', paddingVertical: 4 }}>
          <T style={{ color: accent, fontWeight: '700', fontSize: 13 }}>{allClosed ? 'Expand all' : 'Collapse all'}</T>
        </Pressable>) : null}
      {groups.map(({ c, list }) => {
        const shut = !!closed[c];
        return (
          <View key={c} style={{ gap: 10 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${c}, ${list.length} items`} accessibilityState={{ expanded: !shut }} onPress={() => setClosed((s) => ({ ...s, [c]: !s[c] }))}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, borderBottomWidth: 2, borderBottomColor: accent, paddingBottom: 4 }}>
              <T style={{ fontSize: 20 }}>{ICONS[c] ?? '📁'}</T>
              <T style={{ fontWeight: '800', fontSize: 17, flex: 1 }}>{c}</T>
              <View style={{ minWidth: 26, paddingHorizontal: 8, height: 24, borderRadius: 12, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><T style={{ fontWeight: '800', fontSize: 12 }}>{list.length}</T></View>
              <T style={{ fontSize: 16 }}>{shut ? '▸' : '▾'}</T>
            </Pressable>
            {shut ? null : render(list)}
          </View>);
      })}
    </View>
  );
}
