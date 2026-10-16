import { View } from 'react-native';

/** Grid that lets every tile keep its own height (so uncropped pictures line up neatly in columns). */
export function Masonry<I>({ items, columns, gap = 12, keyOf, render }: { items: I[]; columns: number; gap?: number; keyOf: (i: I) => string; render: (i: I, index: number) => React.ReactNode }) {
  const n = Math.max(1, columns); const cols: { item: I; index: number }[][] = Array.from({ length: n }, () => []);
  items.forEach((item, index) => cols[index % n].push({ item, index }));
  return (
    <View style={{ flexDirection: 'row', gap, alignItems: 'flex-start', width: '100%' }}>
      {cols.map((c, ci) => (
        <View key={ci} style={{ flex: 1, gap, minWidth: 0 }}>{c.map(({ item, index }) => <View key={keyOf(item)}>{render(item, index)}</View>)}</View>
      ))}
    </View>
  );
}
