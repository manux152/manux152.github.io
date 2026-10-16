import { useState } from 'react';
import { Screen, H, T, Card, Btn, Err } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../lib/app-context';
import { Col, fetchAll, logExport, saveCsv, stamp, toCsv } from '../../lib/csv';

type DS = { key: string; title: string; note: string; perm: string; personal: boolean; run: () => Promise<{ rows: any[]; cols: Col[] }> };
const d = (v: any) => (v ? String(v).slice(0, 10) : '');

/** Admin → Export data: spreadsheet (CSV) files of the club's records. Every export is recorded in the audit log. */
export default function ExportData() {
  const { can } = useApp(); const [busy, setBusy] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const sets: DS[] = [
    { key: 'players', title: 'Players', note: 'Name, shirt number, position, active.', perm: 'players.manage', personal: true, run: async () => ({
      rows: await fetchAll(() => supabase.from('players').select('full_name, shirt_number, is_active, positions(name)').order('full_name')),
      cols: [{ header: 'Name', get: (r) => r.full_name }, { header: 'Shirt', get: (r) => r.shirt_number }, { header: 'Position', get: (r) => r.positions?.name }, { header: 'Active', get: (r) => (r.is_active ? 'yes' : 'no') }] }) },
    { key: 'results', title: 'Match results', note: 'Date, opponent, home/away, score, competition, venue.', perm: 'matches.manage', personal: false, run: async () => ({
      rows: await fetchAll(() => supabase.from('matches').select('kickoff_at, is_home, status, goals_for, goals_against, venue, competition, opponents(name)').order('kickoff_at', { ascending: false })),
      cols: [{ header: 'Date', get: (r) => d(r.kickoff_at) }, { header: 'Opponent', get: (r) => r.opponents?.name }, { header: 'Home/Away', get: (r) => (r.is_home ? 'Home' : 'Away') }, { header: 'Status', get: (r) => r.status }, { header: 'Goals for', get: (r) => r.goals_for }, { header: 'Goals against', get: (r) => r.goals_against }, { header: 'Competition', get: (r) => r.competition }, { header: 'Venue', get: (r) => r.venue }] }) },
    { key: 'attendance', title: 'Training attendance', note: 'One row per player per session.', perm: 'training.manage', personal: true, run: async () => ({
      rows: await fetchAll(() => supabase.from('training_attendance').select('status, note, training_sessions(title, session_date), players(full_name)').order('marked_at', { ascending: false })),
      cols: [{ header: 'Date', get: (r) => d(r.training_sessions?.session_date) }, { header: 'Session', get: (r) => r.training_sessions?.title }, { header: 'Player', get: (r) => r.players?.full_name }, { header: 'Status', get: (r) => r.status }, { header: 'Note', get: (r) => r.note }] }) },
    { key: 'orders', title: 'Shop orders', note: 'Reference, date, customer, status, payment and totals.', perm: 'orders.manage', personal: true, run: async () => ({
      rows: await fetchAll(() => supabase.from('orders').select('reference, created_at, customer_name, customer_email, customer_phone, status, payment_status, currency, subtotal, delivery_fee, delivery_method').order('created_at', { ascending: false })),
      cols: [{ header: 'Reference', get: (r) => r.reference }, { header: 'Date', get: (r) => d(r.created_at) }, { header: 'Customer', get: (r) => r.customer_name }, { header: 'Email', get: (r) => r.customer_email }, { header: 'Phone', get: (r) => r.customer_phone }, { header: 'Status', get: (r) => r.status }, { header: 'Payment', get: (r) => r.payment_status }, { header: 'Delivery', get: (r) => r.delivery_method }, { header: 'Currency', get: (r) => r.currency }, { header: 'Items', get: (r) => r.subtotal }, { header: 'Delivery fee', get: (r) => r.delivery_fee }, { header: 'Total', get: (r) => Number(r.subtotal ?? 0) + Number(r.delivery_fee ?? 0) }] }) },
    { key: 'fees', title: 'Fees and receipts', note: 'Every invoice with status, payment method and receipt number.', perm: 'fees.manage', personal: true, run: async () => ({
      rows: await fetchAll(() => supabase.from('fee_invoices').select('title, amount, due_on, status, paid_on, method, reference, receipt_no, players(full_name)').order('due_on', { ascending: false })),
      cols: [{ header: 'Player', get: (r) => r.players?.full_name }, { header: 'For', get: (r) => r.title }, { header: 'Amount', get: (r) => r.amount }, { header: 'Due', get: (r) => r.due_on }, { header: 'Status', get: (r) => r.status }, { header: 'Paid on', get: (r) => r.paid_on }, { header: 'Method', get: (r) => r.method }, { header: 'Reference', get: (r) => r.reference }, { header: 'Receipt', get: (r) => r.receipt_no }] }) },
    { key: 'consents', title: 'Signed consent forms', note: 'Who signed which form, when, and whether it was withdrawn.', perm: 'families.manage', personal: true, run: async () => ({
      rows: await fetchAll(() => supabase.from('consent_signatures').select('title_snapshot, form_version, signer_name, relationship, signed_at, withdrawn_at, players(full_name)').order('signed_at', { ascending: false })),
      cols: [{ header: 'Player', get: (r) => r.players?.full_name }, { header: 'Form', get: (r) => r.title_snapshot }, { header: 'Version', get: (r) => r.form_version }, { header: 'Signed by', get: (r) => r.signer_name }, { header: 'Relationship', get: (r) => r.relationship }, { header: 'Signed on', get: (r) => d(r.signed_at) }, { header: 'Withdrawn on', get: (r) => d(r.withdrawn_at) }] }) },
    { key: 'kit', title: 'Kit issued', note: 'What each player holds, with return dates.', perm: 'kit.manage', personal: true, run: async () => ({
      rows: await fetchAll(() => supabase.from('kit_issues').select('size, shirt_number, issued_on, due_back_on, returned_on, note, players(full_name), kit_types(name)').order('issued_on', { ascending: false })),
      cols: [{ header: 'Player', get: (r) => r.players?.full_name }, { header: 'Item', get: (r) => r.kit_types?.name }, { header: 'Size', get: (r) => r.size }, { header: 'Number', get: (r) => r.shirt_number }, { header: 'Issued', get: (r) => r.issued_on }, { header: 'Due back', get: (r) => r.due_back_on }, { header: 'Returned', get: (r) => r.returned_on }, { header: 'Note', get: (r) => r.note }] }) },
  ].filter((s) => can(s.perm));
  const go = async (s: DS) => {
    setBusy(s.key); setErr(null); setMsg(null);
    try { const { rows, cols } = await s.run(); const out = await saveCsv(`${s.key}-${stamp()}.csv`, toCsv(rows, cols)); await logExport(s.key, rows.length); setMsg(`${out} · ${rows.length} row${rows.length === 1 ? '' : 's'}`); }
    catch (e: any) { setErr(e.message ?? 'The export failed.'); }
    setBusy(null);
  };
  return (
    <Screen>
      <H>Export data</H>
      <T muted>Download records as a spreadsheet (CSV) that opens in Excel, Numbers or Google Sheets. You only see the lists you have permission for, and each export is recorded in the audit log (who, what and how many rows). Exports can hold personal information: keep the file private, share it only with people who need it, and delete it when you are done.</T>
      <Err msg={err} />{msg ? <T>{msg}</T> : null}
      {sets.length === 0 ? <T muted>You don't have permission to export anything.</T> : sets.map((s) => (
        <Card key={s.key}><T style={{ fontWeight: '800' }}>{s.title}{s.personal ? ' · personal data' : ''}</T><T muted>{s.note}</T><Btn title={busy === s.key ? 'Preparing…' : 'Download CSV'} disabled={!!busy} onPress={() => go(s)} /></Card>))}
    </Screen>
  );
}
