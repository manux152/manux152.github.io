import { useState } from 'react';
import { Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, H, T, Card, Btn, Input, Chips, Err, Loading } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { PasswordChecklist } from '../../components/PasswordChecklist';
import { checkPassword, PASSWORD_ERROR } from '../../lib/password';
import { useTable } from '../../lib/useQuery';
import { useApp } from '../../lib/app-context';

export default function Users() {
  const { can, session } = useApp();
  const router = useRouter();
  const profiles = useTable('profiles', (q) => q.order('created_at', { ascending: false }));
  const roles = useTable('roles', (q) => q.order('name'));
  const userRoles = useTable('user_roles');
  const deleted = useTable('deleted_accounts', (q) => q.order('deleted_at', { ascending: false }));
  const [search, setSearch] = useState('');
  const [shownSec, setShownSec] = useState({ active: true, deactivated: true, deleted: false });
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState<{ email: string; password: string; full_name: string; roles: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!can('users.manage')) return <Screen><T>No permission.</T></Screen>;
  if (profiles.loading || roles.loading) return <Loading />;
  const rolesOf = (uid: string) => (userRoles.data as any[]).filter((x) => x.user_id === uid).map((x) => x.role_id);

  // Levels of hierarchy: you can only manage accounts below your own level (higher number = more authority). Needs migration 035.
  const roleList = roles.data as any[];
  const hasLevels = roleList.some((r) => r.level != null);
  const levelOfRole = (rid: string) => roleList.find((r) => r.id === rid)?.level ?? 10;
  const levelOf = (uid: string) => Math.max(0, ...rolesOf(uid).map(levelOfRole));
  const meId = session?.user.id;
  const myLevel = meId ? levelOf(meId) : 0;
  const isTop = hasLevels && myLevel > 0 && myLevel >= Math.max(...roleList.map((r) => r.level ?? 0));
  const above = (p: any) => p.id !== meId && (!hasLevels || myLevel > levelOf(p.id));
  const roleNames = (uid: string) => rolesOf(uid).map((rid) => roleList.find((r) => r.id === rid)?.name).filter(Boolean).join(', ');
  const roleOpts = roleList.filter((r) => !hasLevels || isTop || r.level < myLevel).map((r) => ({ value: r.id, label: r.name }));

  const q = search.trim().toLowerCase();
  const nameOf = (p: any) => (p.full_name || p.email || '').toLowerCase();
  const match = (p: any) => !q || `${p.full_name ?? ''} ${p.email ?? ''}`.toLowerCase().includes(q);
  const byName = (x: any, y: any) => nameOf(x).localeCompare(nameOf(y));
  const all = profiles.data as any[];
  const activeList = all.filter((p) => p.is_active && match(p)).sort(byName);
  const deactivatedList = all.filter((p) => !p.is_active && match(p)).sort(byName);
  const deletedList = (deleted.error ? [] : (deleted.data as any[])).filter(match).sort((x, y) => String(y.deleted_at).localeCompare(String(x.deleted_at)));
  const isOpen = (k: 'active' | 'deactivated' | 'deleted') => (q ? true : shownSec[k]);
  const toggleSec = (k: 'active' | 'deactivated' | 'deleted') => setShownSec({ ...shownSec, [k]: !shownSec[k] });

  const setRoles = async (uid: string, next: string[]) => {
    const cur = rolesOf(uid);
    const add = next.filter((x) => !cur.includes(x)), rem = cur.filter((x) => !next.includes(x));
    if (add.length) await supabase.from('user_roles').insert(add.map((role_id) => ({ user_id: uid, role_id })));
    for (const role_id of rem) await supabase.from('user_roles').delete().eq('user_id', uid).eq('role_id', role_id);
    await userRoles.refresh();
  };
  const ask = (title: string, msg: string, action: string) => new Promise<boolean>((res) => {
    if (Platform.OS === 'web') return res(window.confirm(`${title}\n\n${msg}`));
    Alert.alert(title, msg, [{ text: 'Cancel', style: 'cancel', onPress: () => res(false) }, { text: action, style: 'destructive', onPress: () => res(true) }]);
  });
  const toggleActive = async (p: any) => {
    setErr(null);
    if (p.is_active) {
      if (p.id === session?.user.id) return setErr('You cannot deactivate your own account here. Ask another user manager.');
      if (!(await ask('Deactivate this account?', `${p.email} will be signed out everywhere and will not be able to sign in or use anything until you activate the account again.`, 'Deactivate'))) return;
    }
    const { error } = await supabase.from('profiles').update({ is_active: !p.is_active }).eq('id', p.id);
    if (error) setErr(error.message);
    await profiles.refresh();
  };
  const removeUser = async (p: any) => {
    setErr(null);
    if (!(await ask('Delete this account?', `This permanently deletes ${p.email}, their roles and player profile, and signs them out everywhere. It cannot be undone.`, 'Delete'))) return;
    const { data, error } = await supabase.functions.invoke('delete-user', { body: { user_id: p.id } });
    if (error || data?.error) return setErr(data?.error ?? error?.message ?? 'Could not delete the account');
    await profiles.refresh(); await userRoles.refresh(); await deleted.refresh(); setOpen(null);
  };
  const reset2fa = async (p: any) => {
    setErr(null);
    if (!(await ask('Reset 2FA for this account?', `${p.email} will be able to sign in with just their password again, and can set up 2FA again later. Use this only if they lost their phone.`, 'Reset 2FA'))) return;
    const { data, error } = await supabase.functions.invoke('reset-2fa', { body: { user_id: p.id } });
    if (error || data?.error) return setErr(data?.error ?? error?.message ?? 'Could not reset 2FA');
    setErr(data?.removed ? `2FA reset for ${p.email}.` : `${p.email} did not have 2FA turned on.`);
  };
  const create = async () => {
    setErr(null);
    if (!checkPassword(form!.password).valid) return setErr(PASSWORD_ERROR);
    const { data, error } = await supabase.functions.invoke('create-user', { body: { ...form, role_ids: form!.roles } });
    if (error || data?.error) return setErr(error?.message ?? data.error);
    setForm(null); await profiles.refresh(); await userRoles.refresh();
  };

  const row = (p: any) => (
    <Card key={p.id}>
      <T style={{ fontWeight: '700' }}>{p.full_name || p.email}</T><T muted>{p.email}</T>
      {roleNames(p.id) ? <T muted>{roleNames(p.id)}</T> : null}
      <Btn title={open === p.id ? 'Close' : 'Manage'} kind="ghost" onPress={() => setOpen(open === p.id ? null : p.id)} />
      {open === p.id && (<>
        {above(p) ? <Chips multi options={roleOpts} value={rolesOf(p.id)} onChange={(v) => setRoles(p.id, v)} />
          : p.id !== meId ? <T muted>This account is at or above your level, so you can only email it.</T> : null}
        {can('emails.manage') && <Btn title="Send email" kind="ghost" onPress={() => router.push(`/admin/email-send?user=${p.id}` as any)} />}
        {above(p) && <Btn title="Reset 2FA" kind="ghost" onPress={() => reset2fa(p)} />}
        {above(p) && <Btn title={p.is_active ? 'Deactivate' : 'Activate'} kind="ghost" onPress={() => toggleActive(p)} />}
        {above(p) && <Btn title="Delete account" kind="danger" onPress={() => removeUser(p)} />}
      </>)}
    </Card>
  );

  if (form) return (
    <Screen><H>Create account</H>
      <Input label="Full name" value={form.full_name} onChangeText={(v) => setForm({ ...form, full_name: v })} />
      <Input label="Email" autoCapitalize="none" value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} />
      <Input label="Temporary password" secureTextEntry value={form.password} onChangeText={(v) => setForm({ ...form, password: v })} />
      <PasswordChecklist password={form.password} />
      <T muted>Roles</T><Chips multi options={roleOpts} value={form.roles} onChange={(v) => setForm({ ...form, roles: v })} />
      <Err msg={err} /><Btn title="Create" onPress={create} /><Btn title="Cancel" kind="ghost" onPress={() => setForm(null)} />
    </Screen>
  );

  return (
    <Screen><H>Users</H>
      <Err msg={err} />
      <Btn title="+ Create account" onPress={() => setForm({ email: '', password: '', full_name: '', roles: [] })} />
      <Input placeholder="Search by name or email" autoCapitalize="none" value={search} onChangeText={setSearch} />

      <Btn title={`${isOpen('active') ? '▼' : '▶'} Active accounts (${activeList.length})`} kind="ghost" onPress={() => toggleSec('active')} />
      {isOpen('active') && (activeList.length === 0 ? <T muted>{q ? 'No active accounts match.' : 'No active accounts.'}</T> : activeList.map(row))}

      <Btn title={`${isOpen('deactivated') ? '▼' : '▶'} Deactivated accounts (${deactivatedList.length})`} kind="ghost" onPress={() => toggleSec('deactivated')} />
      {isOpen('deactivated') && (deactivatedList.length === 0 ? <T muted>{q ? 'No deactivated accounts match.' : 'No deactivated accounts.'}</T> : deactivatedList.map(row))}

      <Btn title={`${isOpen('deleted') ? '▼' : '▶'} Deleted accounts (${deletedList.length})`} kind="ghost" onPress={() => toggleSec('deleted')} />
      {isOpen('deleted') && (deleted.error ? <T muted>Deleted accounts are not available yet. Run migration 034 in the SQL Editor.</T>
        : deletedList.length === 0 ? <T muted>{q ? 'No deleted accounts match.' : 'No deleted accounts.'}</T>
        : deletedList.map((d) => (
          <Card key={d.id}>
            <T style={{ fontWeight: '700' }}>{d.full_name || d.email}</T>
            <T muted>{d.email}</T>
            <T muted>Deleted {new Date(d.deleted_at).toLocaleDateString()}</T>
          </Card>
        )))}
    </Screen>
  );
}
