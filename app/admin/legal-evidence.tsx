import { useCallback, useEffect, useState } from 'react';
import { Screen, H, T, Card, Btn, Chips, Err, Loading, fmtDate } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../lib/app-context';
import { shareText } from '../../lib/share';
import { toCsv } from '../../lib/csv';

const ACTION: Record<string, string> = { accept_all: 'Accepted all', reject_non_essential: 'Rejected optional', custom: 'Custom choice' };
const yn = (b: boolean) => (b ? 'on' : 'off');

/** Admin → Acceptance & consent records: the evidence that people accepted the Terms and Privacy Policy and what cookies they allowed. Read-only and cannot be edited. */
export default function LegalEvidence() {
  const { can } = useApp();
  const [tab, setTab] = useState('accept'); const [acc, setAcc] = useState<any[] | null>(null); const [con, setCon] = useState<any[]>([]); const [names, setNames] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => {
    const [a, c] = await Promise.all([
      supabase.from('legal_acceptances').select('*').order('accepted_at', { ascending: false }).limit(1000),
      supabase.from('cookie_consents').select('*').order('created_at', { ascending: false }).limit(1000)]);
    if (a.error || c.error) setErr((a.error ?? c.error)!.message);
    setAcc(a.data ?? []); setCon(c.data ?? []);
    const ids = [...new Set([...(a.data ?? []), ...(c.data ?? [])].map((r: any) => r.user_id).filter(Boolean))] as string[];
    if (ids.length) { const p = await supabase.from('profiles').select('id,full_name').in('id', ids.slice(0, 500)); setNames(Object.fromEntries((p.data ?? []).map((x: any) => [x.id, x.full_name || 'Member']))); }
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!can('settings.manage')) return <Screen><T>No permission.</T></Screen>;
  if (acc === null) return <Loading />;
  const who = (r: any) => (r.user_id ? names[r.user_id] ?? 'Member' : 'Visitor') + ` · ${String(r.device_id).slice(0, 8)}`;
  const since = Date.now() - 30 * 86400000; const recent = con.filter((r) => new Date(r.created_at).getTime() >= since);
  const count = (a: string) => recent.filter((r) => r.action === a).length;
  const pctOn = (k: string) => (recent.length ? Math.round((recent.filter((r) => r[k]).length / recent.length) * 100) : 0);
  const exp = async () => {
    const csv = tab === 'accept'
      ? toCsv(acc, [{ header: 'Accepted at', get: (r) => r.accepted_at }, { header: 'Document', get: (r) => r.document_slug }, { header: 'Version', get: (r) => r.document_version }, { header: 'Content fingerprint', get: (r) => r.content_hash }, { header: 'Account', get: (r) => (r.user_id ? names[r.user_id] ?? r.user_id : '') }, { header: 'Device', get: (r) => r.device_id }, { header: 'Platform', get: (r) => r.platform }, { header: 'Language', get: (r) => r.locale }, { header: 'IP address', get: (r) => r.ip_address }, { header: 'Device details', get: (r) => r.user_agent }])
      : toCsv(con, [{ header: 'Chosen at', get: (r) => r.created_at }, { header: 'Choice', get: (r) => r.action }, { header: 'Necessary', get: () => 'on' }, { header: 'Preferences', get: (r) => yn(r.preferences) }, { header: 'Analytics', get: (r) => yn(r.analytics) }, { header: 'Marketing', get: (r) => yn(r.marketing) }, { header: 'Cookie policy version', get: (r) => r.policy_version }, { header: 'Account', get: (r) => (r.user_id ? names[r.user_id] ?? r.user_id : '') }, { header: 'Device', get: (r) => r.device_id }, { header: 'Platform', get: (r) => r.platform }, { header: 'IP address', get: (r) => r.ip_address }]);
    setMsg(await shareText(csv));
  };
  return (
    <Screen>
      <H>Acceptance & consent records</H>
      <T muted>Evidence kept by the system. Records cannot be edited or deleted. Each acceptance stores the document version and a fingerprint of the exact text shown.</T>
      <Chips options={[{ value: 'accept', label: 'Terms & Privacy' }, { value: 'cookies', label: 'Cookie choices' }]} value={tab} onChange={(v) => v && setTab(v)} />
      {tab === 'accept' ? <>
        <Card><T style={{ fontWeight: '800' }}>{acc.length} acceptance records</T>
          {['terms', 'privacy'].map((s) => { const rs = acc.filter((r) => r.document_slug === s); const v = Math.max(0, ...rs.map((r) => r.document_version)); return <T key={s} muted style={{ fontSize: 13 }}>{s === 'terms' ? 'Terms of Use' : 'Privacy Policy'}: {rs.filter((r) => r.document_version === v).length} on the latest version ({v || '–'})</T>; })}</Card>
        {acc.slice(0, 50).map((r) => <Card key={r.id}><T style={{ fontWeight: '700' }}>{who(r)}</T><T>{r.document_slug === 'terms' ? 'Terms of Use' : 'Privacy Policy'} · version {r.document_version}</T><T muted style={{ fontSize: 12 }}>{fmtDate(r.accepted_at)} · {r.platform}{r.ip_address ? ` · ${r.ip_address}` : ''}</T></Card>)}
        {acc.length === 0 ? <T muted>No acceptances yet.</T> : null}
      </> : <>
        <Card><T style={{ fontWeight: '800' }}>Last 30 days · {recent.length} choices</T>
          <T muted style={{ fontSize: 13 }}>{`Accepted all ${count('accept_all')} · Rejected optional ${count('reject_non_essential')} · Custom ${count('custom')}`}</T>
          <T muted style={{ fontSize: 13 }}>{`Allowed: preferences ${pctOn('preferences')}% · analytics ${pctOn('analytics')}% · marketing ${pctOn('marketing')}%`}</T></Card>
        {con.slice(0, 50).map((r) => <Card key={r.id}><T style={{ fontWeight: '700' }}>{ACTION[r.action] ?? r.action}</T><T>{`Preferences ${yn(r.preferences)} · Analytics ${yn(r.analytics)} · Marketing ${yn(r.marketing)}`}</T><T muted style={{ fontSize: 12 }}>{who(r)} · {fmtDate(r.created_at)} · {r.platform}</T></Card>)}
        {con.length === 0 ? <T muted>No cookie choices recorded yet.</T> : null}
      </>}
      <Err msg={err} />{msg ? <T muted>{msg}</T> : null}
      <Btn title="Export all as CSV" onPress={exp} />
    </Screen>
  );
}
