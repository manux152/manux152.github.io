import { useState } from 'react';
import { Screen, H, T, Card, Btn, Input, Err, Loading } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useTable } from '../../lib/useQuery';
import { useApp } from '../../lib/app-context';

export default function Registrations() {
  const { can } = useApp();
  const regs = useTable('registrations', (q) => q.order('created_at', { ascending: false }).select('*, profiles!registrations_user_id_fkey(full_name,email)'));
  const fields = useTable('registration_fields', (q) => q.order('sort_order'));
  const [note, setNote] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  if (!can('registrations.manage')) return <Screen><T>No permission.</T></Screen>;
  if (regs.loading || fields.loading) return <Loading />;
  const label = (k: string) => (fields.data as any[]).find((f) => f.key === k)?.label ?? k;
  const review = async (id: string, status: 'approved' | 'rejected') => {
    const { error } = await supabase.rpc('review_registration', { reg_id: id, new_status: status, note: note[id] || null });
    if (error) return setErr(error.message);
    setErr(null); await regs.refresh();
  };
  const order = { pending: 0, rejected: 1, approved: 2 } as any;
  const list = [...(regs.data as any[])].sort((a, b) => order[a.status] - order[b.status]);
  return (
    <Screen><H>Registrations</H><Err msg={err} />
      <T muted>Approving assigns the registration role and creates the player profile. Edit the form under Admin → Registration form.</T>
      {list.length === 0 && <T muted>No registrations yet.</T>}
      {list.map((r) => (
        <Card key={r.id}>
          <T style={{ fontWeight: '700' }}>{r.answers?.full_name || r.profiles?.full_name || r.profiles?.email} · {r.status}</T>
          <T muted>{r.profiles?.email}</T>
          {Object.entries(r.answers ?? {}).map(([k, v]) => <T key={k}><T muted>{label(k)}: </T>{String(v)}</T>)}
          {r.status === 'pending' && (<>
            <Input label="Note to applicant (optional)" value={note[r.id] ?? ''} onChangeText={(v) => setNote({ ...note, [r.id]: v })} />
            <Btn title="Approve" onPress={() => review(r.id, 'approved')} />
            <Btn title="Reject" kind="danger" onPress={() => review(r.id, 'rejected')} />
          </>)}
        </Card>
      ))}
    </Screen>
  );
}
