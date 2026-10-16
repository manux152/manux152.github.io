import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { Avatar, Btn, Card, Err, H, Input, Loading, Screen, T, useAccent } from '../../components/ui';
import { useApp } from '../../lib/app-context';
import { Person, Room, directory, fetchOverview, openDirect, previewOf, shortTime } from '../../lib/chat';
import { supabase } from '../../lib/supabase';

// Inbox: the team chat, your one-to-one chats (newest first, unread counts) and a way to start a new conversation.
export default function ChatInbox() {
  const { session, settings } = useApp(); const router = useRouter(); const accent = useAccent(); const me = session?.user.id ?? null;
  const [rooms, setRooms] = useState<Room[] | null>(null); const [err, setErr] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false); const [q, setQ] = useState(''); const [people, setPeople] = useState<Person[] | null>(null);
  const on = settings.chat_enabled !== false && settings.chat_enabled !== 'false';
  const load = useCallback(() => { if (!me || !on) return; fetchOverview().then(setRooms).catch((e) => setErr(e.message)); }, [me, on]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => {
    if (!me || !on) return;
    const ch = supabase.channel(`inbox-${Math.random().toString(36).slice(2, 7)}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [me, on, load]);
  useEffect(() => { if (!newOpen) return; const t = setTimeout(() => directory(q).then(setPeople).catch(() => setPeople([])), 250); return () => clearTimeout(t); }, [newOpen, q]);
  if (!session) return <Redirect href="/login" />;
  if (!on) return <Screen><H>Messages</H><T muted>Chat is switched off right now.</T></Screen>;
  const start = async (p: Person) => { setErr(null); try { router.push(`/chat/${await openDirect(p.id)}` as any); } catch (e: any) { setErr(e.message); } };
  const team = rooms?.filter((r) => r.kind === 'team') ?? []; const dms = rooms?.filter((r) => r.kind === 'direct') ?? [];
  const row = (r: Room) => {
    const name = r.kind === 'team' ? r.title ?? 'Team chat' : r.other?.name ?? 'Member';
    return (
      <Pressable key={r.id} accessibilityRole="link" accessibilityLabel={`${name}${r.unread ? `, ${r.unread} unread` : ''}`} onPress={() => router.push(`/chat/${r.id}` as any)}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {r.kind === 'team' ? <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}><T style={{ fontSize: 24 }}>⚽</T></View> : <Avatar url={r.other?.avatar} name={name} size={48} />}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><T style={{ fontWeight: r.unread ? '900' : '700', flexShrink: 1 }} numberOfLines={1}>{name}</T><T muted style={{ fontSize: 12 }}>{r.last ? shortTime(r.last.created_at) : ''}</T></View>
            <T muted={!r.unread} style={{ fontSize: 14, fontWeight: r.unread ? '700' : '400' }} numberOfLines={1}>{previewOf(r, me)}</T>
          </View>
          {r.unread > 0 ? <View style={{ minWidth: 24, height: 24, borderRadius: 12, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}><T style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{r.unread > 99 ? '99+' : r.unread}</T></View> : null}
        </Card>
      </Pressable>);
  };
  return (
    <Screen>
      <H>Messages</H>
      <Btn title={newOpen ? 'Close' : '✏️ New message'} onPress={() => { setNewOpen(!newOpen); setErr(null); }} />
      {newOpen ? (
        <Card>
          <Input placeholder="Search a name…" value={q} onChangeText={setQ} autoCapitalize="none" />
          {people === null ? <Loading /> : people.length === 0 ? <T muted>{q.trim().length >= 2 ? 'Nobody found. You can only message people who allow it.' : 'No one is available to message yet.'}</T>
            : people.map((p) => (
              <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Message ${p.full_name}`} onPress={() => start(p)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
                <Avatar url={p.avatar_url} name={p.full_name} size={40} /><T style={{ fontWeight: '700' }}>{p.full_name}</T>
              </Pressable>))}
        </Card>) : null}
      <Err msg={err} />
      {rooms === null ? <Loading /> : (<>
        {team.map(row)}{dms.map(row)}
        {rooms.length === 0 ? <T muted>No conversations yet. Tap “New message” to start one.</T> : null}
      </>)}
      <T muted style={{ fontSize: 12 }}>Be kind. Messages can be reported, and the club can remove people who break the rules.</T>
    </Screen>
  );
}
