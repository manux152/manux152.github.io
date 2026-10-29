import { useEffect, useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, H, T, Card, Btn, Input, Toggle, Loading, Err } from '../../components/ui';
import { UniformPhoto } from '../../components/UniformPhoto';
import { supabase } from '../../lib/supabase';
import { useTable } from '../../lib/useQuery';
import { useApp } from '../../lib/app-context';
import { removeAsset } from '../../lib/imageTools';

const SECTIONS = [
  { key: 'intro', label: 'Introduction', hint: 'The opening lines at the top of the About page.', title: 'About us' },
  { key: 'mission', label: 'Mission', hint: 'What we do and who we do it for.', title: 'Our mission' },
  { key: 'vision', label: 'Vision', hint: 'Where we want to be in the future.', title: 'Our vision' },
  { key: 'value_proposition', label: 'Value proposition', hint: 'What members, families and supporters get from us.', title: 'Our value proposition' },
];
const confirmDelete = (msg: string) => new Promise<boolean>((res) => {
  if (Platform.OS === 'web') return res(window.confirm(msg));
  Alert.alert('Delete?', msg, [{ text: 'Cancel', style: 'cancel', onPress: () => res(false) }, { text: 'Delete', style: 'destructive', onPress: () => res(true) }]);
});

function SectionsEditor({ rows }: { rows: any[] }) {
  const init = () => Object.fromEntries(SECTIONS.map((s) => { const r = rows.find((x) => x.key === s.key); return [s.key, { title: r?.title || s.title, body: r?.body ?? '', is_visible: r?.is_visible ?? true }]; }));
  const [f, setF] = useState<Record<string, { title: string; body: string; is_visible: boolean }>>(init);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const set = (k: string, p: Partial<{ title: string; body: string; is_visible: boolean }>) => { setF((c) => ({ ...c, [k]: { ...c[k], ...p } })); setMsg(null); };
  const save = async () => {
    setErr(null); setMsg(null); setBusy(true);
    const out = SECTIONS.map((s, i) => ({ key: s.key, title: f[s.key].title.trim() || s.title, body: f[s.key].body.trim(), is_visible: f[s.key].is_visible, sort_order: i + 1, updated_at: new Date().toISOString() }));
    const { error } = await supabase.from('about_sections').upsert(out, { onConflict: 'key' });
    setBusy(false); if (error) return setErr(error.message);
    setMsg('Saved. The About page is updated.');
  };
  return (
    <View style={{ gap: 12 }}>
      {SECTIONS.map((s) => (
        <Card key={s.key}>
          <T style={{ fontWeight: '800' }}>{s.label}</T>
          <T muted style={{ fontSize: 12 }}>{s.hint}</T>
          <Input label="Heading" value={f[s.key].title} onChangeText={(v) => set(s.key, { title: v })} />
          <Input label="Text (a blank line starts a new paragraph)" multiline value={f[s.key].body} onChangeText={(v) => set(s.key, { body: v })} style={{ minHeight: 140, textAlignVertical: 'top' }} />
          <Toggle label="Show on the About page" hint="A section with no text is never shown." value={f[s.key].is_visible} onChange={(v) => set(s.key, { is_visible: v })} />
        </Card>
      ))}
      <Err msg={err} />{msg ? <T style={{ fontWeight: '700' }}>{msg}</T> : null}
      <Btn title={busy ? 'Saving…' : 'Save texts'} onPress={save} disabled={busy} />
    </View>
  );
}

