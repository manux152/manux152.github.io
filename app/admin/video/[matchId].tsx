import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Screen, H, T, Card, Btn, Input, Chips, Toggle, Err, Loading } from '../../../components/ui';
import { EmbeddedVideo } from '../../../components/EmbeddedVideo';
import { embedInfo } from '../../../lib/embed';
import { supabase } from '../../../lib/supabase';
import { useTable } from '../../../lib/useQuery';
import { useApp } from '../../../lib/app-context';
import { TAGS, fmtClock, parseClock, tagIcon, tagLabel } from '../../../lib/video';
import { useTick } from '../../../lib/matchday';

const LEN = [{ value: '0', label: 'Moment' }, { value: '10', label: '10 s' }, { value: '20', label: '20 s' }, { value: '30', label: '30 s' }];

/** Admin → match → Video: add a recording, then tag moments while you watch. A stopwatch you start with the video gives you the time. */
export default function VideoTagger() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>(); const { can } = useApp();
  const m = useTable('matches', (q) => q.eq('id', matchId).select('id, kickoff_at, opponents(name)'), [matchId]);
  const vids = useTable('match_videos', (q) => q.eq('match_id', matchId).order('created_at'), [matchId]);
  const squad = useTable('match_players', (q) => q.eq('match_id', matchId).select('player_id, players(full_name, shirt_number)'), [matchId]);
  const [vid, setVid] = useState<string | null>(null);
  const clips = useTable('video_clips', (q) => (vid ? q.eq('video_id', vid).order('start_sec').select('*, players(full_name)') : q.limit(0)), [vid]);
  const [nv, setNv] = useState({ title: '', url: '' });
  const [f, setF] = useState<{ time: string; len: string; tag: string; player: string | null; note: string; pub: boolean }>({ time: '', len: '0', tag: 'goal', player: null, note: '', pub: true });
  const [prev, setPrev] = useState<{ start: number; end?: number } | null>(null);
  const [run, setRun] = useState(false); const base = useRef(0); const t0 = useRef(0);
  const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  useTick(run, 1000);
  const now = () => Math.max(0, Math.floor(base.current + (run ? (Date.now() - t0.current) / 1000 : 0)));
  useEffect(() => { if (!vid && vids.data.length) setVid((vids.data[0] as any).id); }, [vids.data, vid]);
  const reload = useCallback(async () => { await Promise.all([vids.refresh(), clips.refresh()]); }, [vids, clips]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!can('video.manage')) return <Screen><T>No permission.</T></Screen>;
  if (m.loading || vids.loading) return <Loading />;
  const mm: any = m.data[0]; if (!mm) return <Screen><T muted>Match not found.</T></Screen>;
  const video: any = (vids.data as any[]).find((v) => v.id === vid); const info = video ? embedInfo(video.url) : null;
  const players = (squad.data as any[]).map((r) => ({ value: r.player_id, label: `${r.players?.shirt_number != null ? '#' + r.players.shirt_number + ' ' : ''}${r.players?.full_name}` }));
  const wrap = async (fn: () => PromiseLike<{ error: any }>, ok?: string) => { setErr(null); setMsg(null); const { error } = await fn(); if (error) return setErr(error.message); if (ok) setMsg(ok); await reload(); };

  const addVideo = () => {
    if (nv.title.trim().length < 2) return setErr('Give the video a title.'); if (!/^https?:\/\//i.test(nv.url.trim())) return setErr('Paste the web link of the video (starting with https://).');
    return wrap(() => supabase.from('match_videos').insert({ match_id: matchId, title: nv.title.trim(), url: nv.url.trim() }) as any, 'Video added.').then(() => setNv({ title: '', url: '' }));
  };
  const addClip = () => {
    if (!vid) return setErr('Add or choose a video first.');
    const s = parseClock(f.time); if (s == null) return setErr('Type the time as minutes:seconds, e.g. 23:40 (or use the stopwatch).');
    const e = f.len === '0' ? null : s + Number(f.len);
    return wrap(() => supabase.from('video_clips').insert({ video_id: vid, start_sec: Math.max(0, s - 3), end_sec: e, tag: f.tag, player_id: f.player, note: f.note.trim() || null, is_public: f.pub }) as any, `Tagged ${tagLabel(f.tag)} at ${fmtClock(s)}.`).then(() => setF({ ...f, time: '', note: '' }));
  };
  const setTag = (t: string) => setF({ ...f, tag: t, pub: t === 'mistake' ? false : f.pub });
  return (
    <Screen>
      <H>Video: {mm.opponents?.name}</H>
      <Err msg={err} />{msg ? <T>{msg}</T> : null}
      {(vids.data as any[]).length ? <Chips options={(vids.data as any[]).map((v) => ({ value: v.id, label: v.title }))} value={vid} onChange={(v) => { setVid(v); setPrev(null); }} /> : <T muted>No video yet. Add one below (YouTube, Vimeo, Facebook and other links work).</T>}
      {video ? (<>
        {info?.kind === 'embed' ? <EmbeddedVideo key={`${video.id}-${prev?.start ?? 'x'}`} url={video.url} autoplay={!!prev} start={prev?.start} end={prev?.end} />
          : <T muted>This link can't play inside the app, but you can still tag moments with the stopwatch and times.</T>}
        <Card>
          <T style={{ fontWeight: '800' }}>Stopwatch <T muted>· start it as you press play</T></T>
          <T style={{ fontSize: 34, fontWeight: '900' }}>{fmtClock(now())}</T>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Btn title={run ? 'Pause' : 'Start'} onPress={() => { if (run) { base.current = now(); setRun(false); } else { t0.current = Date.now(); setRun(true); } }} />
            <Btn title="−5 s" kind="ghost" onPress={() => { base.current = Math.max(0, now() - 5); t0.current = Date.now(); setF((x) => ({ ...x })); }} />
            <Btn title="+5 s" kind="ghost" onPress={() => { base.current = now() + 5; t0.current = Date.now(); setF((x) => ({ ...x })); }} />
            <Btn title="Reset" kind="ghost" onPress={() => { base.current = 0; t0.current = Date.now(); setRun(false); }} />
          </View>
          <Btn title="Use this time for the next tag" kind="ghost" onPress={() => setF({ ...f, time: fmtClock(now()) })} />
        </Card>
        <Card>
          <T style={{ fontWeight: '800' }}>Tag a moment</T>
          <Input label="Time in the video (minutes:seconds)" value={f.time} onChangeText={(v) => setF({ ...f, time: v })} autoCapitalize="none" placeholder="23:40" />
          <Chips options={TAGS.map((t) => ({ value: t.value, label: `${t.icon} ${t.label}` }))} value={f.tag} onChange={(v) => v && setTag(v)} />
          <T muted>Length</T><Chips options={LEN} value={f.len} onChange={(v) => v && setF({ ...f, len: v })} />
          {players.length ? <><T muted>Player (optional)</T><Chips options={players} value={f.player} onChange={(v) => setF({ ...f, player: v })} /></> : <T muted>Record who played to pick a player here.</T>}
          <Input label="Note (optional)" value={f.note} onChangeText={(v) => setF({ ...f, note: v })} maxLength={200} />
          <Toggle label="Show to fans on the match page" hint="Switch off for coaching clips such as mistakes. Staff only." value={f.pub} onChange={(v) => setF({ ...f, pub: v })} />
          <Btn title="Save tag" onPress={addClip} />
          <T muted style={{ fontSize: 12 }}>A clip starts 3 seconds before the time you enter so the build-up is included.</T>
        </Card>
        <H>Tagged moments</H>
        {(clips.data as any[]).length === 0 ? <T muted>Nothing tagged yet.</T> : (clips.data as any[]).map((c) => (
          <Card key={c.id}>
            <T style={{ fontWeight: '700' }}>{tagIcon(c.tag)} {tagLabel(c.tag)}{c.players?.full_name ? ` · ${c.players.full_name}` : ''} <T muted>· {fmtClock(c.start_sec)}{c.end_sec ? `–${fmtClock(c.end_sec)}` : ''}</T></T>
            {c.note ? <T muted>{c.note}</T> : null}
            <Toggle label="Shown to fans" value={c.is_public} onChange={(v) => wrap(() => supabase.from('video_clips').update({ is_public: v }).eq('id', c.id) as any)} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {info?.kind === 'embed' ? <Btn title="Play" kind="ghost" onPress={() => setPrev({ start: c.start_sec, end: c.end_sec ?? undefined })} /> : null}
              <Btn title="Delete" kind="danger" onPress={() => wrap(() => supabase.from('video_clips').delete().eq('id', c.id) as any)} />
            </View>
          </Card>))}
        <Btn title="Remove this video and its tags" kind="danger" onPress={() => wrap(() => supabase.from('match_videos').delete().eq('id', video.id) as any).then(() => setVid(null))} />
      </>) : null}
      <Card>
        <T style={{ fontWeight: '800' }}>Add a video</T>
        <Input label="Title (e.g. Full match, Second half)" value={nv.title} onChangeText={(v) => setNv({ ...nv, title: v })} maxLength={120} />
        <Input label="Video link" value={nv.url} onChangeText={(v) => setNv({ ...nv, url: v })} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        <Btn title="Add video" onPress={addVideo} />
        <T muted style={{ fontSize: 12 }}>Only share recordings you have the right to publish, and check your club's policy on filming and publishing images of young people before making clips public.</T>
      </Card>
    </Screen>
  );
}
