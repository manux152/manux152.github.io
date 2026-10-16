import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Screen, H, T, Card, Btn, Input, Chips, Toggle, Err, Loading, fmtDate } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../lib/app-context';

type Form = { id: string; title: string; body: string; version: number; applies_to: string; is_required: boolean; is_active: boolean };
type Roster = { player_id: string; name: string; requires_guardian: boolean; signed_at: string | null; signer_name: string | null; relationship: string | null; withdrawn_at: string | null };
const BLANK = { id: '', title: '', body: '', applies_to: 'all', is_required: true, is_active: true };

/** Admin → Consent forms: photo permission, medical consent, code of conduct… Editing the wording asks everyone to sign again. */
export default function Consents() {
  const { can } = useApp();
  const [forms, setForms] = useState<Form[] | null>(null); const [f, setF] = useState<any>(BLANK); const [roster, setRoster] = useState<{ form: Form; rows: Roster[] } | null>(null);
  const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => { const { data } = await supabase.from('consent_forms').select('*').order('created_at'); setForms((data ?? []) as Form[]); }, []);
  useEffect(() => { load(); }, [load]);
  if (!can('families.manage')) return <Screen><T>No permission.</T></Screen>;
  if (forms === null) return <Loading />;
  const save = async () => {
    setErr(null); setMsg(null);
    if (f.title.trim().length < 3) return setErr('Give the form a title.');
    if (f.body.trim().length < 20) return setErr('Write the wording people are agreeing to (at least a couple of sentences).');
    const v = { title: f.title.trim(), body: f.body.trim(), applies_to: f.applies_to, is_required: f.is_required, is_active: f.is_active };
    const { error } = f.id ? await supabase.from('consent_forms').update(v).eq('id', f.id) : await supabase.from('consent_forms').insert(v);
    if (error) return setErr(error.message);
    setMsg(f.id ? 'Saved. If you changed the wording, everyone needs to sign again.' : 'Form added.'); setF(BLANK); await load();
  };
  const toggleActive = async (x: Form) => { await supabase.from('consent_forms').update({ is_active: !x.is_active }).eq('id', x.id); await load(); };
  const del = async (x: Form) => { const { error } = await supabase.from('consent_forms').delete().eq('id', x.id); if (error) setErr(error.message); setRoster(null); await load(); };
  const show = async (x: Form) => { const { data, error } = await supabase.rpc('consent_roster', { p_form: x.id }); if (error) return setErr(error.message); setRoster({ form: x, rows: (data ?? []) as Roster[] }); };
  const done = (r: Roster) => !!r.signed_at && !r.withdrawn_at;
  return (
    <Screen>
      <H>Consent forms</H>
      <T muted>Members read and sign in the app (a parent or guardian signs for players who “need a guardian”). The wording agreed to is stored with each signature, so later edits never change what someone signed. Use plain language and ask your club's welfare officer or insurer to check forms for photos, medical information and travel.</T>
      <Card>
        <T style={{ fontWeight: '800' }}>{f.id ? 'Edit form' : 'New form'}</T>
        <Input label="Title (e.g. Photo and video permission)" value={f.title} onChangeText={(v) => setF({ ...f, title: v })} maxLength={120} />
        <Input label="Wording" value={f.body} onChangeText={(v) => setF({ ...f, body: v })} multiline numberOfLines={8} maxLength={8000} />
        <T muted>Who must sign</T>
        <Chips options={[{ value: 'all', label: 'Every player' }, { value: 'minors', label: 'Players who need a guardian' }]} value={f.applies_to} onChange={(v) => setF({ ...f, applies_to: v })} />
        <Toggle label="Required" value={f.is_required} onChange={(v) => setF({ ...f, is_required: v })} />
        <Toggle label="Open for signing" value={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} />
        <Err msg={err} />{msg ? <T>{msg}</T> : null}
        <Btn title={f.id ? 'Save changes' : 'Add form'} onPress={save} />{f.id ? <Btn title="Cancel" kind="ghost" onPress={() => setF(BLANK)} /> : null}
      </Card>
      {forms.map((x) => (
        <Card key={x.id}>
          <T style={{ fontWeight: '800' }}>{x.title} <T muted>· version {x.version}{x.is_required ? ' · required' : ''}{x.is_active ? '' : ' · closed'}</T></T>
          <View style={{ gap: 8 }}>
            <Btn title="Who has signed?" kind="ghost" onPress={() => show(x)} />
            <Btn title="Edit" kind="ghost" onPress={() => setF({ ...x })} />
            <Btn title={x.is_active ? 'Close for signing' : 'Reopen'} kind="ghost" onPress={() => toggleActive(x)} />
            <Btn title="Delete (removes all signatures)" kind="danger" onPress={() => del(x)} />
          </View>
          {roster?.form.id === x.id ? (<View style={{ gap: 4 }}>
            <T style={{ fontWeight: '700' }}>{roster.rows.filter(done).length} of {roster.rows.length} signed</T>
            {roster.rows.map((r) => <T key={r.player_id} muted={done(r)} style={{ color: done(r) ? undefined : '#D64545' }}>{done(r) ? '✅' : r.withdrawn_at ? '↩️' : '❌'} {r.name}{done(r) ? ` · ${r.signer_name} (${r.relationship}) ${fmtDate(r.signed_at!)}` : r.withdrawn_at ? ' · withdrawn' : ''}</T>)}
          </View>) : null}
        </Card>))}
    </Screen>
  );
}
