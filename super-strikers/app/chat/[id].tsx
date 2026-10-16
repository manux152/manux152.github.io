import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Btn, Input, T, useAccent } from '../../components/ui';
import { ChatBubble } from '../../components/ChatBubble';
import { EmojiPicker } from '../../components/EmojiPicker';
import { StickerPicker } from '../../components/StickerPicker';
import { Lightbox } from '../../components/Lightbox';
import { useApp } from '../../lib/app-context';
import { useTheme } from '../../lib/theme';
import { canVoiceCall, startVoiceCall } from '../../lib/calls';
import { Msg, Person, QUICK_REACTIONS, Reactions, Room, blockUser, deleteMessage, fetchMessages, fetchOverview, fetchReactions, markRead, pickPhoto, reportMessage, roomPeople, sendPhoto, sendSticker, sendText, signedUrls, subscribeRoom, toggleReaction } from '../../lib/chat';

const REASONS = ['Bullying or abuse', 'Inappropriate content', 'Spam or scam', 'Something else'];

export default function ChatRoom() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { session, can } = useApp(); const router = useRouter(); const { colors } = useTheme(); const accent = useAccent(); const me = session?.user.id ?? null;
  const [room, setRoom] = useState<Room | null>(null); const [msgs, setMsgs] = useState<Msg[]>([]); const [people, setPeople] = useState<Record<string, Person>>({});
  const [urls, setUrls] = useState<Record<string, string>>({}); const [reacts, setReacts] = useState<Reactions>({});
  const [text, setText] = useState(''); const [panel, setPanel] = useState<null | 'emoji' | 'sticker'>(null); const [busy, setBusy] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Msg | null>(null); const [reporting, setReporting] = useState<Msg | null>(null); const [info, setInfo] = useState<string | null>(null); const [viewer, setViewer] = useState<{ url: string; caption?: string | null } | null>(null);
  const [done, setDone] = useState(false); const loadingMore = useRef(false); const msgsRef = useRef<Msg[]>([]); msgsRef.current = msgs; const peopleRef = useRef(people); peopleRef.current = people;

  const attach = useCallback(async (list: Msg[]) => {
    const paths = list.filter((m) => m.kind === 'image' && m.image_path && !m.deleted_at).map((m) => m.image_path!); if (paths.length) signedUrls(paths).then((u) => setUrls((c) => ({ ...c, ...u })));
    const ids = list.map((m) => m.id); if (ids.length) fetchReactions(ids).then((r) => setReacts((c) => ({ ...c, ...r, ...Object.fromEntries(ids.filter((i) => !r[i]).map((i) => [i, []])) })));
  }, []);
  useEffect(() => {
    if (!me || !id) return; let live = true;
    (async () => {
      try {
        const [ov, pp, first] = await Promise.all([fetchOverview(), roomPeople(id), fetchMessages(id)]);
        if (!live) return; setRoom(ov.find((r) => r.id === id) ?? null); setPeople(pp); setMsgs(first); setDone(first.length < 40); attach(first); markRead(id);
      } catch (e: any) { setErr(e.message); }
    })();
    const stop = subscribeRoom(id, {
      onInsert: async (m) => {
        if (!peopleRef.current[m.sender_id ?? ''] && m.sender_id) roomPeople(id).then(setPeople);
        setMsgs((c) => (c.some((x) => x.id === m.id) ? c : [m, ...c])); attach([m]); if (m.sender_id !== me) markRead(id);
      },
      onUpdate: (m) => setMsgs((c) => c.map((x) => (x.id === m.id ? m : x))),
      onReaction: () => { fetchReactions(msgsRef.current.map((x) => x.id)).then((r) => setReacts(r)); },
    });
    return () => { live = false; stop(); };
  }, [id, me, attach]);

  if (!session) return <Redirect href="/login" />;
  const other = room?.other; const title = room ? (room.kind === 'team' ? room.title ?? 'Team chat' : other?.name ?? 'Chat') : 'Chat';
  const loadMore = async () => {
    if (loadingMore.current || done || !msgs.length) return; loadingMore.current = true;
    try { const older = await fetchMessages(id!, msgs[msgs.length - 1].created_at); setDone(older.length < 40); setMsgs((c) => [...c, ...older.filter((o) => !c.some((x) => x.id === o.id))]); attach(older); } finally { loadingMore.current = false; }
  };
  const run = async (label: string | null, fn: () => Promise<void>) => { setErr(null); setBusy(label); try { await fn(); } catch (e: any) { setErr(e.message); } setBusy(null); };
  const send = () => { const t = text.trim(); if (!t || !me) return; setText(''); run(null, () => sendText(id!, me, t)); };
  const photo = (src: 'camera' | 'library') => run('Sending photo…', async () => { const a: ImagePicker.ImagePickerAsset | null = await pickPhoto(src); if (a && me) await sendPhoto(id!, me, a, text); if (a) setText(''); });
  const canModerate = can('chat.moderate');

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <Stack.Screen options={{ title, headerRight: () => (room?.kind === 'direct' && other && canVoiceCall ? <Pressable accessibilityRole="button" accessibilityLabel={`Voice call ${other.name}`} onPress={() => startVoiceCall({ room: id!, peer: { id: other.id, name: other.name, avatar: other.avatar } })} style={{ padding: 10 }}><T style={{ fontSize: 22 }}>📞</T></Pressable> : null) }} />
      <FlatList inverted data={msgs} keyExtractor={(m) => m.id} onEndReached={loadMore} onEndReachedThreshold={0.4} keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 12, width: '100%', maxWidth: 760, alignSelf: 'center' }}
        ListEmptyComponent={<View style={{ transform: [{ scaleY: -1 }], padding: 30, alignItems: 'center' }}><T muted style={{ textAlign: 'center' }}>No messages yet. Say hello 👋</T></View>}
        renderItem={({ item, index }) => {
          const older = msgs[index + 1]; const mine = item.sender_id === me;
          return <ChatBubble m={item} mine={mine} me={me!} sender={people[item.sender_id ?? '']} showName={room?.kind === 'team' && older?.sender_id !== item.sender_id} imageUrl={item.image_path ? urls[item.image_path] : undefined}
            reactions={reacts[item.id]} onOpenImage={(url, caption) => setViewer({ url, caption })} onActions={() => setSheet(item)}
            onReact={(emoji, has) => run(null, () => toggleReaction(item.id, me!, emoji, has).then(() => fetchReactions([item.id]).then((r) => setReacts((c) => ({ ...c, [item.id]: r[item.id] ?? [] })))))} />;
        }} />
      {err ? <View style={{ paddingHorizontal: 14, paddingBottom: 6 }}><T style={{ color: '#D64545', fontSize: 13 }}>{err}</T></View> : null}
      {info ? <View style={{ paddingHorizontal: 14, paddingBottom: 6 }}><T style={{ fontWeight: '700', fontSize: 13 }}>{info}</T></View> : null}
      {busy ? <View style={{ paddingHorizontal: 14, paddingBottom: 6 }}><T muted style={{ fontSize: 13 }}>{busy}</T></View> : null}
      <View style={{ borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card, padding: 8 }}>
        <View style={{ width: '100%', maxWidth: 760, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {([['😊', 'Emoji', () => setPanel(panel === 'emoji' ? null : 'emoji')], ['🎭', 'Stickers', () => setPanel(panel === 'sticker' ? null : 'sticker')], ['📷', 'Take a snapshot', () => photo('camera')], ['🖼️', 'Send a photo', () => photo('library')]] as const).map(([ic, label, fn]) => (
            <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} onPress={fn} style={{ padding: 7, borderRadius: 8, backgroundColor: (label === 'Emoji' && panel === 'emoji') || (label === 'Stickers' && panel === 'sticker') ? accent + '33' : 'transparent' }}><T style={{ fontSize: 22 }}>{ic}</T></Pressable>))}
          <View style={{ flex: 1 }}><Input accessibilityLabel="Message" placeholder="Message…" value={text} onChangeText={setText} maxLength={2000} returnKeyType="send" onSubmitEditing={send} blurOnSubmit={false} onFocus={() => setPanel(null)} /></View>
          <Btn title="Send" onPress={send} disabled={!text.trim() || !!busy} />
        </View>
      </View>
      {panel === 'emoji' ? <EmojiPicker onPick={(e) => setText((t) => t + e)} /> : null}
      {panel === 'sticker' ? <StickerPicker onPick={(s) => { setPanel(null); if (me) run(null, () => sendSticker(id!, me, s)); }} /> : null}

      <Modal transparent animationType="fade" visible={!!sheet} onRequestClose={() => setSheet(null)}>
        <Pressable onPress={() => setSheet(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', alignItems: 'center' }}>
          <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 520, backgroundColor: colors.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 14, gap: 8 }}>
            {sheet && !sheet.deleted_at ? <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>{QUICK_REACTIONS.map((e) => <Pressable key={e} accessibilityRole="button" accessibilityLabel={`React ${e}`} onPress={() => { const m = sheet; setSheet(null); const has = !!reacts[m.id]?.find((r) => r.emoji === e)?.users.includes(me!); run(null, () => toggleReaction(m.id, me!, e, has).then(() => fetchReactions([m.id]).then((r) => setReacts((c) => ({ ...c, [m.id]: r[m.id] ?? [] }))))); }} style={{ padding: 8 }}><T style={{ fontSize: 30 }}>{e}</T></Pressable>)}</View> : null}
            {sheet?.body && sheet.kind === 'text' && Platform.OS === 'web' ? <Btn title="Copy text" kind="ghost" onPress={() => { (navigator as any).clipboard?.writeText(sheet.body); setSheet(null); setInfo('Copied.'); setTimeout(() => setInfo(null), 1500); }} /> : null}
            {sheet && !sheet.deleted_at && (sheet.sender_id === me || canModerate) && sheet.kind !== 'call' ? <Btn title={sheet.sender_id === me ? 'Delete my message' : 'Delete this message (moderator)'} kind="danger" onPress={() => { const m = sheet; setSheet(null); run(null, () => deleteMessage(m.id)); }} /> : null}
            {sheet && sheet.sender_id !== me && sheet.kind !== 'call' && sheet.kind !== 'system' && !sheet.deleted_at ? <Btn title="Report this message" kind="ghost" onPress={() => { setReporting(sheet); setSheet(null); }} /> : null}
            {sheet && sheet.sender_id !== me && room?.kind === 'direct' && other && sheet.kind !== 'call' ? <Btn title={`Block ${other.name}`} kind="ghost" onPress={async () => { setSheet(null); try { await blockUser(me!, other.id); setInfo(`${other.name} is blocked. You can no longer message each other.`); } catch (e: any) { setErr(e.message); } }} /> : null}
            <Btn title="Close" kind="ghost" onPress={() => setSheet(null)} />
          </Pressable>
        </Pressable>
      </Modal>
      <Modal transparent animationType="fade" visible={!!reporting} onRequestClose={() => setReporting(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 18 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 16, gap: 8, maxWidth: 480, width: '100%', alignSelf: 'center' }}>
            <T style={{ fontWeight: '800', fontSize: 18 }}>Report this message</T><T muted>A club moderator will look at it. Tell us why:</T>
            {REASONS.map((r) => <Btn key={r} title={r} kind="ghost" onPress={() => { const m = reporting!; setReporting(null); run(null, async () => { await reportMessage(m.id, r); setInfo('Thank you. The club has been told.'); setTimeout(() => setInfo(null), 4000); }); }} />)}
            <Btn title="Cancel" kind="ghost" onPress={() => setReporting(null)} />
          </View>
        </View>
      </Modal>
      <Lightbox items={viewer ? [{ id: 'p', kind: 'image', url: viewer.url, caption: viewer.caption }] : []} index={viewer ? 0 : null} onIndex={() => {}} onClose={() => setViewer(null)} />
    </KeyboardAvoidingView>
  );
}
