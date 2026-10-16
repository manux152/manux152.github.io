import { useCallback, useEffect, useState } from 'react';
import { Link, Redirect } from 'expo-router';
import { View } from 'react-native';
import { Screen, H, T, Card, Btn, Input, Chips, Toggle, Err, Loading, Avatar, fmtDate } from '../components/ui';
import { supabase } from '../lib/supabase';
import { useApp } from '../lib/app-context';
import { shareText } from '../lib/share';
import { consentOverview, fetchFamily, isOverdue, methodLabel, money, receiptText, redeemGuardianCode, signConsent, withdrawConsent, type ConsentRow, type FamilyMember, type Invoice } from '../lib/clubops';

function ConsentItem({ row, player, onChange }: { row: ConsentRow; player: string; onChange: () => void }) {
  const [open, setOpen] = useState(false); const [name, setName] = useState(''); const [agree, setAgree] = useState(false);
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const signed = !!row.signed_at && !row.withdrawn_at;
  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(null); try { await fn(); onChange(); } catch (e: any) { setErr(e.message); } setBusy(false); };
  return (
    <Card>
      <T style={{ fontWeight: '800' }}>{row.title}{row.is_required ? ' · required' : ''}</T>
      {signed ? <T>✅ Signed by {row.signer_name} on {fmtDate(row.signed_at!)}</T> : row.withdrawn_at ? <T muted>Consent withdrawn on {fmtDate(row.withdrawn_at)}</T> : <T muted>Not signed yet</T>}
      <Btn title={open ? 'Hide the form' : 'Read the form'} kind="ghost" onPress={() => setOpen(!open)} />
      {open ? <T>{row.body}</T> : null}
      {signed ? <Btn title="Withdraw my consent" kind="danger" disabled={busy} onPress={() => run(() => withdrawConsent(row.signature_id!))} /> : open ? (<>
        <Input label="Type the full name of the person signing" value={name} onChangeText={setName} autoCapitalize="words" />
        <Toggle label="I have read this form and I agree" value={agree} onChange={setAgree} />
        <Err msg={err} />
        <Btn title="Sign" disabled={busy || !agree || name.trim().length < 2} onPress={() => run(() => signConsent(row.form_id, player, name.trim(), null))} />
      </>) : null}
    </Card>
  );
}

