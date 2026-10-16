import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Avatar, T } from './ui';
import { supabase } from '../lib/supabase';
import { useApp } from '../lib/app-context';
import { roomPeople } from '../lib/chat';
import { CallPeer, canVoiceCall, onStartVoiceCall } from '../lib/calls';

type Phase = 'ringing' | 'connecting' | 'active' | 'ended';
type CallState = { id: string; room: string; role: 'caller' | 'callee'; peer: CallPeer; phase: Phase; note?: string };

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** One-to-one voice calls: ring, answer or decline, mute, hang up. Mounted once in the root layout; web only. */
export function CallOverlay() {
  const { session } = useApp(); const me = session?.user.id ?? null;
  const [call, setCall] = useState<CallState | null>(null); const [muted, setMuted] = useState(false); const [secs, setSecs] = useState(0);
  const [levels, setLevels] = useState({ me: 0, them: 0 }); const [blocked, setBlocked] = useState(false); const [hint, setHint] = useState<string | null>(null);
  const meter = useRef<{ ctx: AudioContext; t: any } | null>(null); const heard = useRef({ me: false, them: false }); const remote = useRef<MediaStream | null>(null);
  const cur = useRef<CallState | null>(null); cur.current = call;
  const pc = useRef<RTCPeerConnection | null>(null); const mic = useRef<MediaStream | null>(null); const ch = useRef<any>(null); const audio = useRef<HTMLAudioElement | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]); const timers = useRef<any[]>([]); const ring = useRef<{ ctx: AudioContext; t: any } | null>(null);

  const stopRing = () => { if (ring.current) { clearInterval(ring.current.t); try { ring.current.ctx.close(); } catch { /* ignore */ } ring.current = null; } };
  const startRing = () => {
    try {
      const ctx = new (window as any).AudioContext(); const beep = () => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 440; g.gain.value = 0.08; o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.35); };
      ctx.resume?.(); beep(); ring.current = { ctx, t: setInterval(beep, 2000) };
    } catch { /* sound is optional */ }
  };
  /** Creates the speaker element. Called straight from the tap on Call / Answer, because browsers only allow sound that starts from a tap. */
  const ensureAudio = () => {
    if (audio.current) return audio.current;
    const a = document.createElement('audio'); a.autoplay = true; (a as any).playsInline = true; a.setAttribute('playsinline', ''); a.style.display = 'none'; a.volume = 1; a.muted = false;
    document.body.appendChild(a); audio.current = a; a.play().catch(() => {}); return a;
  };
  const playRemote = () => { const a = audio.current; if (!a) return; a.muted = false; a.volume = 1; a.play().then(() => setBlocked(false)).catch(() => setBlocked(true)); };
  /** Little level meters for "You" and "Them", so it is obvious which direction has no sound. */
  const startMeter = () => {
    if (meter.current) return;
    try {
      const ctx = new (window as any).AudioContext(); ctx.resume?.();
      const tap = (st: MediaStream | null) => { if (!st || !st.getAudioTracks().length) return null; const an = ctx.createAnalyser(); an.fftSize = 512; ctx.createMediaStreamSource(st).connect(an); return an; };
      const me = tap(mic.current), them = tap(remote.current); const buf = new Uint8Array(512);
      const level = (an: AnalyserNode | null) => { if (!an) return 0; an.getByteTimeDomainData(buf); let sum = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; } return Math.min(1, Math.sqrt(sum / buf.length) * 4); };
      meter.current = { ctx, t: setInterval(() => { const l = { me: level(me), them: level(them) }; if (l.me > 0.04) heard.current.me = true; if (l.them > 0.04) heard.current.them = true; setLevels(l); }, 200) };
    } catch { /* meters are optional */ }
  };
  const stopMeter = () => { if (meter.current) { clearInterval(meter.current.t); try { meter.current.ctx.close(); } catch { /* ignore */ } meter.current = null; } };
  const teardown = useCallback(() => {
    stopMeter(); remote.current = null; heard.current = { me: false, them: false }; setLevels({ me: 0, them: 0 }); setBlocked(false); setHint(null);
    stopRing(); timers.current.forEach(clearTimeout); timers.current = [];
    try { pc.current?.close(); } catch { /* ignore */ } pc.current = null;
    mic.current?.getTracks().forEach((t) => t.stop()); mic.current = null;
    if (ch.current) { supabase.removeChannel(ch.current); ch.current = null; }
    if (audio.current) { audio.current.srcObject = null; audio.current.remove(); audio.current = null; }
    pendingIce.current = []; setMuted(false); setSecs(0);
  }, []);
  const finish = useCallback((note: string) => {
    teardown(); setCall((c) => (c ? { ...c, phase: 'ended', note } : null));
    const t = setTimeout(() => setCall(null), 2600); timers.current.push(t);
  }, [teardown]);

  const getMic = async () => {
    try { const st = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); st.getAudioTracks().forEach((t) => { t.enabled = true; }); return st; }
    catch (e: any) {
      if (e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError') throw new Error('No microphone was found on this device. Plug one in or check it is enabled, then try again.');
      if (e?.name === 'NotReadableError') throw new Error('Your microphone is being used by another app. Close it and try again.');
      throw new Error('Allow microphone access in your browser (click the padlock next to the address) to make or answer voice calls.');
    }
  };
  const makePc = async (callId: string, stream: MediaStream) => {
    const { data } = await supabase.rpc('chat_ice');
    const p = new RTCPeerConnection({ iceServers: Array.isArray(data) && data.length ? data : [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }], iceCandidatePoolSize: 4 });
    stream.getTracks().forEach((t) => p.addTrack(t, stream));
    p.onicecandidate = (e) => { if (e.candidate) ch.current?.send({ type: 'broadcast', event: 'ice', payload: e.candidate.toJSON() }); };
    p.ontrack = (e) => { const a = ensureAudio(); const st = e.streams[0] ?? new MediaStream([e.track]); remote.current = st; a.srcObject = st; playRemote(); if (e.track.kind === 'audio') e.track.onunmute = () => playRemote(); };
    p.onconnectionstatechange = () => {
      if (p.connectionState === 'connected') { setCall((c) => (c && c.id === callId ? { ...c, phase: 'active' } : c)); playRemote(); startMeter(); }
      if (p.connectionState === 'disconnected') { try { (p as any).restartIce?.(); } catch { /* ignore */ } }
      if (p.connectionState === 'failed') { supabase.rpc('chat_end_call', { p_call: callId }); finish('Could not connect. Ask your admin to set up a call server (TURN) in Admin → Chat.'); }
    };
    pc.current = p; return p;
  };
  const joinChannel = (callId: string, h: { onReady?: () => void; onOffer?: (sdp: any) => void; onAnswer?: (sdp: any) => void }) => new Promise<void>((resolve) => {
    const c = supabase.channel(`call-${callId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'ready' }, () => h.onReady?.())
      .on('broadcast', { event: 'offer' }, ({ payload }: any) => h.onOffer?.(payload))
      .on('broadcast', { event: 'answer' }, ({ payload }: any) => h.onAnswer?.(payload))
      .on('broadcast', { event: 'ice' }, async ({ payload }: any) => { if (pc.current?.remoteDescription) { try { await pc.current.addIceCandidate(payload); } catch { /* late candidate */ } } else pendingIce.current.push(payload); })
      .subscribe((s: string) => { if (s === 'SUBSCRIBED') resolve(); });
    ch.current = c;
  });
  const flushIce = async () => { for (const c of pendingIce.current) { try { await pc.current?.addIceCandidate(c); } catch { /* ignore */ } } pendingIce.current = []; };

  const hangUp = async () => { const c = cur.current; if (!c) return; if (c.phase === 'ended') { setCall(null); return; } await supabase.rpc('chat_end_call', { p_call: c.id }); finish(c.phase === 'active' ? 'Call ended' : c.role === 'caller' ? 'Call cancelled' : 'Call declined'); };

  const start = useCallback(async (room: string, peer: CallPeer) => {
    if (cur.current) return;
    ensureAudio();
    try {
      const stream = await getMic(); mic.current = stream;
      const { data: id, error } = await supabase.rpc('chat_start_call', { p_room: room });
      if (error) throw new Error(error.message);
      const c: CallState = { id: id as string, room, role: 'caller', peer, phase: 'ringing' }; setCall(c);
      const p = await makePc(c.id, stream);
      await joinChannel(c.id, {
        onReady: async () => { const offer = await p.createOffer(); await p.setLocalDescription(offer); ch.current?.send({ type: 'broadcast', event: 'offer', payload: { type: offer.type, sdp: offer.sdp } }); setCall((x) => (x ? { ...x, phase: 'connecting' } : x)); },
        onAnswer: async (sdp) => { await p.setRemoteDescription(sdp); await flushIce(); },
      });
      timers.current.push(setTimeout(() => { if (cur.current?.phase === 'ringing') { supabase.rpc('chat_end_call', { p_call: c.id }); finish('No answer'); } }, 45000));
    } catch (e: any) { teardown(); setCall({ id: '', room, role: 'caller', peer, phase: 'ended', note: e.message ?? 'Could not start the call' }); timers.current.push(setTimeout(() => setCall(null), 3500)); }
  }, [finish, teardown]); // eslint-disable-line

  const accept = async () => {
    const c = cur.current; if (!c) return; stopRing(); ensureAudio();
    try {
      const stream = await getMic(); mic.current = stream;
      const { error } = await supabase.rpc('chat_answer_call', { p_call: c.id }); if (error) throw new Error(error.message);
      setCall({ ...c, phase: 'connecting' });
      const p = await makePc(c.id, stream);
      await joinChannel(c.id, { onOffer: async (sdp) => { await p.setRemoteDescription(sdp); await flushIce(); const ans = await p.createAnswer(); await p.setLocalDescription(ans); ch.current?.send({ type: 'broadcast', event: 'answer', payload: { type: ans.type, sdp: ans.sdp } }); } });
      ch.current?.send({ type: 'broadcast', event: 'ready', payload: {} });
    } catch (e: any) { await supabase.rpc('chat_end_call', { p_call: c.id }); finish(e.message ?? 'Could not answer'); }
  };

  // Calls arriving for me, and changes to the call I'm on
  useEffect(() => {
    if (!me || !canVoiceCall) return;
    const onRow = async (row: any, isInsert: boolean) => {
      const c = cur.current;
      if (isInsert) {
        if (row.status !== 'ringing' || Date.now() - new Date(row.created_at).getTime() > 60000 || c) return;
        const people = await roomPeople(row.room_id); const p = people[row.caller_id];
        setCall({ id: row.id, room: row.room_id, role: 'callee', peer: { id: row.caller_id, name: p?.full_name ?? 'Someone', avatar: p?.avatar_url ?? null }, phase: 'ringing' });
        startRing(); timers.current.push(setTimeout(() => { if (cur.current && cur.current.id === row.id && cur.current.phase === 'ringing') finish('Missed call'); }, 60000));
        return;
      }
      if (!c || c.id !== row.id) return;
      if (['ended', 'declined', 'missed', 'cancelled'].includes(row.status) && c.phase !== 'ended') finish(row.status === 'declined' ? 'Call declined' : row.status === 'ended' ? 'Call ended' : c.role === 'callee' ? 'Missed call' : 'No answer');
    };
    const channel = supabase.channel(`calls-for-${me}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_calls', filter: `callee_id=eq.${me}` }, (p: any) => onRow(p.new, true))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_calls', filter: `callee_id=eq.${me}` }, (p: any) => onRow(p.new, false))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_calls', filter: `caller_id=eq.${me}` }, (p: any) => onRow(p.new, false))
      .subscribe();
    const off = onStartVoiceCall((r) => start(r.room, r.peer));
    return () => { supabase.removeChannel(channel); off(); };
  }, [me, start, finish]);

  // Stuck connecting for too long: the two devices cannot reach each other directly (strict network) -> say so instead of hanging
  useEffect(() => {
    if (!call || (call.phase !== 'connecting')) return;
    const id = call.id;
    const t1 = setTimeout(() => { if (cur.current?.id === id && cur.current.phase === 'connecting') setHint('Still connecting… if this stays stuck, the network may block direct calls.'); }, 12000);
    const t2 = setTimeout(() => { if (cur.current?.id === id && cur.current.phase === 'connecting') { supabase.rpc('chat_end_call', { p_call: id }); finish('Could not connect. These networks block direct calls: an admin needs to add a call server (TURN) in Admin → Chat.'); } }, 35000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [call?.phase, call?.id, finish]);
  // Connected but nobody heard anything after 10 seconds: point at the likely cause
  useEffect(() => {
    if (call?.phase !== 'active') return;
    const t = setTimeout(() => {
      if (!heard.current.me) setHint('We can\'t hear your microphone. Check it is not muted in Windows or your browser, and that the right microphone is selected.');
      else if (!heard.current.them) setHint(`No sound from ${cur.current?.peer.name ?? 'them'} yet. Ask them to check their microphone.`);
    }, 10000);
    return () => clearTimeout(t);
  }, [call?.phase, call?.id]);
  useEffect(() => { if (call?.phase !== 'active') return; setSecs(0); const t = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(t); }, [call?.phase, call?.id]);
  useEffect(() => () => teardown(), [teardown]);

  if (!call || Platform.OS !== 'web') return null;
  const incoming = call.role === 'callee' && call.phase === 'ringing';
  const label = call.phase === 'ringing' ? (incoming ? 'Incoming voice call' : 'Calling…') : call.phase === 'connecting' ? 'Connecting…' : call.phase === 'active' ? clock(secs) : call.note ?? 'Call ended';
  const btn = (bg: string): any => ({ minWidth: 112, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 999, backgroundColor: bg, alignItems: 'center' });
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{ position: 'absolute', top: 16, left: 12, right: 12, alignItems: 'center', zIndex: 200 }} pointerEvents="box-none">
      <View style={{ width: '100%', maxWidth: 420, backgroundColor: '#14181D', borderRadius: 18, padding: 16, gap: 12, alignItems: 'center', borderWidth: 1, borderColor: '#2F3944', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 14, elevation: 10 }}>
        <Avatar url={call.peer.avatar} name={call.peer.name} size={64} />
        <T style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>{call.peer.name}</T>
        <T style={{ color: '#AEB6C1' }}>{label}</T>
        {call.phase === 'active' ? (
          <View style={{ width: '100%', gap: 6 }}>
            {([['🎙️ You', levels.me], ['🔊 ' + call.peer.name, levels.them]] as [string, number][]).map(([l, v]) => (
              <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <T numberOfLines={1} style={{ color: '#AEB6C1', fontSize: 12, width: 110 }}>{l}</T>
                <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: '#2F3944', overflow: 'hidden' }}><View style={{ width: `${Math.round(v * 100)}%`, height: 8, backgroundColor: '#2E9E5B' }} /></View>
              </View>))}
          </View>) : null}
        {blocked && call.phase !== 'ended' ? <Pressable accessibilityRole="button" accessibilityLabel="Tap to turn on sound" onPress={playRemote} style={btn('#E08A00')}><T style={{ color: '#fff', fontWeight: '800' }}>🔊 Tap to turn on sound</T></Pressable> : null}
        {hint && call.phase !== 'ended' ? <T style={{ color: '#F2C879', fontSize: 13, textAlign: 'center' }}>{hint}</T> : null}
        <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          {incoming ? (<>
            <Pressable accessibilityRole="button" accessibilityLabel="Answer call" onPress={accept} style={btn('#2E9E5B')}><T style={{ color: '#fff', fontWeight: '800' }}>📞 Answer</T></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Decline call" onPress={hangUp} style={btn('#D64545')}><T style={{ color: '#fff', fontWeight: '800' }}>Decline</T></Pressable>
          </>) : call.phase !== 'ended' ? (<>
            {call.phase !== 'ringing' ? <Pressable accessibilityRole="button" accessibilityLabel={muted ? 'Unmute microphone' : 'Mute microphone'} onPress={() => { const m = !muted; setMuted(m); mic.current?.getAudioTracks().forEach((t) => { t.enabled = !m; }); }} style={btn(muted ? '#E08A00' : '#3A4552')}><T style={{ color: '#fff', fontWeight: '800' }}>{muted ? '🔇 Unmute' : '🎙️ Mute'}</T></Pressable> : null}
            <Pressable accessibilityRole="button" accessibilityLabel="End call" onPress={hangUp} style={btn('#D64545')}><T style={{ color: '#fff', fontWeight: '800' }}>{call.phase === 'ringing' ? 'Cancel' : 'End call'}</T></Pressable>
          </>) : null}
        </View>
      </View>
    </View>
  );
}
