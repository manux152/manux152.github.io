import { useState } from 'react';
import { Screen, H, T, Card, Btn, Input, Chips, Err, Loading } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useTable } from '../../lib/useQuery';
import { useApp } from '../../lib/app-context';

export default function Roles() {
  const { can, reload } = useApp();
  const roles = useTable('roles', (q) => q.order('name'));
  const perms = useTable('permissions', (q) => q.order('key'));
  const rp = useTable('role_permissions');
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState(''); const [desc, setDesc] = useState('');
  const [err, setErr] = useState<string | null>(null);
  if (!can('roles.manage')) return <Screen><T>No permission.</T></Screen>;
  if (roles.loading || perms.loading) return <Loading />;
  const permOpts = (perms.data as any[]).map((p) => ({ value: p.key, label: p.key }));
  const keysOf = (rid: string) => (rp.data as any[]).filter((x) => x.role_id === rid).map((x) => x.permission_key);

  const setPerms = async (rid: string, next: string[]) => {
    const cur = keysOf(rid);
    const add = next.filter((x) => !cur.includes(x)), rem = cur.filter((x) => !next.includes(x));
    if (add.length) await supabase.from('role_permissions').insert(add.map((permission_key) => ({ role_id: rid, permission_key })));
    for (const k of rem) await supabase.from('role_permissions').delete().eq('role_id', rid).eq('permission_key', k);
    await rp.refresh(); await reload();
  };
  const add = async () => {
    setErr(null);
    if (!name.trim()) return setErr('Role name required');
    const { error } = await supabase.from('roles').insert({ name: name.trim(), description: desc || null });
    if (error) return setErr(error.message);
    setName(''); setDesc(''); await roles.refresh();
  };
  const remove = async (id: string) => { const { error } = await supabase.from('roles').delete().eq('id', id); if (error) setErr(error.message); await roles.refresh(); };

  return (
    <Screen><H>Roles & permissions</H>
      <Card><T style={{ fontWeight: '700' }}>New custom role</T>
        <Input label="Name (e.g. Physio, Treasurer)" value={name} onChangeText={setName} />
        <Input label="Description" value={desc} onChangeText={setDesc} />
        <Err msg={err} /><Btn title="Create role" onPress={add} /></Card>
      {(roles.data as any[]).map((r) => (
        <Card key={r.id}>
          <T style={{ fontWeight: '700' }}>{r.name}{r.is_system ? ' (built-in)' : ''}</T>{r.description ? <T muted>{r.description}</T> : null}
          <Btn title={open === r.id ? 'Close' : 'Edit permissions'} kind="ghost" onPress={() => setOpen(open === r.id ? null : r.id)} />
          {open === r.id && (<>
            <Chips multi options={permOpts} value={keysOf(r.id)} onChange={(v) => setPerms(r.id, v)} />
            {!r.is_system && <Btn title="Delete role" kind="danger" onPress={() => remove(r.id)} />}
          </>)}
        </Card>
      ))}
    </Screen>
  );
}