/** My family: a player's own consents, fees and kit, and the same for children linked to a parent or guardian. */
export default function Family() {
  const { session, settings } = useApp();
  const [fam, setFam] = useState<FamilyMember[] | null>(null); const [sel, setSel] = useState<string | null>(null);
  const [forms, setForms] = useState<ConsentRow[]>([]); const [inv, setInv] = useState<Invoice[]>([]); const [kit, setKit] = useState<any[]>([]);
  const [code, setCode] = useState(''); const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const cur = typeof settings.currency === 'string' ? settings.currency : ''; const team = typeof settings.team_name === 'string' ? settings.team_name : 'the club';
  const how = typeof settings.fee_payment_instructions === 'string' ? settings.fee_payment_instructions : '';
  const loadFam = useCallback(async () => { const f = await fetchFamily(); setFam(f); setSel((s) => s ?? f[0]?.player_id ?? null); }, []);
  const loadPerson = useCallback(async () => {
    if (!sel) return;
    const [c, i, k] = await Promise.all([consentOverview(sel), supabase.from('fee_invoices').select('*').eq('player_id', sel).order('due_on', { ascending: false }).limit(40), supabase.from('kit_issues').select('*, kit_types(name)').eq('player_id', sel).order('issued_on', { ascending: false }).limit(40)]);
    setForms(c); setInv((i.data ?? []) as Invoice[]); setKit((k.data ?? []) as any[]);
  }, [sel]);
  useEffect(() => { if (session) loadFam(); }, [session, loadFam]);
  useEffect(() => { loadPerson(); }, [loadPerson]);
  if (!session) return <Redirect href="/login" />;
  if (fam === null) return <Loading />;
  const me = fam.find((f) => f.player_id === sel);
  const redeem = async () => { setErr(null); setMsg(null); try { const n = await redeemGuardianCode(code); setMsg(`${n} is now linked to your account.`); setCode(''); setSel(null); await loadFam(); } catch (e: any) { setErr(e.message); } };
  const due = inv.filter((i) => i.status === 'due');

  return (
    <Screen>
      <H>My family</H>
      {fam.length === 0 ? <T muted>Parents and guardians: ask the club for a link code for your child, then enter it below. Players with their own account see their forms, fees and kit here too.</T> : null}
      {fam.length > 1 ? <Chips options={fam.map((f) => ({ value: f.player_id, label: f.self ? `${f.name} (me)` : f.name }))} value={sel} onChange={setSel} /> : null}
      {me ? (<>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Avatar url={me.photo_url} name={me.name} size={48} /><View style={{ flex: 1 }}><T style={{ fontWeight: '800', fontSize: 18 }}>{me.name}</T><T muted>{me.self ? 'Your own page' : `You are the ${me.relationship}`}</T></View></View>
        <Link href={`/development?player=${me.player_id}` as any}><T style={{ fontWeight: '700', textDecorationLine: 'underline' }}>Form, badges, injuries and coach feedback →</T></Link>

        <H>Forms & consents</H>
        {forms.length === 0 ? <T muted>No forms to sign.</T> : forms.map((f) => <ConsentItem key={`${f.form_id}-${f.version}`} row={f} player={me.player_id} onChange={loadPerson} />)}

        <H>Fees</H>
        {due.length ? <Card><T style={{ fontWeight: '800' }}>To pay: {money(due.reduce((a, i) => a + Number(i.amount), 0), cur)}</T>{how ? <T>{how}</T> : <T muted>Ask the club how to pay.</T>}</Card> : null}
        {inv.length === 0 ? <T muted>No fees.</T> : inv.map((i) => (
          <Card key={i.id}>
            <T style={{ fontWeight: '700' }}>{i.title} · {money(i.amount, cur)}</T>
            <T muted style={{ color: isOverdue(i) ? '#D64545' : undefined }}>{i.status === 'paid' ? `Paid ${i.paid_on}${i.method ? ` · ${methodLabel(i.method)}` : ''} · receipt ${i.receipt_no}` : i.status === 'due' ? `${isOverdue(i) ? 'Overdue — was due' : 'Due'} ${i.due_on}` : i.status === 'waived' ? 'Waived' : 'Cancelled'}</T>
            {i.status === 'paid' ? <Btn title="Share receipt" kind="ghost" onPress={async () => setMsg(await shareText(receiptText(i, me.name, team, cur)))} /> : null}
          </Card>))}

        <H>Kit</H>
        {kit.length === 0 ? <T muted>No kit issued.</T> : kit.map((k) => (
          <Card key={k.id}><T style={{ fontWeight: '700' }}>{k.kit_types?.name}{k.size ? ` · size ${k.size}` : ''}{k.shirt_number != null ? ` · #${k.shirt_number}` : ''}</T>
            <T muted style={{ color: !k.returned_on && k.due_back_on && k.due_back_on < new Date().toISOString().slice(0, 10) ? '#D64545' : undefined }}>{k.returned_on ? `Returned ${k.returned_on}` : `Issued ${k.issued_on}${k.due_back_on ? ` · please return by ${k.due_back_on}` : ''}`}</T></Card>))}
      </>) : null}
      <Card>
        <T style={{ fontWeight: '800' }}>{fam.some((f) => !f.self) ? 'Link another child' : 'Link a child'}</T>
        <T muted>Enter the code the club gave you. It works once and expires after 14 days.</T>
        <Input label="Link code" autoCapitalize="characters" autoCorrect={false} value={code} onChangeText={setCode} />
        <Err msg={err} />{msg ? <T>{msg}</T> : null}
        <Btn title="Link" disabled={!code.trim()} onPress={redeem} />
      </Card>
    </Screen>
  );
}
