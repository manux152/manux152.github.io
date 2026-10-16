import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';

export type FamilyMember = { player_id: string; name: string; photo_url: string | null; self: boolean; relationship: string; requires_guardian: boolean };
export const fetchFamily = async (): Promise<FamilyMember[]> => { const { data } = await supabase.rpc('my_family'); return (data ?? []) as FamilyMember[]; };
export const redeemGuardianCode = async (code: string): Promise<string> => {
  const { data, error } = await supabase.rpc('guardian_code_redeem', { p_code: code });
  if (error) throw new Error(error.message);
  if (!data) throw new Error('That code was not found, has expired or was already used. Ask the club for a new one.');
  return data as string;
};
export type Attention = { forms: number; fees: number; kit: number };
export function useAttention(enabled: boolean) {
  const [a, setA] = useState<Attention>({ forms: 0, fees: 0, kit: 0 });
  useEffect(() => { if (enabled) supabase.rpc('family_attention').then(({ data }) => data && setA(data as Attention)); }, [enabled]);
  return a;
}

// ───────── Consents ─────────
export type ConsentRow = { form_id: string; title: string; body: string; version: number; is_required: boolean; signature_id: string | null; signed_at: string | null; signer_name: string | null; withdrawn_at: string | null };
export const consentOverview = async (player: string): Promise<ConsentRow[]> => { const { data } = await supabase.rpc('consent_overview', { p_player: player }); return (data ?? []) as ConsentRow[]; };
export const signConsent = async (form: string, player: string, name: string, relationship: string | null) => { const { error } = await supabase.rpc('consent_sign', { p_form: form, p_player: player, p_name: name, p_relationship: relationship }); if (error) throw new Error(error.message); };
export const withdrawConsent = async (sig: string) => { const { error } = await supabase.rpc('consent_withdraw', { p_signature: sig }); if (error) throw new Error(error.message); };

// ───────── Fees ─────────
export type Invoice = { id: string; player_id: string; title: string; amount: number; due_on: string; status: 'due' | 'paid' | 'waived' | 'cancelled'; paid_on: string | null; method: string | null; reference: string | null; receipt_no: string | null; note: string | null };
export const METHODS = [{ value: 'cash', label: 'Cash' }, { value: 'mobile_money', label: 'Mobile money' }, { value: 'bank', label: 'Bank transfer' }, { value: 'card', label: 'Card' }, { value: 'other', label: 'Other' }];
export const methodLabel = (m: string | null) => METHODS.find((x) => x.value === m)?.label ?? m ?? '';
export const isOverdue = (i: Pick<Invoice, 'status' | 'due_on'>) => i.status === 'due' && i.due_on < new Date().toISOString().slice(0, 10);
export const money = (n: number | string, cur?: string) => `${cur ? cur + ' ' : ''}${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
export function receiptText(i: Invoice, who: string, team: string, cur?: string) {
  return [`${team} — payment receipt`, `Receipt: ${i.receipt_no}`, `Player: ${who}`, `For: ${i.title}`, `Amount: ${money(i.amount, cur)}`, `Paid on: ${i.paid_on}${i.method ? ` (${methodLabel(i.method)})` : ''}`, i.reference ? `Reference: ${i.reference}` : ''].filter(Boolean).join('\n');
}

// ───────── Rotas ─────────
export type RotaSlot = { id: string; label: string; capacity: number; mine: boolean; people: { name: string; seats: number | null; note: string | null }[] };
export type Rota = { id: string; title: string; kind: 'volunteer' | 'transport'; match_id: string | null; starts_at: string; location: string | null; notes: string | null; slots: RotaSlot[] };
export function useRotas() {
  const [rotas, setRotas] = useState<Rota[] | null>(null);
  const load = useCallback(async () => { const { data } = await supabase.rpc('rotas_upcoming', { p_include_past: false }); setRotas((data ?? []) as Rota[]); }, []);
  useEffect(() => { load(); }, [load]);
  return { rotas, refresh: load };
}

// ───────── Sponsors ─────────
export type Placement = 'footer' | 'home' | 'match';
const seen = new Set<string>();      // count each sponsor + place once per visit, so refreshing the page does not inflate views
export function trackSponsor(id: string, placement: Placement, kind: 'view' | 'click') {
  const key = `${id}:${placement}:${kind}`;
  if (kind === 'view') { if (seen.has(key)) return; seen.add(key); }
  supabase.rpc('sponsor_track', { p_sponsor: id, p_placement: placement, p_kind: kind }).then(() => {}, () => {});
}
export const TIER_RANK: Record<string, number> = { headline: 0, gold: 1, silver: 2, bronze: 3, partner: 4 };
