import { useState } from 'react';
import { View } from 'react-native';
import { Screen, H, T, Card, Btn, Chips, Loading } from '../../components/ui';
import { useTable } from '../../lib/useQuery';
import { useApp } from '../../lib/app-context';
import { shareText } from '../../lib/share';

export default function AttendanceReport() {
  const { can } = useApp();
  const [range, setRange] = useState<string>('90'); const [msg, setMsg] = useState<string | null>(null);
  const since = range === 'all' ? '1970-01-01' : new Date(Date.now() - Number(range) * 864e5).toISOString();
  const sessions = useTable('training_sessions', (q) => q.gte('session_date', since).lte('session_date', new Date().toISOString()), [range]);
  const att = useTable('training_attendance', (q) => q.limit(5000));
  const players = useTable('players', (q) => q.eq('is_active', true).order('shirt_number'));
  if (!can('training.manage')) return <Screen><T>No permission.</T></Screen>;
  if (sessions.loading || att.loading || players.loading) return <Loading />;
  const ids = new Set((sessions.data as any[]).map((s) => s.id)); const total = ids.size;
  const rows = (players.data as any[]).map((p) => {
    const mine = (att.data as any[]).filter((a) => a.player_id === p.id && ids.has(a.session_id));
    const c = (k: string) => mine.filter((a) => a.status === k).length;
    const attended = c('present') + c('late');
    return { p, present: c('present'), late: c('late'), excused: c('excused'), absent: c('absent'), unmarked: Math.max(0, total - mine.length), pct: total ? Math.round((attended / total) * 100) : 0 };
  }).sort((a, b) => b.pct - a.pct);
  const csv = () => ['Player,Jersey,Sessions,Present,Late,Excused,Absent,Not marked,Attendance %', ...rows.map((r) => `"${r.p.full_name}",${r.p.shirt_number ?? ''},${total},${r.present},${r.late},${r.excused},${r.absent},${r.unmarked},${r.pct}`)].join('\n');
  return (
    <Screen><H>Training attendance</H>
      <Chips options={[{ value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }, { value: 'all', label: 'All time' }]} value={range} onChange={(v) => v && setRange(v)} />
      <T muted>{total} session(s) in this period. Attendance % = present + late, out of all sessions (unmarked counts as missed).</T>
      {rows.map((r) => (
        <Card key={r.p.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T style={{ fontWeight: '700' }}>{r.p.shirt_number != null ? `#${r.p.shirt_number} ` : ''}{r.p.full_name}</T><T style={{ fontWeight: '800' }}>{r.pct}%</T></View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: '#E6E8EC', overflow: 'hidden' }}><View style={{ width: `${r.pct}%`, height: 8, backgroundColor: r.pct >= 75 ? '#2E9E5B' : r.pct >= 50 ? '#E0A100' : '#D64545' }} /></View>
          <T muted style={{ fontSize: 12 }}>Present {r.present} · Late {r.late} · Excused {r.excused} · Absent {r.absent} · Not marked {r.unmarked}</T>
        </Card>
      ))}
      {msg ? <T>{msg}</T> : null}
      <Btn title="Share as CSV" kind="ghost" onPress={async () => setMsg(await shareText(csv()))} />
    </Screen>
  );
}
