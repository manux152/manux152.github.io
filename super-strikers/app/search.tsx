import { useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { Screen, H, T, Card, Input, Chips, Loading, fmtDate, Avatar } from '../components/ui';
import { supabase } from '../lib/supabase';
import { useTable } from '../lib/useQuery';
import { useApp } from '../lib/app-context';
import { matchTitle, matchScoreLine } from '../lib/matchday';
import { Appearances } from '../components/Appearances';

type Hit = { id: string; kind: string; title: string; sub?: string; route: string; img?: string | null; person?: boolean; profileId?: string; playerId?: string };
const KINDS = [['all', 'All'], ['players', 'Players'], ['members', 'Members'], ['news', 'News'], ['matches', 'Matches'], ['teams', 'Teams'], ['events', 'Events'], ['shop', 'Shop'], ['media', 'Media'], ['tryouts', 'Tryouts']];
const ICON: Record<string, string> = { players: '👤', members: '🙂', news: '📰', matches: '⚽', teams: '🛡️', events: '📅', shop: '🛍️', media: '🖼️', tryouts: '📝' };

export default function Search() {
  const { settings } = useApp();
  const [q, setQ] = useState(''); const [kind, setKind] = useState('all');
  const [position, setPosition] = useState<string | null>(null); const [category, setCategory] = useState<string | null>(null);
  const [mstatus, setMstatus] = useState<string | null>(null);
  const [hits, setHits] = useState<Hit[]>([]); const [busy, setBusy] = useState(false);
  const positions = useTable('positions', (x) => x.order('sort_order'));
  const cats = useTable('product_categories', (x) => x.order('sort_order'));
  const newsCats = useTable('news_posts', (x) => x.not('category', 'is', null).not('published_at', 'is', null).limit(100));
  const newsCatList = Array.from(new Set((newsCats.data as any[]).map((n) => n.category))).filter(Boolean) as string[];

  useEffect(() => {
    const term = q.replace(/[%,()*]/g, ' ').trim();
    if (term.length < 2) { setHits([]); return; }
    const h = setTimeout(async () => {
      setBusy(true);
      const like = `%${term}%`; const want = (k: string) => kind === 'all' || kind === k; const out: Hit[] = []; const playerProfiles = new Set<string>();
      const jobs: Promise<void>[] = [];
      if (want('players')) jobs.push((async () => {
        let r = supabase.from('players').select('id,full_name,shirt_number,photo_url,position_id,profile_id,positions(name)').eq('is_active', true).ilike('full_name', like).limit(15);
        if (position) r = r.eq('position_id', position);
        const { data } = await r; (data ?? []).forEach((p: any) => { if (p.profile_id) playerProfiles.add(p.profile_id); out.push({ id: 'p' + p.id, kind: 'players', title: `${p.shirt_number != null ? '#' + p.shirt_number + ' ' : ''}${p.full_name}`, sub: p.positions?.name, route: `/player/${p.id}`, playerId: p.id, img: p.photo_url }); });
        if (!position) { const s = await supabase.from('staff').select('id,full_name,title').ilike('full_name', like).limit(8);
          (s.data ?? []).forEach((x: any) => out.push({ id: 's' + x.id, kind: 'players', title: x.full_name, sub: x.title, route: '/players' })); }
      })());
      if (want('members')) jobs.push((async () => {
        const { data } = await supabase.rpc('search_members', { p_q: term });
        (data ?? []).forEach((m: any) => out.push({ id: 'u' + m.id, kind: 'members', title: m.full_name, sub: 'Member', route: `/tagged/member/${m.id}?name=${encodeURIComponent(m.full_name)}${m.avatar_url ? '&photo=' + encodeURIComponent(m.avatar_url) : ''}`, img: m.avatar_url, person: true, profileId: m.id }));
      })());
      if (want('news')) jobs.push((async () => {
        let r = supabase.from('news_posts').select('id,title,slug,summary,category,cover_url').not('published_at', 'is', null).lte('published_at', new Date().toISOString())
          .or(`title.ilike.${like},summary.ilike.${like},body.ilike.${like}`).limit(15);
        if (category) r = r.eq('category', category);
        const { data } = await r; (data ?? []).forEach((n: any) => out.push({ id: 'n' + n.id, kind: 'news', title: n.title, sub: n.category ?? n.summary, route: `/news/${n.slug}`, img: n.cover_url }));
      })());
      if (want('matches')) jobs.push((async () => {
        const { data: opp } = await supabase.from('opponents').select('id').ilike('name', like);
        const ids = (opp ?? []).map((o: any) => o.id);
        let r = supabase.from('matches').select('id,kickoff_at,status,is_home,competition,venue,goals_for,goals_against,opponents(name)')
          .or([`competition.ilike.${like}`, `venue.ilike.${like}`, ids.length ? `opponent_id.in.(${ids.join(',')})` : ''].filter(Boolean).join(',')).order('kickoff_at', { ascending: false }).limit(15);
        if (mstatus === 'upcoming') r = r.in('status', ['scheduled', 'live']); if (mstatus === 'results') r = r.eq('status', 'finished');
        const { data } = await r; (data ?? []).forEach((m: any) => out.push({ id: 'm' + m.id, kind: 'matches', title: m.status === 'finished' ? matchScoreLine(m, settings.team_name) : matchTitle(m, settings.team_name), sub: fmtDate(m.kickoff_at), route: `/match/${m.id}` }));
      })());
      if (want('teams')) jobs.push((async () => {
        const { data } = await supabase.from('standings_rows').select('id,team_name,position,points,team_logo,competitions(name)').ilike('team_name', like).limit(15);
        (data ?? []).forEach((t: any) => out.push({ id: 't' + t.id, kind: 'teams', title: t.team_name, sub: `${t.competitions?.name ?? 'Table'} · position ${t.position} · ${t.points} pts`, route: '/table', img: t.team_logo }));
      })());
      if (want('events')) jobs.push((async () => {
        const { data } = await supabase.from('events').select('id,title,starts_at,location,category').eq('is_published', true).or(`title.ilike.${like},location.ilike.${like},category.ilike.${like}`).limit(10);
        (data ?? []).forEach((e: any) => out.push({ id: 'e' + e.id, kind: 'events', title: e.title, sub: `${fmtDate(e.starts_at)}${e.location ? ' · ' + e.location : ''}`, route: '/calendar' }));
      })());
      if (want('shop') && settings.shop_enabled !== false) jobs.push((async () => {
        let r = supabase.from('products').select('id,name,slug,price,category_id,product_images(url,sort_order)').eq('is_active', true).or(`name.ilike.${like},description.ilike.${like}`).limit(15);
        if (category) r = r.eq('category_id', category);
        const { data } = await r; (data ?? []).forEach((p: any) => out.push({ id: 'g' + p.id, kind: 'shop', title: p.name, sub: String(p.price), route: `/product/${p.slug}`, img: [...(p.product_images ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order)[0]?.url }));
      })());
      if (want('media')) jobs.push((async () => {
        const { data } = await supabase.from('albums').select('id,title,description,cover_url').eq('is_published', true).or(`title.ilike.${like},description.ilike.${like}`).limit(10);
        (data ?? []).forEach((a: any) => out.push({ id: 'a' + a.id, kind: 'media', title: a.title, sub: a.description, route: `/media/${a.id}`, img: a.cover_url }));
      })());
      if (want('tryouts')) jobs.push((async () => {
        const { data } = await supabase.from('tryouts').select('id,title,starts_at,location').eq('is_published', true).or(`title.ilike.${like},location.ilike.${like}`).limit(10);
        (data ?? []).forEach((t: any) => out.push({ id: 'r' + t.id, kind: 'tryouts', title: t.title, sub: `${fmtDate(t.starts_at)}${t.location ? ' · ' + t.location : ''}`, route: `/tryout/${t.id}` }));
      })());
      await Promise.all(jobs.map((j) => j.catch(() => {})));
      setHits(out.filter((x) => !(x.person && x.profileId && playerProfiles.has(x.profileId)))); setBusy(false);
    }, 300);
    return () => clearTimeout(h);
  }, [q, kind, position, category, mstatus, settings.shop_enabled]);

  // People found by the search: show everywhere they are tagged (news articles, photos, videos)
  const people = hits.filter((x) => (x.kind === 'players' && x.playerId) || (x.kind === 'members' && x.profileId)).slice(0, 3);
  const grouped: Record<string, Hit[]> = {}; hits.forEach((x) => (grouped[x.kind] ||= []).push(x));
  return (
    <Screen><H>Search</H>
      <Input placeholder="Search players, members, news, matches, teams, shop…" value={q} onChangeText={setQ} autoFocus />
      <Chips options={KINDS.map(([v, l]) => ({ value: v, label: l }))} value={kind} onChange={(v) => { setKind(v ?? 'all'); setPosition(null); setCategory(null); setMstatus(null); }} />
      {kind === 'players' && <Chips options={(positions.data as any[]).map((p) => ({ value: p.id, label: p.name }))} value={position} onChange={setPosition} />}
      {kind === 'news' && <Chips options={newsCatList.map((c) => ({ value: c, label: c }))} value={category} onChange={setCategory} />}
      {kind === 'shop' && <Chips options={(cats.data as any[]).map((c) => ({ value: c.id, label: c.name }))} value={category} onChange={setCategory} />}
      {kind === 'matches' && <Chips options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'results', label: 'Results' }]} value={mstatus} onChange={setMstatus} />}
      {q.trim().length < 2 ? <T muted>Type at least 2 letters.</T> : busy ? <Loading /> : hits.length === 0 ? <T muted>Nothing found for “{q.trim()}”.</T> : null}
      {people.map((x) => (
        <Card key={'tag' + x.id} style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {x.kind === 'members' ? <Avatar url={x.img} name={x.title} size={40} /> : x.img ? <Avatar url={x.img} name={x.title} size={40} /> : <T style={{ fontSize: 26 }}>👤</T>}
            <View style={{ flex: 1 }}><T style={{ fontWeight: '800' }}>📌 Where {x.title.replace(/^#\d+\s/, '')} is tagged</T><T muted style={{ fontSize: 12 }}>News articles, photos and videos</T></View>
            <Link href={x.route as any} asChild><Pressable accessibilityRole="link" accessibilityLabel={`Open ${x.title}`}><T style={{ fontWeight: '700' }}>Open →</T></Pressable></Link>
          </View>
          <Appearances playerId={x.playerId} profileId={x.kind === 'members' ? x.profileId : undefined} name={x.title.replace(/^#\d+\s/, '')} limit={4} />
        </Card>
      ))}
      {Object.entries(grouped).map(([k, list]) => (
        <View key={k} style={{ gap: 8 }}>
          <T muted style={{ fontWeight: '700' }}>{ICON[k]} {KINDS.find(([v]) => v === k)?.[1]} ({list.length})</T>
          {list.map((h) => {
            const card = (
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {h.person ? <Avatar url={h.img} name={h.title} size={48} /> : h.img ? <Image source={{ uri: h.img }} accessibilityLabel="" style={{ width: 48, height: 48, borderRadius: 8 }} contentFit="cover" /> : <T style={{ fontSize: 26 }}>{ICON[h.kind]}</T>}
                <View style={{ flex: 1 }}><T style={{ fontWeight: '700' }}>{h.title}</T>{h.sub ? <T muted numberOfLines={1}>{h.kind === 'shop' ? `${settings.currency ?? ''} ${h.sub}` : h.sub}</T> : null}</View>
              </Card>);
            return h.route ? <Link key={h.id} href={h.route as any} asChild><Pressable accessibilityRole="link" accessibilityLabel={h.title}>{card}</Pressable></Link> : <View key={h.id}>{card}</View>;
          })}
        </View>
      ))}
    </Screen>
  );
}
