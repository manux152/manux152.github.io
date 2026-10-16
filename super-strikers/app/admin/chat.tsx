import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { Screen, H, T, Card, Btn, Input, Chips, Toggle, Err, Loading, fmtDate } from '../../components/ui';
import { SinglePicture } from '../../components/SinglePicture';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../lib/app-context';
import { signedUrls } from '../../lib/chat';

const POLICY = [{ value: 'off', label: 'No private messages' }, { value: 'team', label: 'Team members only' }, { value: 'anyone', label: 'Any member' }];
type Ctx = { id: string; created_at: string; sender_id: string | null; sender_name: string | null; kind: string; body: string | null; image_path: string | null; deleted: boolean };

// Admin → Chat: switch features on/off, choose who may message whom, club stickers, call server, and reported messages.
export default function ChatAdmin() {
  const { can, settings, session, reload } = useApp(); const canSettings = can('settings.manage'); const canMod = can('chat.moderate');
  const [on, setOn] = useState(settings.chat_enabled !== false && settings.chat_enabled !== 'false'); const [policy, setPolicy] = useState<string>(typeof settings.chat_dm_policy === 'string' ? settings.chat_dm_policy : 'team');
  const [images, setImages] = useState(settings.chat_images !== false && settings.chat_images !== 'false'); const [calls, setCalls] = useState(settings.chat_calls !== false && settings.chat_calls !== 'false');
  const [stickers, setStickers] = useState<any[]>([]); const [sName, setSName] = useState(''); const [sUrl, setSUrl] = useState<string | null>(null);
  const [turnUrl, setTurnUrl] = useState(''); const [turnUser, setTurnUser] = useState(''); const [turnPass, setTurnPass] = useState(''); const [hasTurn, setHasTurn] = useState(false);
  const [reports, setReports] = useState<any[] | null>(null); const [names, setNames] = useState<Record<string, string>>({}); const [bans, setBans] = useState<any[]>([]);
  const [open, setOpen] = useState<string | null>(null); const [ctx, setCtx] = useState<Ctx[]>([]); const [imgs, setImgs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (canSettings) {
      const st = await supabase.from('chat_stickers').select('*').order('sort_order').order('created_at'); setStickers(st.data ?? []);
      const cfg = await supabase.from('chat_config').select('value').eq('key', 'ice_servers').maybeSingle();
      const t = Array.isArray(cfg.data?.value) ? (cfg.data!.value as any[]).find((x) => x.username) : null; setHasTurn(!!t); if (t) { setTurnUrl(Array.isArray(t.urls) ? t.urls[0] : t.urls ?? ''); setTurnUser(t.username ?? ''); }
    }
    if (canMod) {
      const rp = await supabase.from('chat_reports').select('*').order('created_at', { ascending: false }).limit(60); const bn = await supabase.from('chat_bans').select('*').order('created_at', { ascending: false });
      setReports(rp.data ?? []); setBans(bn.data ?? []);
      const ids = [...new Set([...(rp.data ?? []).flatMap((r: any) => [r.reported_user, r.reporter]), ...(bn.data ?? []).map((b: any) => b.user_id)].filter(Boolean))];
      if (ids.length) { const pr = await supabase.from('profiles').select('id,full_name').in('id', ids); setNames(Object.fromEntries((pr.data ?? []).map((p: any) => [p.id, p.full_name]))); }
    }
  }, [canSettings, canMod]);
  useEffect(() => { loadAll(); }, [loadAll]);
  if (!canSettings && !canMod) return <Screen><T>No permission.</T></Screen>;
  const nm = (id?: string | null) => (id ? names[id] ?? 'Member' : 'Unknown');
  const guard = async (fn: () => Promise<void>, ok?: string) => { setErr(null); setMsg(null); setBusy(true); try { await fn(); if (ok) setMsg(ok); } catch (e: any) { setErr(e.message ?? 'Something went wrong'); } setBusy(false); };

  const saveSettings = () => guard(async () => {
    const { error } = await supabase.from('site_settings').upsert([{ key: 'chat_enabled', value: on }, { key: 'chat_dm_policy', value: policy }, { key: 'chat_images', value: images }, { key: 'chat_calls', value: calls }], { onConflict: 'key' });
    if (error) throw error; await reload();
  }, 'Saved.');
  const addSticker = () => guard(async () => {
    if (!sName.trim() || !sUrl) throw new Error('Give the sticker a name and a picture.');
    const { error } = await supabase.from('chat_stickers').insert({ name: sName.trim(), image_url: sUrl, sort_order: stickers.length + 1 }); if (error) throw error;
    setSName(''); setSUrl(null); await loadAll();
  }, 'Sticker added.');
  const saveTurn = () => guard(async () => {
    const urls = turnUrl.split(/[\s,]+/).map((u) => u.trim()).filter(Boolean);
    if (!urls.length || !urls.every((u) => /^turns?:/i.test(u))) throw new Error('Each server address must start with turn: or turns: (for example turn:turn.example.com:3478). You can paste several, separated by spaces or commas.');
    if (!turnUser.trim() || !turnPass.trim()) throw new Error('Enter the username and password from your call-server provider.');
    const value = [{ urls: ['stun:stun.l.google.com:19302'] }, { urls, username: turnUser.trim(), credential: turnPass.trim() }];
    const { error } = await supabase.from('chat_config').upsert({ key: 'ice_servers', value }, { onConflict: 'key' }); if (error) throw error; setTurnPass(''); setHasTurn(true);
  }, 'Call server saved. Members get it automatically when a call starts.');
  const removeTurn = () => guard(async () => { await supabase.from('chat_config').delete().eq('key', 'ice_servers'); setHasTurn(false); setTurnUrl(''); setTurnUser(''); setTurnPass(''); }, 'Call server removed.');

  const review = (id: string) => guard(async () => {
    if (open === id) { setOpen(null); return; }
    const { data, error } = await supabase.rpc('chat_report_context', { p_report: id }); if (error) throw error;
    setCtx((data ?? []) as Ctx[]); setOpen(id);
    const paths = ((data ?? []) as Ctx[]).filter((m) => m.image_path && !m.deleted).map((m) => m.image_path!); if (paths.length) setImgs(await signedUrls(paths));
  });
  const close = (id: string, status: 'dismissed' | 'actioned') => supabase.from('chat_reports').update({ status, handled_by: session?.user.id ?? null }).eq('id', id);
  const delMsg = (r: any) => guard(async () => { if (r.message_id) { const { error } = await supabase.rpc('chat_delete_message', { p_id: r.message_id }); if (error) throw error; } await close(r.id, 'actioned'); await loadAll(); setOpen(null); }, 'Message removed.');
  const ban = (r: any) => guard(async () => { if (!r.reported_user) throw new Error('This person no longer has an account.'); const { error } = await supabase.from('chat_bans').upsert({ user_id: r.reported_user, reason: r.reason ?? 'Reported message', banned_by: session?.user.id ?? null }, { onConflict: 'user_id' }); if (error) throw error; await close(r.id, 'actioned'); await loadAll(); }, 'They can no longer send messages or make calls.');
  const dismiss = (r: any) => guard(async () => { await close(r.id, 'dismissed'); await loadAll(); setOpen(null); });
  const unban = (uid: string) => guard(async () => { await supabase.from('chat_bans').delete().eq('user_id', uid); await loadAll(); }, 'They can chat again.');
  const openReports = (reports ?? []).filter((r) => r.status === 'open'); const closed = (reports ?? []).filter((r) => r.status !== 'open');

  return (
    <Screen>
      <H>Chat</H>
      <T muted>Members can message each other, send emojis, stickers and photos, and make one-to-one voice calls (web). Everything below is for you to keep it safe and fun.</T>
      <Err msg={err} />{msg ? <T style={{ fontWeight: '700' }}>{msg}</T> : null}

      {canSettings && (<>
        <Card>
          <T style={{ fontWeight: '800' }}>Settings</T>
          <Toggle label="Chat is on" hint="Turns off the whole feature, the Messages button and calls." value={on} onChange={setOn} />
          <T muted>Who may send private (one-to-one) messages?</T>
          <Chips options={POLICY} value={policy} onChange={(v) => v && setPolicy(v)} />
          <Toggle label="Allow photos and snapshots" value={images} onChange={setImages} />
          <Toggle label="Allow voice calls" hint="Calls work in web browsers. Phone apps can receive missed-call notes only." value={calls} onChange={setCalls} />
          <Btn title={busy ? 'Saving…' : 'Save settings'} onPress={saveSettings} disabled={busy} />
          <Card style={{ borderColor: '#E08A00' }}>
            <T style={{ fontWeight: '800' }}>Keeping young members safe</T>
            <T muted style={{ fontSize: 13 }}>Your club has young players. “Team members only” stops outsiders messaging them, but it does not stop adults who are on the team. Check your club's safeguarding policy: consider switching off private messages or photos for under-18s, and tell parents how chat is used. Everyone can report a message; moderators can only read the conversation around a message that was reported, never other private chats.</T>
          </Card>
        </Card>

        <Card>
          <T style={{ fontWeight: '800' }}>Club stickers</T>
          <T muted style={{ fontSize: 12 }}>Picture stickers (PNG or WebP with a see-through background look best). Big emoji stickers are built in.</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {stickers.map((s) => (
              <View key={s.id} style={{ width: 96, gap: 4, opacity: s.is_active ? 1 : 0.5 }}>
                <Image source={{ uri: s.image_url }} accessibilityLabel={s.name} contentFit="contain" style={{ width: 96, height: 96, backgroundColor: '#8882', borderRadius: 8 }} />
                <T style={{ fontSize: 12 }} numberOfLines={1}>{s.name}</T>
                <Btn title={s.is_active ? 'Hide' : 'Show'} kind="ghost" onPress={() => guard(async () => { await supabase.from('chat_stickers').update({ is_active: !s.is_active }).eq('id', s.id); await loadAll(); })} />
                <Btn title="Delete" kind="danger" onPress={() => guard(async () => { await supabase.from('chat_stickers').delete().eq('id', s.id); await loadAll(); })} />
              </View>))}
          </View>
          <Input label="Sticker name" value={sName} onChangeText={setSName} />
          <SinglePicture label="Sticker picture" url={sUrl} folder="sticker" onChange={setSUrl} height={110} />
          <Btn title="Add sticker" onPress={addSticker} disabled={busy || !sName.trim() || !sUrl} />
        </Card>

        <Card>
          <T style={{ fontWeight: '800' }}>Voice call server (optional)</T>
          <T muted style={{ fontSize: 12 }}>Calls connect the two people directly. On strict networks (some schools, offices and mobile data) that fails unless a relay (TURN) server is added. Free and paid providers exist, such as Metered, Twilio or Cloudflare. Paste the details they give you. Only signed-in members can read these details, when a call starts.</T>
          {hasTurn ? <T style={{ color: '#2E9E5B', fontWeight: '700' }}>✓ A call server is set up.</T> : null}
          <Input label="Server address(es) (turn:… or turns:…, several allowed)" autoCapitalize="none" value={turnUrl} onChangeText={setTurnUrl} placeholder="turn:turn.example.com:3478" />
          <Input label="Username" autoCapitalize="none" value={turnUser} onChangeText={setTurnUser} />
          <Input label="Password" autoCapitalize="none" secureTextEntry value={turnPass} onChangeText={setTurnPass} />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}><Btn title="Save call server" onPress={saveTurn} disabled={busy} />{hasTurn ? <Btn title="Remove" kind="ghost" onPress={removeTurn} /> : null}</View>
        </Card>
      </>)}

      {canMod && (<>
        <H style={{ fontSize: 20 }}>Reported messages</H>
        {reports === null ? <Loading /> : openReports.length === 0 ? <T muted>No open reports. 🎉</T> : openReports.map((r) => (
          <Card key={r.id} style={{ borderColor: '#D64545' }}>
            <T style={{ fontWeight: '800' }}>{nm(r.reported_user)} <T muted style={{ fontWeight: '400' }}>reported by {nm(r.reporter)} · {fmtDate(r.created_at)}</T></T>
            {r.reason ? <T>Reason: {r.reason}</T> : null}
            <T muted>“{r.snapshot || '(no text)'}”</T>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Btn title={open === r.id ? 'Hide conversation' : 'See the conversation'} kind="ghost" onPress={() => review(r.id)} />
              <Btn title="Remove the message" kind="danger" onPress={() => delMsg(r)} disabled={busy} />
              <Btn title="Stop them chatting" kind="danger" onPress={() => ban(r)} disabled={busy} />
              <Btn title="Dismiss" kind="ghost" onPress={() => dismiss(r)} disabled={busy} />
            </View>
            {open === r.id ? (
              <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: '#8884', paddingTop: 8 }}>
                <T muted style={{ fontSize: 12 }}>Messages around the report (private: only moderators can see this).</T>
                {ctx.map((m) => (
                  <View key={m.id} style={{ backgroundColor: m.id === r.message_id ? '#D6454522' : 'transparent', padding: 6, borderRadius: 8 }}>
                    <T style={{ fontSize: 12 }} muted>{m.sender_name ?? 'Member'} · {new Date(m.created_at).toLocaleString()}</T>
                    {m.deleted ? <T muted>(deleted)</T> : m.kind === 'image' ? (imgs[m.image_path ?? ''] ? <Image source={{ uri: imgs[m.image_path!] }} accessibilityLabel="Photo in the conversation" contentFit="contain" style={{ width: 200, height: 160 }} /> : <T muted>📷 Photo</T>) : <T>{m.kind === 'sticker' ? `Sticker ${m.body ?? ''}` : m.body}</T>}
                  </View>))}
              </View>) : null}
          </Card>))}
        {closed.length > 0 ? <T muted style={{ fontSize: 12 }}>{closed.length} earlier report{closed.length === 1 ? '' : 's'} handled.</T> : null}

        <H style={{ fontSize: 20 }}>Stopped from chatting</H>
        {bans.length === 0 ? <T muted>Nobody.</T> : bans.map((b) => (
          <Card key={b.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 140 }}><T style={{ fontWeight: '700' }}>{nm(b.user_id)}</T><T muted style={{ fontSize: 12 }}>{b.reason ?? ''} · {fmtDate(b.created_at)}</T></View>
            <Btn title="Let them chat again" kind="ghost" onPress={() => unban(b.user_id)} disabled={busy} />
          </Card>))}
      </>)}
    </Screen>
  );
}
