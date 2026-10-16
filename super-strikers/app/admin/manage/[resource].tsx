import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, H, T, Card, Btn, Input, Chips, Err, Loading } from '../../../components/ui';
import { supabase } from '../../../lib/supabase';
import { RESOURCES, Field } from '../../../lib/resources';
import { useTable } from '../../../lib/useQuery';
import { useApp } from '../../../lib/app-context';
import { DateTimeField } from '../../../components/DateTimeField';

function SelectField({ f, value, onChange }: { f: Field; value: any; onChange: (v: any) => void }) {
  const [opts, setOpts] = useState(f.options ?? []);
  useEffect(() => {
    if (!f.from) return;
    supabase.from(f.from.table).select('*').then(({ data }) => {
      const idKey = f.from!.table === 'permissions' ? 'key' : 'id';
      setOpts((data ?? []).map((r: any) => ({ value: r[idKey], label: r[f.from!.label] || r[idKey] })));
    });
  }, [f]);
  return <Chips options={opts} value={value ?? null} onChange={onChange} />;
}

export default function Manage() {
  const { resource } = useLocalSearchParams<{ resource: string }>();
  const cfg = RESOURCES[resource];
  const { can, reload } = useApp();
  const router = useRouter();
  const { data, loading, refresh } = useTable(cfg?.table ?? 'players', (q) => { let x = cfg?.select ? q.select(cfg.select) : q; if (cfg?.filter) for (const [k, v] of Object.entries(cfg.filter)) x = x.eq(k, v); return cfg?.order ? x.order(cfg.order, { ascending: !['kickoff_at', 'created_at', 'awarded_on', 'starts_at'].includes(cfg.order) }) : x; }, [resource]);
  const [editing, setEditing] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!cfg) return <Screen><T>Unknown section.</T></Screen>;
  if (!can(cfg.permission)) return <Screen><T>You don't have permission for this section.</T></Screen>;
  if (loading) return <Loading />;
  const pk = cfg.pk ?? (cfg.table === 'site_settings' ? 'key' : 'id');

  const save = async () => {
    setErr(null);
    const row: any = {};
    for (const f of cfg.fields) {
      const raw = editing[f.key];
      let v = raw;
      if (f.type === 'json') {
        // Settings values: "text", 3, true, null, {…} or [...]. Plain words without quotes are saved as text, so #0B6E4F or Super Strikers just work.
        const blank = raw === '' || raw === undefined || (raw === null && !editing.__existing);
        if (blank) { if (f.required) return setErr(`${f.label} is required (type null for an empty value)`); continue; }
        if (typeof raw === 'string' && editing.__editedJson?.[f.key]) { const t = raw.trim(); try { v = JSON.parse(t); } catch { v = /^[\[{]/.test(t) ? undefined : t; if (v === undefined) return setErr(`${f.label}: that looks like a list/object but isn't valid JSON`); } }
        row[f.key] = v; continue;
      }
      if (v === '' || v === undefined) v = null;
      if (f.type === 'number' && v !== null) v = Number(v);
      if (f.type === 'bool' && v === null) v = false;
      if (f.required && v === null) return setErr(`${f.label} is required`);
      // New rows: leave blanks out so database defaults apply (e.g. sort_order).
      if (v === null && !editing.__existing) continue;
      row[f.key] = v;
    }
    const isNew = !editing.__existing;
    const { error } = isNew ? await supabase.from(cfg.table).insert(row) : await supabase.from(cfg.table).update(row).eq(pk, editing.__existing);
    if (error) return setErr(error.message);
    setEditing(null); await refresh(); if (cfg.table === 'site_settings' || cfg.table === 'nav_items') await reload();
  };
  const del = async () => {
    const { error } = await supabase.from(cfg.table).delete().eq(pk, editing.__existing);
    if (error) return setErr(error.message);
    setEditing(null); await refresh(); if (cfg.table === 'nav_items') await reload();
  };

  if (editing) return (
    <Screen>
      <H>{editing.__existing ? 'Edit' : 'New'} · {cfg.title}</H>
      {cfg.fields.map((f) => (
        <View key={f.key} style={{ gap: 4 }}>
          {f.type === 'bool' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><T>{f.label}</T>
              <Switch value={!!editing[f.key]} onValueChange={(v) => setEditing({ ...editing, [f.key]: v })} /></View>
          ) : f.type === 'date' || f.type === 'datetime' ? (
            <DateTimeField label={f.label} mode={f.type} optional={!f.required} value={editing[f.key] ?? null} onChange={(v) => setEditing({ ...editing, [f.key]: v })} />
          ) : f.type === 'select' ? (<><T muted>{f.label}</T><SelectField f={f} value={editing[f.key]} onChange={(v) => setEditing({ ...editing, [f.key]: v })} /></>)
          : <Input label={f.label} multiline={f.type === 'longtext' || f.type === 'json'} value={f.type === 'json' ? (editing[f.key] === undefined ? '' : typeof editing[f.key] === 'string' && editing.__editedJson?.[f.key] ? editing[f.key] : JSON.stringify(editing[f.key])) : editing[f.key] == null ? '' : typeof editing[f.key] === 'object' ? JSON.stringify(editing[f.key]) : String(editing[f.key])}
              keyboardType={f.type === 'number' ? 'numeric' : 'default'} autoCapitalize="none" onChangeText={(v) => setEditing({ ...editing, [f.key]: v, ...(f.type === 'json' ? { __editedJson: { ...(editing.__editedJson ?? {}), [f.key]: true } } : {}) })} />}
        </View>
      ))}
      <Err msg={err} />
      <Btn title="Save" onPress={save} />
      {editing.__existing && <Btn title="Delete" kind="danger" onPress={del} />}
      <Btn title="Cancel" kind="ghost" onPress={() => { setEditing(null); setErr(null); }} />
    </Screen>
  );

  const blank: any = {}; cfg.fields.forEach((f) => { if (f.type === 'bool') blank[f.key] = true; });
  return (
    <Screen>
      <H>{cfg.title}</H>
      <Btn title="+ Add new" onPress={() => setEditing(blank)} />
      {(data as any[]).map((row) => (
        <Card key={row[pk]}>
          <T style={{ fontWeight: '700' }}>{String(cfg.titleField.split('.').reduce((a: any, k: string) => a?.[k], row) ?? '')}</T>
          <Btn title="Edit" kind="ghost" onPress={() => setEditing({ ...row, __existing: row[pk] })} />
          {cfg.extraLink && <Btn title={cfg.extraLink.label} kind="ghost" onPress={() => router.push((cfg.extraLink!.route + row[pk]) as any)} />}
        </Card>
      ))}
    </Screen>
  );
}
