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
  const [name, setName] = useState(''); const [desc, setDesc] = useState(''); const [lvl, setLvl] = useState('10');
  const [edits, setEdits] = useState<Record<string, string>>({});
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
    const { error } = await supabase.from('roles').insert({ name: name.trim(), description: desc || null, level: Math.max(0, Math.min(100, parseInt(lvl, 10) || 10)) });
    if (error) return setErr(error.message);
    setName(''); setDesc(''); setLvl('10'); await roles.refresh();
  };
  const saveLevel = async (id: string) => {
    setErr(null);
    const n = parseInt(edits[id] ?? '', 10);
    if (Number.isNaN(n) || n < 0 || n > 100) return setErr('Level must be a number from 0 to 100');
    const { error } = await supabase.from('roles').update({ level: n }).eq('id', id);
    if (error) return setErr(error.message);
    setEdits({ ...edits, [id]: undefined as any }); await roles.refresh(); await reload();
  };
  const remove = async (id: string) => { const { error } = await supabase.from('roles').delete().eq('id', id); if (error) setErr(error.message); await roles.refresh(); };

  return (
    <Screen><H>Roles & permissions</H>
      <Card><T style={{ fontWeight: '700' }}>New custom role</T>
        <Input label="Name (e.g. Physio, Treasurer)" value={name} onChangeText={setName} />
        <Input label="Description" value={desc} onChangeText={setDesc} />
        <Input label="Level (0–100, higher = more authority; you can only manage people below your own level)" keyboardType="number-pad" value={lvl} onChangeText={setLvl} />
        <Err msg={err} /><Btn title="Create role" onPress={add} /></Card>
      {(roles.data as any[]).map((r) => (
        <Card key={r.id}>
          <T style={{ fontWeight: '700' }}>{r.name}{r.is_system ? ' (built-in)' : ''}</T>{r.description ? <T muted>{r.description}</T> : null}
          {r.level != null ? <T muted>Level {r.level}</T> : null}
          <Btn title={open === r.id ? 'Close' : 'Edit permissions'} kind="ghost" onPress={() => setOpen(open === r.id ? null : r.id)} />
          {open === r.id && (<>
            {r.level != null && (<>
              <Input label="Level (0–100)" keyboardType="number-pad" value={edits[r.id] ?? String(r.level)} onChangeText={(v) => setEdits({ ...edits, [r.id]: v })} />
              <Btn title="Save level" kind="ghost" onPress={() => saveLevel(r.id)} />
            </>)}
            <Chips multi options={permOpts} value={keysOf(r.id)} onChange={(v) => setPerms(r.id, v)} />
            {!r.is_system && <Btn title="Delete role" kind="danger" onPress={() => remove(r.id)} />}
          </>)}
        </Card>
      ))}
    </Screen>
  );
}