function LeaderCard({ item, index, total, nextOrder, onChanged, onMove }: { item: any | null; index?: number; total?: number; nextOrder: number; onChanged: () => void; onMove?: (dir: -1 | 1) => void }) {
  const [name, setName] = useState<string>(item?.full_name ?? ''); const [role, setRole] = useState<string>(item?.role_title ?? ''); const [bio, setBio] = useState<string>(item?.bio ?? '');
  const [photo, setPhoto] = useState<string | null>(item?.photo_url ?? null); const [visible, setVisible] = useState<boolean>(item?.is_visible ?? true);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const dirty = () => setMsg(null);
  const save = async () => {
    setErr(null); setMsg(null);
    if (!name.trim()) return setErr('Enter the person’s name.');
    setBusy(true);
    const row = { full_name: name.trim(), role_title: role.trim(), bio: bio.trim(), photo_url: photo, is_visible: visible };
    const { error } = item ? await supabase.from('about_leaders').update(row).eq('id', item.id) : await supabase.from('about_leaders').insert({ ...row, sort_order: nextOrder });
    setBusy(false); if (error) return setErr(error.message);
    if (item && item.photo_url && item.photo_url !== photo) await removeAsset(item.photo_url);   // the replaced picture is no longer needed
    if (item) setMsg('Saved.');
    onChanged();
  };
  const del = async () => {
    if (!item || !(await confirmDelete(`Delete ${item.full_name} from the leadership list?`))) return;
    setBusy(true); const { error } = await supabase.from('about_leaders').delete().eq('id', item.id); setBusy(false);
    if (error) return setErr(error.message);
    await removeAsset(item.photo_url); onChanged();
  };
  return (
    <Card>
      <T raw style={{ fontWeight: '800' }}>{item ? (item.full_name || 'Leader') : 'Add a leader'}</T>
      <UniformPhoto url={photo} onChange={(u) => { setPhoto(u); dirty(); }} />
      <Input label="Name" value={name} onChangeText={(v) => { setName(v); dirty(); }} />
      <Input label="Role (for example Chairperson, Head coach)" value={role} onChangeText={(v) => { setRole(v); dirty(); }} />
      <Input label="Short bio (optional)" multiline value={bio} onChangeText={(v) => { setBio(v); dirty(); }} style={{ minHeight: 90, textAlignVertical: 'top' }} />
      <Toggle label="Show on the About page" value={visible} onChange={(v) => { setVisible(v); dirty(); }} />
      <Err msg={err} />{msg ? <T style={{ fontWeight: '700' }}>{msg}</T> : null}
      <Btn title={busy ? 'Saving…' : item ? 'Save' : 'Add to leadership'} onPress={save} disabled={busy} />
      {item ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Btn title="↑ Move up" kind="ghost" onPress={() => onMove?.(-1)} disabled={busy || index === 0} />
        <Btn title="↓ Move down" kind="ghost" onPress={() => onMove?.(1)} disabled={busy || index === (total ?? 1) - 1} />
        <Btn title="Delete" kind="danger" onPress={del} disabled={busy} />
      </View> : null}
    </Card>
  );
}

// Admin → About us: the About page texts (introduction, mission, vision, value proposition) and the leadership list with photos.
export default function AboutAdmin() {
  const { can } = useApp(); const router = useRouter();
  const sections = useTable('about_sections', (q) => q.order('sort_order'));
  const leaders = useTable('about_leaders', (q) => q.order('sort_order').order('created_at'));
  const [ready, setReady] = useState(false); const [newKey, setNewKey] = useState(0);
  useEffect(() => { if (!sections.loading && !leaders.loading) setReady(true); }, [sections.loading, leaders.loading]);
  if (!can('settings.manage')) return <Screen><T>No permission.</T></Screen>;
  if (!ready) return <Loading />;
  if (sections.error || leaders.error) return <Screen><H>About us</H><T muted>The About page is not set up yet. Run migration 042_about_pages.sql in the Supabase SQL Editor, then reload this page.</T><Err msg={sections.error ?? leaders.error} /></Screen>;

  const list = leaders.data as any[];
  const move = async (i: number, dir: -1 | 1) => {
    const next = [...list]; const j = i + dir; if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    await Promise.all(next.map((p, k) => supabase.from('about_leaders').update({ sort_order: k + 1 }).eq('id', p.id)));
    leaders.refresh();
  };
  return (
    <Screen>
      <H>About us</H>
      <T muted>Everything on the About page is written here. Changes go live as soon as you save. Visitors who choose another language see the texts translated automatically (each text up to about 1,500 characters).</T>
      <Btn title="Open the About page" kind="ghost" onPress={() => router.push('/about' as any)} />

      <H style={{ fontSize: 20 }}>Texts</H>
      <SectionsEditor rows={sections.data as any[]} />

      <H style={{ fontSize: 20 }}>Leadership</H>
      <T muted>Photos are cropped to the same square size automatically. Use the arrows to change the order on the page.</T>
      {list.map((p, i) => <LeaderCard key={p.id} item={p} index={i} total={list.length} nextOrder={list.length + 1} onChanged={() => leaders.refresh()} onMove={(d) => move(i, d)} />)}
      <LeaderCard key={`new-${newKey}`} item={null} nextOrder={list.length + 1} onChanged={() => { setNewKey((k) => k + 1); leaders.refresh(); }} />
    </Screen>
  );
}
