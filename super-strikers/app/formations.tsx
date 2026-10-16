import { useState } from 'react';
import { View } from 'react-native';
import { Screen, H, T, Card, Loading, Chips, Avatar } from '../components/ui';
import { Pitch } from '../components/Pitch';
import { useTable } from '../lib/useQuery';
import { useLayout } from '../lib/layout';
import { tacticChips } from '../lib/tactics';

// Read-only view: the team shape, who plays where (with profile photos) and the tactics set on Admin → Tactics board.
export default function Formations() {
  const { wide } = useLayout();
  const [fmt, setFmt] = useState<string | null>('11-a-side');
  const { data, loading } = useTable('formations', (q) => q.eq('is_active', true).order('name'));
  const asg = useTable('formation_assignments', (q) => q.select('formation_id,slot_key,role_note,players(id,full_name,shirt_number,photo_url,positions(name))'));
  if (loading || asg.loading) return <Loading />;
  const list = (data as any[]).filter((f) => !fmt || f.format === fmt);
  return (
    <Screen><H>Formations</H>
      <T muted>How each shape lines up, who plays where, and the tactics the team uses.</T>
      <Chips options={['11-a-side', '9-a-side', '7-a-side'].map((v) => ({ value: v, label: v }))} value={fmt} onChange={setFmt} />
      {list.map((f) => {
        const mine = (asg.data as any[]).filter((a) => a.formation_id === f.id && a.players);
        const bySlot = new Map(mine.map((a) => [a.slot_key, a]));
        const info: Record<string, any> = {};
        mine.forEach((a) => { info[a.slot_key] = { name: String(a.players.full_name).split(' ').slice(-1)[0], photo: a.players.photo_url, number: a.players.shirt_number, captain: a.players.id === f.captain_id ? 'C' : a.players.id === f.vice_captain_id ? 'VC' : null }; });
        const chips = tacticChips(f.tactics);
        const ordered = (f.positions as any[]).filter((p) => bySlot.has(p.key));
        return (
          <Card key={f.id}>
            <T style={{ fontWeight: '800', fontSize: 18 }}>{f.name}{f.is_custom ? ' · custom' : ''}</T>
            <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16, alignItems: wide ? 'flex-start' : 'stretch' }}>
              <View style={{ flex: wide ? 1 : undefined }}>
                <Pitch positions={f.positions} info={info} width="100%" tokenSize={50} showRole />
                {mine.length === 0 ? <T muted style={{ textAlign: 'center', marginTop: 6 }}>The team shape for this formation hasn't been set yet.</T> : null}
              </View>
              <View style={{ flex: wide ? 1 : undefined, gap: 8 }}>
                {chips.length > 0 && (<>
                  <T style={{ fontWeight: '800' }}>Tactics</T>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {chips.map((c) => <View key={c.label} style={{ borderWidth: 1, borderColor: '#8886', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}><T style={{ fontSize: 13 }}><T muted style={{ fontSize: 13 }}>{c.label}: </T>{c.value}</T></View>)}
                  </View>
                </>)}
                {f.tactics?.instructions ? <T>{f.tactics.instructions}</T> : null}
                {ordered.length > 0 && (<>
                  <T style={{ fontWeight: '800' }}>Who plays where</T>
                  {ordered.map((s) => { const a: any = bySlot.get(s.key); return (
                    <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Avatar url={a.players.photo_url} name={a.players.full_name} size={40} />
                      <View style={{ flex: 1 }}>
                        <T style={{ fontWeight: '700' }}>{a.players.shirt_number != null ? `#${a.players.shirt_number} ` : ''}{a.players.full_name}{a.players.id === f.captain_id ? ' (C)' : a.players.id === f.vice_captain_id ? ' (VC)' : ''}</T>
                        <T muted style={{ fontSize: 12 }}>{s.label}{a.role_note ? ` · ${a.role_note}` : ''}</T>
                      </View>
                    </View>); })}
                </>)}
              </View>
            </View>
            {f.description ? <T>{f.description}</T> : null}
            {f.how_to_use ? <T><T style={{ fontWeight: '700' }}>How to use it: </T>{f.how_to_use}</T> : null}
            {f.strengths ? <T><T style={{ fontWeight: '700', color: '#2E9E5B' }}>Strengths: </T>{f.strengths}</T> : null}
            {f.weaknesses ? <T><T style={{ fontWeight: '700', color: '#D64545' }}>Weaknesses: </T>{f.weaknesses}</T> : null}
          </Card>
        );
      })}
    </Screen>
  );
}
