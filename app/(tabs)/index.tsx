import { useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { Screen, H, T, Card, Loading, fmtDate, s } from '../../components/ui';
import { useTable } from '../../lib/useQuery';
import { useApp } from '../../lib/app-context';
import { StandingsTable } from '../../components/StandingsTable';
import { PredictionBar } from '../../components/PredictionBar';
import { AvailabilityCard } from '../../components/AvailabilityCard';
import { Hero } from '../../components/Hero';
import { MatchTeams } from '../../components/MatchTeams';
import { KickoffCountdown } from '../../components/PreMatchCard';
import { PageHead } from '../../components/PageHead';
import { AdSlot } from '../../components/AdSlot';
import { money } from '../../lib/money';
import { useLayout } from '../../lib/layout';
import { PollCard } from '../../components/PollCard';
import { SponsorStrip } from '../../components/SponsorStrip';
import { fetchPolls, pollOpen, type Poll } from '../../lib/fans';

export default function Home() {
  const { settings } = useApp();
  const { wide } = useLayout();
  const news = useTable('news_posts', (q) => q.not('published_at', 'is', null).lte('published_at', new Date().toISOString()).order('published_at', { ascending: false }).limit(5));
  const ann = useTable('announcements', (q) => q.eq('is_active', true).order('created_at', { ascending: false }).limit(3));
  const next = useTable('matches', (q) => q.in('status', ['scheduled', 'live']).gte('kickoff_at', new Date(Date.now() - 3 * 3600e3).toISOString()).order('kickoff_at').limit(1).select('*, opponents(name)'));
  const last = useTable('matches', (q) => q.eq('status', 'finished').order('kickoff_at', { ascending: false }).limit(1).select('*, opponents(name)'));
  const comps = useTable('competitions', (q) => q.eq('is_visible', true).order('is_primary', { ascending: false }).order('sort_order').limit(1));
  const comp: any = comps.data[0];
  const mini = useTable('standings_rows', (q) => (comp ? q.eq('competition_id', comp.id).order('position').limit(6) : q.limit(0)), [comp?.id]);
  const n0: any = next.data[0];
  const pred = useTable('match_predictions', (q) => (n0 ? q.eq('match_id', n0.id) : q.limit(0)), [n0?.id]);
  const feat = useTable('products', (q) => q.eq('is_active', true).eq('featured', true).limit(4).select('*, product_images(url,sort_order)'));
  const tr = useTable('tryouts', (q) => q.eq('is_published', true).eq('applications_open', true).gte('starts_at', new Date().toISOString()).order('starts_at').limit(1));
  const aw = useTable('awards', (q) => q.eq('is_published', true).order('awarded_on', { ascending: false }).limit(1).select('*, players(full_name), award_types(label)'));
  const [polls, setPolls] = useState<Poll[]>([]);
  useEffect(() => { fetchPolls({ standalone: true, limit: 3 }).then((r) => setPolls(r.filter(pollOpen).slice(0, 1))).catch(() => {}); }, []);
  if (news.loading) return <Loading />;
  const n = next.data[0] as any, l = last.data[0] as any;
  return (
    <Screen><PageHead description={settings.hero_subtitle || `Official website and app of ${settings.team_name}`} image={settings.hero_image_url || undefined} />
      <Hero />
      {settings.registration_open !== false && (
        <Link href="/tryouts" asChild><Pressable><Card style={{ borderColor: settings.primary_color ?? '#0B6E4F' }}>
          <T style={{ fontWeight: '800', fontSize: 17 }}>Join {settings.team_name ?? 'the team'}</T>
          <T muted>{tr.data[0] ? `Next tryout: ${(tr.data[0] as any).title} · ${fmtDate((tr.data[0] as any).starts_at)}. Tap to apply.` : 'See upcoming tryouts and apply.'} Have a team code? Sign in to create your player account.</T>
        </Card></Pressable></Link>
      )}
      <H>Latest news</H>
      {news.data.length === 0 && <T muted>No news yet.</T>}
      {news.data.map((p: any) => (
        <Link key={p.id} href={`/news/${p.slug}`} asChild>
          <Pressable><Card>
            {p.cover_url ? <Image source={{ uri: p.cover_url }} style={{ height: 150, borderRadius: 8 }} /> : null}
            <T style={{ fontWeight: '700', fontSize: 17 }}>{p.title}</T>
            {p.summary ? <T muted>{p.summary}</T> : null}
          </Card></Pressable>
        </Link>
      ))}
      {ann.data.length > 0 && <><H>From the club</H>{ann.data.map((a: any) => <Card key={a.id}><T style={{ fontWeight: '700' }}>{a.title}</T>{a.body ? <T muted>{a.body}</T> : null}</Card>)}</>}
      {n0 ? <AvailabilityCard matchId={n0.id} compact /> : null}
      {settings.polls_enabled !== false ? polls.map((x) => <PollCard key={x.id} poll={x} />) : null}
      {n0 && settings.fan_predictions_enabled !== false ? <Link href={`/match/${n0.id}`} asChild><Pressable><Card><T style={{ fontWeight: '800' }}>🎯 Predict the score</T><T muted>Call the next result and climb the leaderboard.</T></Card></Pressable></Link> : null}
      {aw.data[0] ? (() => { const a: any = aw.data[0]; return (
        <Link href="/awards" asChild><Pressable><Card><T muted>🏆 {a.award_types?.label} · {a.period_label}</T><T style={{ fontWeight: '800', fontSize: 17 }}>{a.players?.full_name ?? '—'}</T></Card></Pressable></Link>); })() : null}
      {settings.shop_enabled !== false && feat.data.length > 0 && (<>
        <H>From the shop</H>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 }}>
          {(feat.data as any[]).map((pr) => { const im = [...(pr.product_images ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order)[0]?.url; return (
            <Link key={pr.id} href={`/product/${pr.slug}`} asChild><Pressable accessibilityRole="link" accessibilityLabel={pr.name} style={{ width: wide ? '25%' : '50%', padding: 6 }}><Card style={{ padding: 0, overflow: 'hidden' }}>
              <View style={{ aspectRatio: 1, backgroundColor: '#E6E8EC' }}>{im ? <Image source={{ uri: im }} accessibilityLabel={pr.name} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : null}</View>
              <View style={{ padding: 10 }}><T style={{ fontWeight: '700' }} numberOfLines={1}>{pr.name}</T><T style={{ fontWeight: '800' }}>{money(pr.price, settings.currency ?? 'USD')}</T></View></Card></Pressable></Link>); })}
        </View>
      </>)}
      <Link href="/season-review" asChild><Pressable accessibilityRole="link"><Card><T style={{ fontWeight: '800' }}>📊 Season review</T><T muted>Results, top scorers, assists and awards.</T></Card></Pressable></Link>
      {comp && mini.data.length > 0 && (
        <Link href="/table" asChild><Pressable><Card>
          <T style={{ fontWeight: '800', fontSize: 17 }}>{comp.name}</T>
          <StandingsTable rows={mini.data as any[]} compact />
          <T muted style={{ fontSize: 12 }}>Tap for the full table</T>
        </Card></Pressable></Link>
      )}
      <H>Matches</H>
      <Card><T muted>{n?.status === 'live' ? '🔴 Live now' : 'Next'}</T>{n ? <><MatchTeams match={n} /><T muted>{fmtDate(n.kickoff_at)}{n.venue ? ` · ${n.venue}` : ''}</T><KickoffCountdown match={n} /><Link href={`/match/${n.id}`}><T style={{ fontWeight: '700', textDecorationLine: 'underline' }}>Match details →</T></Link>{pred.data[0] && settings.predictions_enabled !== false ? <PredictionBar p={pred.data[0] as any} compact /> : null}{n.status === 'live' && settings.live_updates_enabled !== false ? <Link href={`/match/${n.id}`}><T style={{ fontWeight: '800' }}>{n.goals_for ?? 0} – {n.goals_against ?? 0} · Follow live →</T></Link> : null}</> : <T muted>No upcoming match</T>}</Card>
      <Card><T muted>Latest result</T>{l ? <MatchTeams match={l} /> : <T muted>No results yet</T>}</Card>
      <AdSlot placement="home" />
      <SponsorStrip placement="home" />
    </Screen>
  );
}
