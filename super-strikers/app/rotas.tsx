import { useState } from 'react';
import { Link, Redirect } from 'expo-router';
import { View } from 'react-native';
import { Screen, H, T, Card, Btn, Input, Err, Loading, fmtDate } from '../components/ui';
import { supabase } from '../lib/supabase';
import { useApp } from '../lib/app-context';
import { useRotas, type Rota, type RotaSlot } from '../lib/clubops';

function Slot({ rota, slot, onDone }: { rota: Rota; slot: RotaSlot; onDone: () => void }) {
  const [open, setOpen] = useState(false); const [seats, setSeats] = useState('3'); const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const full = slot.people.length >= slot.capacity; const transport = rota.kind === 'transport';
  const run = async (fn: () => PromiseLike<{ error: any }>) => { setBusy(true); setErr(null); const { error } = await fn(); setBusy(false); if (error) return setErr(error.message); setOpen(false); setNote(''); onDone(); };
  return (
    <View style={{ gap: 6, paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#E6E8EC' }}>
      <T style={{ fontWeight: '700' }}>{slot.label} <T muted>({slot.people.length}/{slot.capacity})</T></T>
      {slot.people.map((p, i) => <T key={i} muted>• {p.name}{transport && p.seats ? ` · ${p.seats} seat${p.seats === 1 ? '' : 's'}` : ''}{p.note ? ` · ${p.note}` : ''}</T>)}
      {slot.mine ? <Btn title="I can't do this any more" kind="ghost" disabled={busy} onPress={() => run(() => supabase.rpc('rota_withdraw', { p_slot: slot.id }) as any)} />
        : full ? <T muted>Full</T> : !open ? <Btn title={transport ? 'Offer a lift' : 'I can help'} kind="ghost" onPress={() => setOpen(true)} /> : (<>
          {transport ? <Input label="Seats you can offer (not counting you)" keyboardType="number-pad" value={seats} onChangeText={setSeats} /> : null}
          <Input label="Note (optional)" value={note} onChangeText={setNote} maxLength={200} />
          <Btn title="Confirm" disabled={busy} onPress={() => run(() => supabase.rpc('rota_signup', { p_slot: slot.id, p_note: note || null, p_seats: transport ? Number(seats) || null : null }) as any)} />
        </>)}
      <Err msg={err} />
    </View>
  );
}

/** Volunteers and lifts: sign up for a slot, or step back if plans change. Names show as first name + last initial. */
export default function Rotas() {
  const { session, settings } = useApp(); const { rotas, refresh } = useRotas();
  if (!session) return <Redirect href="/login" />;
  if (rotas === null) return <Loading />;
  return (
    <Screen>
      <H>Volunteers & lifts</H>
      {settings.rotas_enabled === false ? <T muted>Rotas are switched off right now.</T> : rotas.length === 0 ? <T muted>Nothing to sign up for right now.</T> : rotas.map((r) => (
        <Card key={r.id}>
          <T style={{ fontWeight: '800', fontSize: 17 }}>{r.kind === 'transport' ? '🚗' : '🙋'} {r.title}</T>
          <T muted>{fmtDate(r.starts_at)}{r.location ? ` · ${r.location}` : ''}</T>
          {r.notes ? <T>{r.notes}</T> : null}
          {r.match_id ? <Link href={`/match/${r.match_id}` as any}><T style={{ textDecorationLine: 'underline' }}>Match details →</T></Link> : null}
          {r.slots.map((s) => <Slot key={s.id} rota={r} slot={s} onDone={refresh} />)}
          {r.kind === 'transport' ? <T muted style={{ fontSize: 12 }}>Only offer lifts if you meet the club's safeguarding rules for drivers. Check with the club if you are unsure.</T> : null}
        </Card>))}
    </Screen>
  );
}
