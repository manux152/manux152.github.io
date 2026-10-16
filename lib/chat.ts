import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';
import { canEditImages, editImage } from './imageTools';

export type Room = {
  id: string; kind: 'direct' | 'team'; title: string | null; last_message_at: string; muted: boolean; unread: number;
  last: { kind: string; body: string; sender_id: string | null; created_at: string; deleted: boolean } | null;
  other: { id: string; name: string; avatar: string | null } | null;
};
export type Msg = { id: string; room_id: string; sender_id: string | null; kind: 'text' | 'image' | 'sticker' | 'call' | 'system'; body: string | null; image_path: string | null; sticker_url: string | null; call_id: string | null; created_at: string; deleted_at: string | null };
export type Person = { id: string; full_name: string; avatar_url: string | null };
export type Reactions = Record<string, { emoji: string; users: string[] }[]>;

// Tiny event bus so the unread badge refreshes right after you read a room.
const listeners = new Set<() => void>();
export const onChatChange = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
export const notifyChatChange = () => listeners.forEach((cb) => cb());

export async function fetchOverview(): Promise<Room[]> { const { data, error } = await supabase.rpc('chat_overview'); if (error) throw new Error(error.message); return (data ?? []) as Room[]; }
export async function openDirect(other: string): Promise<string> { const { data, error } = await supabase.rpc('chat_open_direct', { p_other: other }); if (error) throw new Error(error.message); return data as string; }
export async function directory(q: string): Promise<Person[]> { const { data } = await supabase.rpc('chat_directory', { p_q: q || null }); return (data ?? []) as Person[]; }
export async function roomPeople(room: string): Promise<Record<string, Person>> { const { data } = await supabase.rpc('chat_room_people', { p_room: room }); return Object.fromEntries(((data ?? []) as Person[]).map((p) => [p.id, p])); }
export async function markRead(room: string) { await supabase.rpc('chat_mark_read', { p_room: room }); notifyChatChange(); }
export async function fetchMessages(room: string, before?: string, limit = 40): Promise<Msg[]> {
  let q = supabase.from('chat_messages').select('*').eq('room_id', room).order('created_at', { ascending: false }).limit(limit);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q; if (error) throw new Error(error.message); return (data ?? []) as Msg[];
}
const fail = (e: any) => { if (e) throw new Error(/row-level security|violates/i.test(e.message) ? 'This message could not be sent. You may be blocked, the chat may be switched off, or you are not allowed to message this person.' : e.message); };
export async function sendText(room: string, me: string, text: string) { const { error } = await supabase.from('chat_messages').insert({ room_id: room, sender_id: me, kind: 'text', body: text.trim().slice(0, 2000) }); fail(error); }
export async function sendSticker(room: string, me: string, s: { emoji?: string; url?: string }) { const { error } = await supabase.from('chat_messages').insert({ room_id: room, sender_id: me, kind: 'sticker', body: s.emoji ?? null, sticker_url: s.url ?? null }); fail(error); }

/** Picks (or takes) a photo and sends it. Photos live in a private bucket; only people in the chat can see them. */
export async function pickPhoto(source: 'camera' | 'library'): Promise<ImagePicker.ImagePickerAsset | null> {
  if (source === 'camera') { const perm = await ImagePicker.requestCameraPermissionsAsync(); if (!perm.granted && Platform.OS !== 'web') throw new Error('Allow camera access in your settings to take a snapshot.'); }
  const r = source === 'camera' ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  return r.canceled ? null : r.assets[0];
}
export async function sendPhoto(room: string, me: string, a: ImagePicker.ImagePickerAsset, caption?: string) {
  if (a.fileSize && a.fileSize > 25 * 1048576) throw new Error('That photo is too large.');
  let uri = a.uri; let mime = 'image/jpeg';
  if (canEditImages) { try { const e: any = await editImage(a.uri, []); uri = e.uri ?? uri; mime = e.mimeType ?? mime; } catch { /* send the original */ } }
  const path = `${room}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'}`;
  let body: any;
  if (Platform.OS === 'web') body = await (await fetch(uri)).blob();
  else { body = new FormData(); body.append('file', { uri, name: path.split('/').pop(), type: mime } as any); }
  const up = await supabase.storage.from('chat').upload(path, body, { contentType: mime });
  if (up.error) throw new Error(/bucket not found/i.test(up.error.message) ? 'Photo storage is not set up yet. Run migration 019_chat.sql in Supabase.' : /row-level|policy/i.test(up.error.message) ? 'Photos are switched off, or you cannot message this person.' : up.error.message);
  const { error } = await supabase.from('chat_messages').insert({ room_id: room, sender_id: me, kind: 'image', image_path: path, body: caption?.trim() || null }); fail(error);
}
const urlCache = new Map<string, { url: string; exp: number }>();
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}; const need: string[] = [];
  paths.forEach((p) => { const c = urlCache.get(p); if (c && c.exp > Date.now() + 60000) out[p] = c.url; else need.push(p); });
  if (need.length) { const { data } = await supabase.storage.from('chat').createSignedUrls(need, 3600); (data ?? []).forEach((r: any) => { if (r.signedUrl && r.path) { urlCache.set(r.path, { url: r.signedUrl, exp: Date.now() + 3600e3 }); out[r.path] = r.signedUrl; } }); }
  return out;
}

