import { useState } from 'react';
import { View } from 'react-native';
import { Btn, Chips, Input, T } from './ui';

type Opt = { value: string; label: string };
/** Search box with Sort and Filter buttons. Panels open under the bar; the count line shows what is hidden. */
export function SortFilterBar<S extends string = string>({ query, onQuery, sort, onSort, sortOptions, category, onCategory, categories, shown, total, extra, onClear, filterLabel = 'Filter', showLabel = 'Show', searchPlaceholder = 'Search…' }: {
  query: string; onQuery: (q: string) => void; sort: S; onSort: (s: S) => void; sortOptions: Opt[]; filterLabel?: string; showLabel?: string; searchPlaceholder?: string;
  category: string; onCategory: (c: string) => void; categories: Opt[]; shown: number; total: number; extra?: React.ReactNode; onClear: () => void }) {
  const [panel, setPanel] = useState<null | 'sort' | 'filter'>(null);
  const filtering = category !== 'all' || query.trim() !== '' || sort !== sortOptions[0]?.value;
  const sortLabel = sortOptions.find((o) => o.value === sort)?.label ?? 'Sort';
  return (
    <View style={{ gap: 10 }}>
      <Input accessibilityLabel="Search" placeholder={searchPlaceholder} value={query} onChangeText={onQuery} autoCapitalize="none" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Btn title={`Sort: ${sortLabel} ${panel === 'sort' ? '▴' : '▾'}`} kind={panel === 'sort' ? 'primary' : 'ghost'} onPress={() => setPanel(panel === 'sort' ? null : 'sort')} />
        <Btn title={`${filterLabel}${category !== 'all' ? ' •' : ''} ${panel === 'filter' ? '▴' : '▾'}`} kind={panel === 'filter' ? 'primary' : 'ghost'} onPress={() => setPanel(panel === 'filter' ? null : 'filter')} />
        {filtering ? <Btn title="Clear" kind="ghost" onPress={() => { onClear(); setPanel(null); }} /> : null}
      </View>
      {panel === 'sort' ? <View style={{ gap: 6 }}><T muted>Sort by</T><Chips options={sortOptions} value={sort} onChange={(v) => { if (v) { onSort(v as S); setPanel(null); } }} /></View> : null}
      {panel === 'filter' ? <View style={{ gap: 8 }}><T muted>{showLabel}</T><Chips options={categories} value={category} onChange={(v) => { onCategory(v ?? 'all'); }} />{extra}</View> : null}
      <T muted style={{ fontSize: 12 }} accessibilityLiveRegion="polite">Showing {shown} of {total}</T>
    </View>
  );
}
