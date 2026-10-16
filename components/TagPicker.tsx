import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Avatar, Btn, Input, T } from './ui';
import { supabase } from '../lib/supabase';
import { Person } from '../lib/tags';

type Cand = Person & { sub?: string };

/** Admin: tag players and members. Search by name, tap to add; "Suggest" finds player names inside your text. */
export function TagPicker({ value, onChange, suggestFrom }: { value: Person[]; onChange: (p: Person[]) => void; suggestFrom?: string }) {
  const [q, setQ] = useState(''); const [found, setFound] = useState<Cand[]>([]); const [note, setNote] = useState<string | null>(null);
  const has = (p: Person) => value.some((v) => v.kind === p.kind && v.id === p.id);
  const add = (p: Person) => { if (!has(p)) onChange([...value, { kind: p.kind, id: p.id, name: p.name, photo: p.photo }]); setQ(''); setFound([]); setNote(null); };
  useEffect(() => {
    const term = q.replace(/[%,()*]/g, ' ').trim(); if (term.length < 2) { setFound([]); return; }
    const t = setTimeout(async () => {
      const [pl, mem] = await Promise.all([
        supabase.from('players').select('id,full_name,photo_url,shirt_number,profile_id').eq('is_active', true).ilike('full_name', `%${term}%`).limit(8),
        supabase.rpc('search_members', { p_q: term }),
      ]);
      const profileIds = new Set((pl.data ?? []).map((p: any) => p.profile_id).filter(Boolean));
      setFound([
        ...(pl.data ?? []).map((p: any) => ({ kind: 'player' as const, id: p.id, name: p.full_name, photo: p.photo_url, sub: p.shirt_number != null ? `Player #${p.shirt_number}` : 'Player' })),
        ...(mem.data ?? []).filter((m: any) => !profileIds.has(m.id)).map((m: any) => ({ kind: 'member' as const, id: m.id, name: m.full_name, photo: m.avatar_url, sub: 'Member' })),
      ]);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const suggest = async () => {
    setNote(null); const text = (suggestFrom ?? '').toLowerCase(); if (text.trim().length < 3) return setNote('Write the title or story first.');
    const { data } = await supabase.from('players').select('id,full_name,photo_url').eq('is_active', true);
    const hits = (data ?? []).filter((p: any) => p.full_name && text.includes(p.full_name.toLowerCase()));
    const fresh = hits.filter((p: any) => !has({ kind: 'player', id: p.id, name: p.full_name }));
    if (!fresh.length) return setNote(hits.length ? 'Everyone mentioned is already tagged.' : 'No player names found in the text.');
    onChange([...value, ...fresh.map((p: any) => ({ kind: 'player' as const, id: p.id, name: p.full_name, photo: p.photo_url }))]); setNote(`Tagged ${fresh.length} player${fresh.length === 1 ? '' : 's'} found in the text. Check they are right.`);
  };
  return (
    <View style={{ gap: 8 }}>
      <T style={{ fontWeight: '800' }}>Tag people</T>
      <T muted style={{ fontSize: 12 }}>Tagged players and members show up when someone searches for them, and on their profile.</T>
      {value.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {value.map((p) => (
            <Pressable key={p.kind + p.id} accessibilityRole="button" accessibilityLabel={`Remove tag ${p.name}`} onPress={() => onChange(value.filter((v) => !(v.kind === p.kind && v.id === p.id)))}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#8886', borderRadius: 999, paddingVertical: 3, paddingLeft: 3, paddingRight: 10 }}>
              <Avatar url={p.photo} name={p.name} size={26} /><T style={{ fontWeight: '600' }}>{p.name} ✕</T>
            </Pressable>))}
        </View>) : <T muted>Nobody tagged yet.</T>}
      <Input placeholder="Search a player or member to tag" value={q} onChangeText={setQ} autoCapitalize="none" />
      {found.map((p) => (
        <Pressable key={p.kind + p.id} accessibilityRole="button" accessibilityLabel={`Tag ${p.name}`} onPress={() => add(p)} disabled={has(p)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4, opacity: has(p) ? 0.5 : 1 }}>
          <Avatar url={p.photo} name={p.name} size={36} /><View><T style={{ fontWeight: '700' }}>{p.name}</T><T muted style={{ fontSize: 12 }}>{has(p) ? 'Already tagged' : p.sub}</T></View>
        </Pressable>))}
      {suggestFrom !== undefined ? <Btn title="Suggest from the text" kind="ghost" onPress={suggest} /> : null}
      {note ? <T muted style={{ fontSize: 12 }}>{note}</T> : null}
    </View>
  );
}
