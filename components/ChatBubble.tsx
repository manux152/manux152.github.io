import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Avatar, T, useAccent } from './ui';
import { Msg, Person, Reactions, shortTime } from '../lib/chat';
import { useTheme } from '../lib/theme';

/** One message: text, photo, sticker, call note or a "deleted" placeholder, with its reactions. */
export function ChatBubble({ m, mine, sender, showName, imageUrl, reactions, me, onOpenImage, onActions, onReact }: {
  m: Msg; mine: boolean; sender?: Person; showName: boolean; imageUrl?: string; reactions?: Reactions[string]; me: string;
  onOpenImage: (url: string, caption?: string | null) => void; onActions: () => void; onReact: (emoji: string, has: boolean) => void }) {
  const accent = useAccent(); const { colors } = useTheme();
  if (m.kind === 'call' || m.kind === 'system') return <View style={{ alignSelf: 'center', backgroundColor: colors.border, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 12, marginVertical: 4 }}><T muted style={{ fontSize: 12 }}>{m.kind === 'call' ? '📞 ' : ''}{m.body} · {shortTime(m.created_at)}</T></View>;
  const deleted = !!m.deleted_at;
  const sticker = !deleted && m.kind === 'sticker';
  const bubble = sticker ? {} : { backgroundColor: mine ? accent : colors.card, borderWidth: mine ? 0 : 1, borderColor: colors.border, borderRadius: 16, borderBottomRightRadius: mine ? 4 : 16, borderBottomLeftRadius: mine ? 16 : 4, padding: 10 };
  const textColor = mine ? '#fff' : colors.text;
  return (
    <View style={{ flexDirection: mine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8, marginVertical: 3, alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
      {!mine ? <Avatar url={sender?.avatar_url} name={sender?.full_name ?? '?'} size={30} /> : null}
      <View style={{ gap: 3, flexShrink: 1, alignItems: mine ? 'flex-end' : 'flex-start' }}>
        {showName && !mine ? <T muted raw={!!sender?.full_name} style={{ fontSize: 12, fontWeight: '700' }}>{sender?.full_name ?? 'Member'}</T> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Message options" onLongPress={onActions} delayLongPress={350} onPress={() => { if (!deleted && m.kind === 'image' && imageUrl) onOpenImage(imageUrl, m.body); else onActions(); }} style={bubble as any}>
          {deleted ? <Text style={{ color: mine ? '#ffffffcc' : colors.muted, fontStyle: 'italic' }}>Message deleted</Text>
            : m.kind === 'image' ? (<View style={{ gap: 6 }}>
                {imageUrl ? <Image source={{ uri: imageUrl }} accessibilityLabel={m.body || 'Photo'} contentFit="cover" style={{ width: 240, height: 240, borderRadius: 10 }} /> : <View style={{ width: 240, height: 160, borderRadius: 10, backgroundColor: '#8883', alignItems: 'center', justifyContent: 'center' }}><T muted>Loading photo…</T></View>}
                {m.body ? <Text selectable style={{ color: textColor, fontSize: 15 }}>{m.body}</Text> : null}
              </View>)
            : sticker ? (m.sticker_url ? <Image source={{ uri: m.sticker_url }} accessibilityLabel="Sticker" contentFit="contain" style={{ width: 130, height: 130 }} /> : <Text style={{ fontSize: 76 }}>{m.body}</Text>)
            : <Text selectable style={{ color: textColor, fontSize: 15, lineHeight: 21 }}>{m.body}</Text>}
        </Pressable>
        {reactions?.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
            {reactions.map((r) => { const has = r.users.includes(me); return (
              <Pressable key={r.emoji} accessibilityRole="button" accessibilityLabel={`${r.emoji} ${r.users.length}${has ? ', tap to remove yours' : ''}`} onPress={() => onReact(r.emoji, has)}
                style={{ flexDirection: 'row', gap: 3, borderRadius: 999, borderWidth: 1, borderColor: has ? accent : colors.border, backgroundColor: has ? accent + '22' : colors.card, paddingVertical: 2, paddingHorizontal: 7 }}>
                <Text style={{ fontSize: 13 }}>{r.emoji}</Text><Text style={{ fontSize: 12, color: colors.text, fontWeight: '700' }}>{r.users.length}</Text>
              </Pressable>); })}
          </View>) : null}
        <T muted style={{ fontSize: 11 }}>{shortTime(m.created_at)}</T>
      </View>
    </View>
  );
}
