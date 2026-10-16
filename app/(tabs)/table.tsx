import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Screen, H, T, Card, Loading, Err, Chips } from '../../components/ui';
import { StandingsTable } from '../../components/StandingsTable';
import { useTable } from '../../lib/useQuery';
import { useApp } from '../../lib/app-context';

export default function Table() {
  const { settings } = useApp();
  const comps = useTable('competitions', (q) => q.eq('is_visible', true).order('is_primary', { ascending: false }).order('sort_order'));
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { if (!sel && comps.data.length) setSel((comps.data[0] as any).id); }, [comps.data, sel]);
  const rows = useTable('standings_rows', (q) => (sel ? q.eq('competition_id', sel).order('position') : q.limit(0)), [sel]);
  const rec = useTable('standings');
  if (comps.loading || rec.loading) return <Loading />;
  const comp: any = (comps.data as any[]).find((c) => c.id === sel);
  const r: any = rec.data[0] ?? {};
  const pts = (r.won ?? 0) * (settings.points_win ?? 3) + (r.drawn ?? 0) * (settings.points_draw ?? 1) + (r.lost ?? 0) * (settings.points_loss ?? 0);
  const cols: [string, any][] = [['P', r.played ?? 0], ['W', r.won ?? 0], ['D', r.drawn ?? 0], ['L', r.lost ?? 0], ['GF', r.goals_for ?? 0], ['GA', r.goals_against ?? 0], ['GD', (r.goals_for ?? 0) - (r.goals_against ?? 0)], ['Pts', pts]];
  return (
    <Screen>
      <H>League table</H><Err msg={comps.error} />
      {comps.data.length > 1 && <Chips options={(comps.data as any[]).map((c) => ({ value: c.id, label: c.name }))} value={sel} onChange={(v) => v && setSel(v)} />}
      {comp ? (
        <Card>
          <T style={{ fontWeight: '800', fontSize: 17 }}>{comp.name}{comp.season ? ` · ${comp.season}` : ''}</T>
          {rows.loading ? <Loading /> : rows.data.length ? <StandingsTable rows={rows.data as any[]} /> : <T muted>No table data yet.</T>}
          {comp.last_synced_at ? <T muted style={{ fontSize: 12 }}>Updated {new Date(comp.last_synced_at).toLocaleString()}</T> : null}
        </Card>
      ) : <T muted>No league tables have been set up yet.</T>}
      <H>Our results</H>
      <Card><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {cols.map(([k, v]) => <View key={k} style={{ alignItems: 'center' }}><T muted>{k}</T><T style={{ fontWeight: '800', fontSize: 20 }}>{v}</T></View>)}
      </View></Card>
    </Screen>
  );
}
