import { useEffect, useState } from 'react';
import { Screen, H, T, Card, Btn, Input, Chips } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../lib/app-context';
import { saveCsv, toCsv } from '../../lib/csv';

const FILTERS = [{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'pending', label: 'Waiting to confirm' }, { value: 'unsubscribed', label: 'Unsubscribed' }];

// Admin → Fan club: everyone who signed up on the Fan club page.
export default function Fans() {
  const { can } = useApp();
  const [rows, setRows] = useState<any[]>([]); const [q, setQ] = useState(''); const [status, setStatus] = useState('all');
  const [del, setDel] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const load = async () => { const { data } = await supabase.from('fans').select('id,email,full_name,interests,status,created_at').order('created_at', { ascending: false }).limit(2000); setRows(data ?? []); };
  useEffect(() => { load(); }, []);
  if (!can('newsletters.manage')) return <Screen><T>No permission.</T></Screen>;

  const n = (s: string) => rows.filter((r) => r.status === s).length;
  const shown = rows.filter((r) => (status === 'all' || r.status === status) && (!q.trim() || `${r.full_name ?? ''} ${r.email}`.toLowerCase().includes(q.trim().toLowerCase())));
  const remove = async (id: string) => {
    if (del !== id) { setDel(id); return; }
    setDel(null); const { error } = await supabase.from('fans').delete().eq('id', id); if (error) return setMsg(error.message); setRows((c) => c.filter((r) => r.id !== id));
  };
  const exportCsv = async () => setMsg(await saveCsv('fan-club.csv', toCsv(shown, [{ header: 'Name', get: (r) => r.full_name }, { header: 'Email', get: (r) => r.email }, { header: 'Status', get: (r) => r.status }, { header: 'Interests', get: (r) => (r.interests ?? []).join(' ') }, { header: 'Joined', get: (r) => r.created_at }])));

  return (
    <Screen>
      <H>Fan club</H>
      <T muted>{n('active')} active · {n('pending')} waiting to confirm · {n('unsubscribed')} unsubscribed. Write to them in Admin → Newsletters.</T>
      <Input label="Search name or email" autoCapitalize="none" value={q} onChangeText={setQ} />
      <Chips options={FILTERS} value={status} onChange={(v) => v && setStatus(v)} />
      {msg ? <T>{msg}</T> : null}
      <Btn title={`Download ${shown.length} as a spreadsheet`} kind="ghost" onPress={exportCsv} disabled={!shown.length} />
      {shown.length === 0 ? <T muted>Nobody here yet.</T> : shown.map((r) => (
        <Card key={r.id}>
          <T style={{ fontWeight: '700' }}>{r.full_name || r.email}</T>
          {r.full_name ? <T muted>{r.email}</T> : null}
          <T muted style={{ fontSize: 12 }}>{r.status} · joined {new Date(r.created_at).toLocaleDateString()}{r.interests?.length ? ` · ${r.interests.join(', ')}` : ''}</T>
          <Btn title={del === r.id ? 'Tap again to remove for good' : 'Remove'} kind="danger" onPress={() => remove(r.id)} />
        </Card>
      ))}
    </Screen>
  );
}
