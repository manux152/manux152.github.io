import { useState } from 'react';
import { View } from 'react-native';
import { Btn, Card, T } from './ui';
import { supabase } from '../lib/supabase';
import { useApp } from '../lib/app-context';
import { useTable } from '../lib/useQuery';

// "Can you play?" for linked players, plus the team's overall availability (team members only).
export function AvailabilityCard({ matchId, compact }: { matchId: string; compact?: boolean }) {
  const { session, can } = useApp();
  const me = useTable('players', (q) => (session ? q.eq('profile_id', session.user.id).limit(1) : q.limit(0)), [session?.user.id]);
  const av = useTable('match_availability', (q) => q.eq('match_id', matchId).select('*, players(full_name)'), [matchId, session?.user.id]);
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const player: any = me.data[0];
  const rows = av.data as any[];
  const mine = player ? rows.find((r) => r.player_id === player.id) : null;
  const team = can('team.view') || can('lineups.manage');
  if (!player && !team) return null;

  const set = async (status: 'available' | 'unavailable') => {
    setErr(null); setBusy(true);
    const { error } = await supabase.from('match_availability').upsert({ match_id: matchId, player_id: player.id, status, updated_by: session!.user.id, updated_at: new Date().toISOString() }, { onConflict: 'match_id,player_id' });
    setBusy(false);
    if (error) setErr(error.message); else await av.refresh();
  };
  const names = (s: string) => rows.filter((r) => r.status === s).map((r) => r.players?.full_name).filter(Boolean);
  return (
    <Card>
      <T style={{ fontWeight: '800', fontSize: 17 }}>Availability</T>
      {player && (<>
        <T muted>{mine ? `You are marked ${mine.status}.` : 'Let the coaches know if you can play.'} Your team is notified when you change it.</T>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Btn title={mine?.status === 'available' ? '✓ Available' : 'I\'m available'} kind={mine?.status === 'available' ? 'primary' : 'ghost'} onPress={() => set('available')} disabled={busy} /></View>
          <View style={{ flex: 1 }}><Btn title={mine?.status === 'unavailable' ? '✓ Unavailable' : 'Unavailable'} kind={mine?.status === 'unavailable' ? 'danger' : 'ghost'} onPress={() => set('unavailable')} disabled={busy} /></View>
        </View>
      </>)}
      {team && !compact && (<>
        <T><T style={{ color: '#2E9E5B', fontWeight: '700' }}>Available ({names('available').length}): </T>{names('available').join(', ') || '—'}</T>
        <T><T style={{ color: '#D64545', fontWeight: '700' }}>Unavailable ({names('unavailable').length}): </T>{names('unavailable').join(', ') || '—'}</T>
      </>)}
      {err ? <T style={{ color: '#B3261E' }}>{err}</T> : null}
    </Card>
  );
}
