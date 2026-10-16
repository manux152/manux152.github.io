import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { Screen, H, T, Card, Btn, Input, Chips, Err, Loading, Toggle } from '../components/ui';
import { PhotoPicker } from '../components/PhotoPicker';
import { supabase } from '../lib/supabase';
import { useApp } from '../lib/app-context';
import { useTable } from '../lib/useQuery';

export default function MyProfile() {
  const { session, reload } = useApp();
  const [loaded, setLoaded] = useState(false);
  const myAtt = useTable('training_attendance', (q) => (session ? q.gte('marked_at', new Date(Date.now() - 90 * 864e5).toISOString()) : q.limit(0)), [session?.user.id]);
  const [name, setName] = useState(''); const [avatar, setAvatar] = useState<string | null>(null); const [board, setBoard] = useState(true);
  const [player, setPlayer] = useState<any | null>(null);
  const [height, setHeight] = useState(''); const [foot, setFoot] = useState<string | null>(null); const [bio, setBio] = useState('');
  const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data: p } = await supabase.from('profiles').select('full_name,avatar_url,show_on_leaderboards').eq('id', session.user.id).maybeSingle();
      setName(p?.full_name ?? ''); setAvatar(p?.avatar_url ?? null); setBoard((p as any)?.show_on_leaderboards !== false);
      const { data: pl } = await supabase.from('players').select('*, positions(name)').eq('profile_id', session.user.id).maybeSingle();
      setPlayer(pl ?? null); setHeight(pl?.height_cm ? String(pl.height_cm) : ''); setFoot(pl?.preferred_foot ?? null); setBio(pl?.bio ?? '');
      setLoaded(true);
    })();
  }, [session?.user.id]); // eslint-disable-line
  if (!session) return <Redirect href="/login" />;
  if (!loaded) return <Loading />;

  const uploaded = async (url: string) => {
    setErr(null);
    const { error } = await supabase.rpc('update_my_player_profile', { p_photo: url });
    if (error) return setErr(error.message);
    setAvatar(url); setMsg('Photo updated.');
  };
  const save = async () => {
    setErr(null); setMsg(null); setBusy(true);
    const a = await supabase.from('profiles').update({ full_name: name.trim(), show_on_leaderboards: board }).eq('id', session.user.id);
    const b = player ? await supabase.rpc('update_my_player_profile', { p_height: height ? Number(height) : null, p_foot: foot, p_bio: bio }) : { error: null };
    setBusy(false);
    if (a.error || b.error) return setErr((a.error ?? b.error)!.message);
    setMsg('Saved.'); await reload();
  };
  return (
    <Screen><H>My profile</H>
      <PhotoPicker url={avatar} bucket="avatars" folder={session.user.id} onUploaded={uploaded} size={130} />
      <T muted style={{ textAlign: 'center' }}>{player ? 'Your photo is shown in the squad list, on your player page and in search results.' : 'Your photo is shown on your account and in search results (you can turn this off in Settings).'}</T>
      <Input label="Full name" value={name} onChangeText={setName} />
      <Toggle label="Show me on fan leaderboards" hint="Your first name and last initial appear in the Predict the score league and next to your comments. Switching this off hides you from the league (not from comments you write)." value={board} onChange={setBoard} />
      {player ? (<>
        <Card><T muted>Set by the coaches</T><T style={{ fontWeight: '700' }}>{player.shirt_number != null ? `Jersey #${player.shirt_number}` : 'Jersey number not assigned yet'} · {player.positions?.name ?? 'Position not set'}</T></Card>
        <Input label="Height (cm)" keyboardType="numeric" value={height} onChangeText={setHeight} />
        <T muted>Preferred foot</T>
        <Chips options={[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }, { value: 'both', label: 'Both' }]} value={foot} onChange={setFoot} />
        <Input label="About me (max 600 characters)" multiline value={bio} onChangeText={setBio} style={{ minHeight: 90 }} />
      </>) : null}
      {player && (myAtt.data as any[]).length > 0 ? (() => { const a = myAtt.data as any[]; const c = (k: string) => a.filter((r) => r.status === k).length;
        return <Card><T style={{ fontWeight: '800' }}>My training attendance (last 90 days)</T><T>Present {c('present')} · Late {c('late')} · Excused {c('excused')} · Absent {c('absent')}</T></Card>; })() : null}
      <Err msg={err} />{msg ? <T>{msg}</T> : null}
      <Btn title="Save" onPress={save} disabled={busy} />
    </Screen>
  );
}