export async function fetchReactions(ids: string[]): Promise<Reactions> {
  const out: Reactions = {}; if (!ids.length) return out;
  const { data } = await supabase.from('chat_reactions').select('message_id,user_id,emoji').in('message_id', ids);
  (data ?? []).forEach((r: any) => { const list = (out[r.message_id] ||= []); const e = list.find((x) => x.emoji === r.emoji); if (e) e.users.push(r.user_id); else list.push({ emoji: r.emoji, users: [r.user_id] }); });
  return out;
}
export async function toggleReaction(msg: string, me: string, emoji: string, has: boolean) {
  const { error } = has ? await supabase.from('chat_reactions').delete().eq('message_id', msg).eq('user_id', me).eq('emoji', emoji) : await supabase.from('chat_reactions').insert({ message_id: msg, user_id: me, emoji }); fail(error);
}
export async function deleteMessage(id: string) { const { error } = await supabase.rpc('chat_delete_message', { p_id: id }); if (error) throw new Error(error.message); }
export async function reportMessage(id: string, reason: string) { const { error } = await supabase.rpc('chat_report', { p_message: id, p_reason: reason }); if (error) throw new Error(error.message); }
export async function blockUser(me: string, other: string) { const { error } = await supabase.from('chat_blocks').insert({ blocker: me, blocked: other }); if (error && error.code !== '23505') throw new Error(error.message); }
export async function unblockUser(me: string, other: string) { await supabase.from('chat_blocks').delete().eq('blocker', me).eq('blocked', other); }

/** Live updates for one room: new messages, deletions and reactions. Returns a function that stops listening. */
export function subscribeRoom(room: string, h: { onInsert: (m: Msg) => void; onUpdate: (m: Msg) => void; onReaction: () => void }) {
  const ch = supabase.channel(`room-${room}-${Math.random().toString(36).slice(2, 7)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${room}` }, (p: any) => h.onInsert(p.new as Msg))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${room}` }, (p: any) => h.onUpdate(p.new as Msg))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reactions' }, () => h.onReaction())
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

/** Number of unread messages across all chats (for the badge in the header). */
export function useChatUnread(enabled: boolean) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled) { setN(0); return; }
    let live = true; const load = () => { supabase.rpc('chat_unread_total').then(({ data }) => { if (live) setN(Number(data) || 0); }); };
    load();
    const ch = supabase.channel(`unread-${Math.random().toString(36).slice(2, 7)}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, load).subscribe();
    const off = onChatChange(load); const t = setInterval(load, 60000);
    return () => { live = false; supabase.removeChannel(ch); off(); clearInterval(t); };
  }, [enabled]);
  return n;
}

export const previewOf = (r: Room, me?: string | null) => {
  const l = r.last; if (!l) return 'No messages yet';
  const who = l.sender_id && l.sender_id === me ? 'You: ' : '';
  if (l.deleted) return 'Message deleted';
  return who + (l.kind === 'image' ? '📷 Photo' : l.kind === 'sticker' ? 'Sticker' : l.kind === 'call' ? '📞 ' + l.body : l.body);
};
export const shortTime = (iso: string) => { const d = new Date(iso); const now = new Date(); return d.toDateString() === now.toDateString() ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { day: 'numeric', month: 'short' }); };

export const EMOJI_GROUPS: { label: string; icon: string; items: string[] }[] = [
  { label: 'Smileys', icon: '😀', items: '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😋 😛 😜 🤪 🤗 🤔 🤨 😐 😑 😶 🙄 😏 😴 😌 😎 🤩 🥳 😢 😭 😤 😡 🤯 😳 🥺 😱 😰 🤒 🤕 🥶 🥵'.split(' ') },
  { label: 'Gestures', icon: '👍', items: '👍 👎 👏 🙌 🤝 🙏 💪 ✊ 👊 ✌️ 🤞 🤟 🤘 👌 👋 🤙 👆 👇 👉 👈 ☝️ ✍️ 🫶 🫡'.split(' ') },
  { label: 'Football', icon: '⚽', items: '⚽ 🥅 🏆 🥇 🥈 🥉 🏅 🎯 👟 🧤 🟨 🟥 📣 🚩 ⏱️ 🏟️ 🧢 👕 🎽 🏃 🏃‍♀️ 🤸 🧑‍🏫 📋 🗓️ 📍'.split(' ') },
  { label: 'Fun', icon: '🔥', items: '🔥 ⭐ 🌟 ✨ 💥 💯 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 🎉 🎊 🎁 🎶 🎵 🌍 ☀️ 🌧️ 🍕 🍔 🍌 🥤 ☕ 🚌 ⏰ 📸 📞 ✅ ❌ ❓ ❗'.split(' ') },
];
export const BUILTIN_STICKERS = '⚽ 🥅 🏆 🔥 👏 🙌 🤝 💪 🎯 🥳 😂 😍 😎 🤩 😭 😤 🤯 🙏 👟 🧤 🟨 🟥 🏃 ⏱️ 💯 ❤️ 🎉 👍 😴 🤔'.split(' ');
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🔥', '👏', '😮'];
