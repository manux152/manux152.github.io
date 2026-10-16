import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Btn, Input, T, useAccent } from '../components/ui';
import { supabase } from '../lib/supabase';
import { useApp } from '../lib/app-context';
import { useTheme } from '../lib/theme';
import { useI18n } from '../lib/i18n';
import { chatStore, ChatMsg } from '../lib/assistantStore';
import { localAnswer } from '../lib/assistantLocal';

type Cfg = { enabled: boolean; name: string; welcome: string | null; questions: string[] | null; guests: boolean };
const DEFAULT_Q = ['When is our next match?', 'What was the last result?', 'Any friendly matches coming up?', 'When is the next training?', 'What offers are on in the shop?', 'How do I use the spin wheel?'];

// **bold** support, nothing else, so answers stay simple and safe
function Rich({ text: raw, color, translated }: { text: string; color: string; translated?: boolean }) {
  const { t } = useI18n(); const text = translated ? raw : t(raw);
  return <Text selectable style={{ color, fontSize: 15, lineHeight: 22 }}>{text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <Text key={i} style={{ fontWeight: '800' }}>{p.slice(2, -2)}</Text> : <Text key={i}>{p}</Text>))}</Text>;
}

export default function Assistant() {
  const { session, settings } = useApp(); const router = useRouter(); const { colors } = useTheme(); const accent = useAccent();
  const cfg: Cfg = { enabled: settings.assistant_enabled !== false && settings.assistant_enabled !== 'false', name: typeof settings.assistant_name === 'string' && settings.assistant_name ? settings.assistant_name : 'Team Assistant', welcome: typeof settings.assistant_welcome === 'string' && settings.assistant_welcome ? settings.assistant_welcome : null, questions: Array.isArray(settings.assistant_questions) ? settings.assistant_questions : null, guests: settings.assistant_guests !== false && settings.assistant_guests !== 'false' };
  const [msgs, setMsgs] = useState<ChatMsg[]>(chatStore.messages);
  const [quick, setQuick] = useState(false); const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const scroll = useRef<ScrollView>(null);
  useEffect(() => { chatStore.messages = msgs; setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60); }, [msgs, busy]);

  const ask = async (q: string) => {
    const question = q.trim(); if (!question || busy) return;
    const next: ChatMsg[] = [...msgs, { role: 'user', text: question }]; setMsgs(next); setText(''); setBusy(true);
    let reply: ChatMsg;
    const { data, error } = await supabase.functions.invoke('team-assistant', { body: { messages: next.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.text })) } }).catch((e) => ({ data: null, error: e }));
    if (data?.reply) reply = { role: 'assistant', text: data.reply, links: data.links, ai: data.ai === true };
    else if (data?.error) reply = { role: 'assistant', error: true, text: data.error, links: data.needLogin ? [{ label: 'Sign in', route: '/login' }] : undefined };
    else {
      // The AI function is not deployed / not reachable: answer straight from the club's data instead.
      try {
        const out = await localAnswer({ sb: supabase, tz: typeof settings.assistant_timezone === 'string' && settings.assistant_timezone ? settings.assistant_timezone : 'UTC', cur: typeof settings.currency === 'string' ? settings.currency : '', userId: session?.user.id ?? null, team: typeof settings.team_name === 'string' ? settings.team_name : 'the team' }, question);
        reply = { role: 'assistant', text: out.reply || 'I could not find anything about that. Try asking about matches, training, news, the shop or how to use the app.', links: out.links.slice(0, 5).filter((l, i, a) => a.findIndex((x) => x.route === l.route) === i) };
        if (!quick) { setQuick(true); }
      } catch { reply = { role: 'assistant', error: true, text: 'I could not read the club information right now. Please try again in a moment.' }; }
    }
    setMsgs([...next, reply]); setBusy(false);
  };

  if (!cfg.enabled) return <View style={{ flex: 1, backgroundColor: colors.bg, padding: 20 }}><T>The assistant is switched off right now.</T></View>;
  const suggestions = cfg.questions?.length ? cfg.questions : DEFAULT_Q;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 14, gap: 10, width: '100%', maxWidth: 760, alignSelf: 'center', flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignSelf: 'flex-start', maxWidth: '90%', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, borderTopLeftRadius: 4, padding: 12, gap: 4 }}>
          <T style={{ fontWeight: '800' }}>🤖 {cfg.name}</T>
          <Rich color={colors.text} text={cfg.welcome ?? 'Hi! Ask me about matches, training, the shop or how to use the app.'} />
        </View>
        {msgs.length === 0 && (
          <View style={{ gap: 8, marginTop: 4 }}>
            <T muted style={{ fontSize: 13 }}>Try asking</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {suggestions.map((s) => <Pressable key={s} accessibilityRole="button" onPress={() => ask(s)} style={{ borderWidth: 1, borderColor: accent, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12 }}><T style={{ color: accent, fontWeight: '600', fontSize: 14 }}>{s}</T></Pressable>)}
            </View>
            {!session && cfg.guests ? <T muted style={{ fontSize: 12 }}>Sign in to ask about your own orders, prizes and training.</T> : null}
          </View>)}
        {msgs.map((m, i) => m.role === 'user' ? (
          <View key={i} style={{ alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: accent, borderRadius: 16, borderTopRightRadius: 4, padding: 12 }}><Text selectable style={{ color: '#fff', fontSize: 15, lineHeight: 22 }}>{m.text}</Text></View>
        ) : (
          <View key={i} style={{ alignSelf: 'flex-start', maxWidth: '92%', gap: 8 }}>
            <View accessibilityLiveRegion="polite" style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: m.error ? '#D64545' : colors.border, borderRadius: 16, borderTopLeftRadius: 4, padding: 12 }}><Rich color={colors.text} text={m.text} translated={m.ai === true} /></View>
            {m.links?.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{m.links.map((l) => <Pressable key={l.route} accessibilityRole="link" accessibilityLabel={`Open ${l.label}`} onPress={() => router.push(l.route as any)} style={{ borderWidth: 1, borderColor: accent, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 }}><T style={{ color: accent, fontWeight: '700', fontSize: 13 }}>{l.label} →</T></Pressable>)}</View> : null}
          </View>
        ))}
        {busy ? <View style={{ alignSelf: 'flex-start', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 12 }}><T muted>Thinking…</T></View> : null}
      </ScrollView>
      <View style={{ borderTopWidth: 1, borderTopColor: colors.border, padding: 10, backgroundColor: colors.card }}>
        <View style={{ width: '100%', maxWidth: 760, alignSelf: 'center', flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}><Input accessibilityLabel="Your question" placeholder="Ask about matches, training, the shop…" value={text} onChangeText={setText} maxLength={800} returnKeyType="send" onSubmitEditing={() => ask(text)} blurOnSubmit={false} editable={!busy} /></View>
          <Btn title="Send" onPress={() => ask(text)} disabled={busy || !text.trim()} />
        </View>
        {msgs.length > 0 ? <Pressable accessibilityRole="button" onPress={() => { setMsgs([]); chatStore.messages = []; }} style={{ alignSelf: 'center', padding: 6 }}><T muted style={{ fontSize: 12 }}>New chat</T></Pressable> : null}
        {quick ? <T muted style={{ fontSize: 11, textAlign: 'center' }}>Quick-answer mode: the smart assistant is not switched on yet, so answers are short summaries of the club's information.</T> : null}
        <T muted style={{ fontSize: 11, textAlign: 'center' }}>Answers come from the club's own information. Please double-check anything important.</T>
      </View>
    </KeyboardAvoidingView>
  );
}
