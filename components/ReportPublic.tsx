import { View } from 'react-native';
import { Image } from 'expo-image';
import { Card, T, useColor } from './ui';
import { BarList } from './BarList';

// The part of the season report that is safe to show to everyone.
export function ReportPublic({ d }: { d: any }) {
  const color = useColor(); const r = d.record ?? {};
  const stat = (k: string, v: any) => <View key={k} style={{ alignItems: 'center' }}><T muted>{k}</T><T style={{ fontWeight: '800', fontSize: 22 }}>{v ?? 0}</T></View>;
  return (
    <View style={{ gap: 12 }}>
      <Card>
        <T style={{ fontWeight: '800', fontSize: 17 }}>Results</T>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          {stat('Played', r.played)}{stat('Won', r.won)}{stat('Drawn', r.drawn)}{stat('Lost', r.lost)}{stat('GF', r.goals_for)}{stat('GA', r.goals_against)}{stat('Pts', r.points)}
        </View>
        {d.best_win ? <T muted>Biggest win: {d.best_win.goals_for}–{d.best_win.goals_against} vs {d.best_win.opponent}</T> : null}
      </Card>
      <Card><T style={{ fontWeight: '800', fontSize: 17 }}>Top scorers ⚽</T>
        {d.scorers?.length ? <BarList color={color} rows={d.scorers.map((p: any) => ({ label: p.full_name, value: p.goals }))} /> : <T muted>No goals recorded.</T>}</Card>
      <Card><T style={{ fontWeight: '800', fontSize: 17 }}>Top assists 🎯</T>
        {d.assists?.length ? <BarList color={color} rows={d.assists.map((p: any) => ({ label: p.full_name, value: p.assists }))} /> : <T muted>No assists recorded.</T>}</Card>
      <Card><T style={{ fontWeight: '800', fontSize: 17 }}>Most appearances</T>
        {d.appearances?.length ? <BarList color={color} rows={d.appearances.map((p: any) => ({ label: p.full_name, value: p.appearances }))} /> : <T muted>No lineups recorded.</T>}</Card>
      {d.discipline?.length ? <Card><T style={{ fontWeight: '800', fontSize: 17 }}>Discipline</T>
        {d.discipline.map((p: any) => <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T>{p.full_name}</T><T>🟨 {p.yellow}  🟥 {p.red}</T></View>)}</Card> : null}
      <Card><T style={{ fontWeight: '800', fontSize: 17 }}>Awards 🏆</T>
        {d.awards?.length ? d.awards.map((a: any, i: number) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {a.photo ? <Image source={{ uri: a.photo }} style={{ width: 40, height: 40, borderRadius: 20 }} contentFit="cover" /> : <T style={{ fontSize: 26 }}>🏆</T>}
            <View style={{ flex: 1 }}><T style={{ fontWeight: '700' }}>{a.player ?? '—'}</T><T muted>{a.award} · {a.period}</T></View>
          </View>)) : <T muted>No awards in this period.</T>}</Card>
    </View>
  );
}

export const publicSummary = (name: string, team: string, d: any) => {
  const r = d.record ?? {};
  return [`${team} — ${name}`, `Played ${r.played ?? 0}: W${r.won ?? 0} D${r.drawn ?? 0} L${r.lost ?? 0}, goals ${r.goals_for ?? 0}–${r.goals_against ?? 0}, ${r.points ?? 0} pts`,
    d.scorers?.length ? `Top scorers: ${d.scorers.slice(0, 3).map((p: any) => `${p.full_name} (${p.goals})`).join(', ')}` : '',
    d.assists?.length ? `Top assists: ${d.assists.slice(0, 3).map((p: any) => `${p.full_name} (${p.assists})`).join(', ')}` : '',
    d.awards?.length ? `Awards: ${d.awards.slice(0, 5).map((a: any) => `${a.award} – ${a.player ?? ''} (${a.period})`).join('; ')}` : ''].filter(Boolean).join('\n');
};
