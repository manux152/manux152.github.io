import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Screen, H, T, Card, Btn, Loading, fmtDate } from '../../components/ui';
import { useTable } from '../../lib/useQuery';
import { useApp } from '../../lib/app-context';
import { PredictionBar } from '../../components/PredictionBar';
import { AvailabilityCard } from '../../components/AvailabilityCard';
import { Pitch } from '../../components/Pitch';
import { PageHead } from '../../components/PageHead';
import { LiveMatchCard } from '../../components/LiveMatchCard';
import { MotmCard } from '../../components/MotmCard';
import { ShareCard } from '../../components/ShareCard';
import { FanPredictCard } from '../../components/FanPredictCard';
import { PollCard } from '../../components/PollCard';
import { SponsorStrip } from '../../components/SponsorStrip';
import { HighlightsCard } from '../../components/HighlightsCard';
import { fetchPolls, type Poll } from '../../lib/fans';
import { useLiveMatch, useAutoClock, useTick, eventIcon, matchTitle, matchScoreLine } from '../../lib/matchday';
import { MatchTeams } from '../../components/MatchTeams';
import { PreMatchCard } from '../../components/PreMatchCard';
import { shareCardImage } from '../../lib/shareCard';

export default function MatchDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings } = useApp();
  const liveOn = settings.live_updates_enabled !== false;
  const { match: x, events, commentary, loading, refresh } = useLiveMatch(id, liveOn);
  const htMin = Number(settings.half_time_minutes ?? 15) || 15; const preMin = Number(settings.pre_match_minutes ?? 10) || 10;
  useAutoClock(x, refresh, htMin); useTick(x?.status === 'scheduled', 5000);
  const lineup = useTable('lineups', (q) => q.eq('match_id', id).select('*, formations(name, positions), lineup_players(player_id, slot_key, sort_order, players(full_name, shirt_number, photo_url))'), [id]);
  const pred = useTable('match_predictions', (q) => q.eq('match_id', id), [id]);
  const lu = useTable('match_players', (q) => q.eq('match_id', id).select('*, players(full_name, shirt_number, photo_url)'), [id]);
  const cardRef = useRef<View>(null); const [polls, setPolls] = useState<Poll[]>([]);
  useEffect(() => { if (id) fetchPolls({ match: id, limit: 2 }).then(setPolls).catch(() => {}); }, [id]);
  const [variant, setVariant] = useState<'result' | 'fixture' | 'lineup'>('result');
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  if (loading) return <Loading />;
  if (!x) return <Screen><T muted>Match not found.</T></Screen>;

  const l: any = lineup.data[0];
  const published = !!l && l.is_published && !!l.formations;
  const starters = published ? (l.lineup_players ?? []).filter((r: any) => r.slot_key).map((r: any) => ({ name: r.players?.full_name, number: r.players?.shirt_number })) : [];
  const scorers = (events as any[]).filter((e) => e.event_types?.stat_key === 'goal' && e.player?.full_name).map((e) => `${e.player.full_name.split(' ').slice(-1)[0]}${e.minute != null ? ` ${e.minute}′` : ''}`);
  const kind: 'result' | 'fixture' | 'lineup' = x.status === 'finished' ? (variant === 'lineup' && published ? 'lineup' : 'result') : (variant === 'lineup' && published ? 'lineup' : 'fixture');
  const shareText = kind === 'result' ? `Full time: ${matchScoreLine(x, settings.team_name)}` : kind === 'lineup' ? `Starting XI ${matchTitle(x, settings.team_name)}: ${starters.map((p: any) => p.name).join(', ')}` : `Match day: ${matchTitle(x, settings.team_name)} — ${fmtDate(x.kickoff_at)}`;
  const soon = x.status === 'scheduled' && new Date(x.kickoff_at).getTime() - Date.now() <= preMin * 60000 && Date.now() - new Date(x.kickoff_at).getTime() < 2 * 3600e3;
  const cardsOf = (pid: string) => { const mine = (events as any[]).filter((e) => e.player_id === pid); return { yellow: mine.filter((e) => e.event_types?.stat_key === 'yellow_card').length, red: mine.some((e) => e.event_types?.stat_key === 'red_card') }; };
  const showLive = liveOn && (x.status === 'live' || commentary.length > 0);
  const share = async () => setShareMsg(await shareCardImage(cardRef, shareText));

  return (
    <Screen><PageHead title={matchTitle(x, settings.team_name)} description={`${x.opponents?.name} — ${new Date(x.kickoff_at).toDateString()}`} />
      <MatchTeams match={x} score={false} big />
      <T muted style={{ textAlign: 'center' }}>{fmtDate(x.kickoff_at)}{x.venue ? ` · ${x.venue}` : ''}{x.competition ? ` · ${x.competition}` : ''}</T>
      {showLive ? <LiveMatchCard match={x} commentary={commentary} />
        : x.status === 'finished' ? <T style={{ fontSize: 28, fontWeight: '800' }}>{x.goals_for} – {x.goals_against}</T> : <T muted>{x.status}</T>}
      {soon ? <PreMatchCard match={x} prediction={pred.data[0]} lineup={l} /> : null}
      {!soon && (x.status === 'scheduled' || x.status === 'live') && settings.predictions_enabled !== false && pred.data[0] ? (() => { const p: any = pred.data[0]; return (
        <Card>
          <T style={{ fontWeight: '800', fontSize: 17 }}>Match prediction</T>
          <PredictionBar p={p} />
          <T muted>Expected goals {Number(p.expected_goals_for).toFixed(1)} – {Number(p.expected_goals_against).toFixed(1)} · confidence {p.confidence}</T>
          {p.rationale ? <T>{p.rationale}</T> : null}
          <T muted style={{ fontSize: 12 }}>An estimate from past results ({p.basis}). Not a guarantee — football is unpredictable.</T>
        </Card>); })() : null}
      {(x.status === 'scheduled' || x.status === 'live') && <AvailabilityCard matchId={x.id} />}
      <FanPredictCard match={x} />
      {polls.map((pl) => <PollCard key={pl.id} poll={pl} />)}
      {x.status === 'finished' ? <MotmCard match={x} players={(lu.data as any[]).filter((p) => p.players)} /> : null}
      {published && !soon ? (() => {
        const info: Record<string, any> = {}; (l.lineup_players ?? []).filter((r: any) => r.slot_key).forEach((r: any) => { info[r.slot_key] = { name: r.players?.full_name?.split(' ').slice(-1)[0], photo: r.players?.photo_url, number: r.players?.shirt_number, captain: r.player_id === l.captain_id ? 'C' : r.player_id === l.vice_captain_id ? 'VC' : null, ...cardsOf(r.player_id) }; });
        const bench = (l.lineup_players ?? []).filter((r: any) => !r.slot_key);
        return (<Card><T style={{ fontWeight: '800', fontSize: 17 }}>Lineup · {l.formations.name}</T>
          <Pitch positions={l.formations.positions} info={info} />
          {bench.length ? <T><T style={{ fontWeight: '700' }}>Bench: </T>{bench.map((r: any) => r.players?.full_name).join(', ')}</T> : null}
          {l.notes ? <T muted>{l.notes}</T> : null}</Card>); })() : null}
      {x.status !== 'cancelled' && x.status !== 'postponed' ? (
        <Card>
          <T style={{ fontWeight: '800', fontSize: 17 }}>Share</T>
          {published ? <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Btn title={x.status === 'finished' ? 'Result card' : 'Match-day card'} kind={kind === 'lineup' ? 'ghost' : 'primary'} onPress={() => setVariant(x.status === 'finished' ? 'result' : 'fixture')} /></View>
            <View style={{ flex: 1 }}><Btn title="Lineup card" kind={kind === 'lineup' ? 'primary' : 'ghost'} onPress={() => setVariant('lineup')} /></View>
          </View> : null}
          <View style={{ alignItems: 'center', paddingVertical: 6 }}>
            <ShareCard ref={cardRef} variant={kind} match={x} scorers={scorers} starters={starters} formation={l?.formations?.name} />
          </View>
          <Btn title="Share picture" onPress={share} />
          {shareMsg ? <T muted>{shareMsg}</T> : null}
        </Card>) : null}
      <HighlightsCard matchId={x.id} />
      <SponsorStrip placement="match" title="Match partners" />
      {x.report ? <Card><T>{x.report}</T></Card> : null}
      <H>Timeline</H>
      {events.length === 0 && <T muted>No events recorded.</T>}
      {(events as any[]).map((e) => (
        <Card key={e.id} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <T style={{ fontWeight: '800', width: 40 }}>{e.minute != null ? `${e.minute}'` : '–'}</T><T style={{ fontSize: 20 }}>{eventIcon(e)}</T>
          <View style={{ flex: 1 }}>
            <T style={{ fontWeight: '700' }}>{e.event_types?.label}{e.player?.full_name ? ` · ${e.player.full_name}` : ''}</T>
            {e.assist?.full_name ? <T muted>Assist: {e.assist.full_name}</T> : null}
            {e.notes ? <T muted>{e.notes}</T> : null}
          </View>
        </Card>
      ))}
      {lu.data.length > 0 && <><H>Squad</H><Card>
        {(lu.data as any[]).sort((a, b) => Number(b.started) - Number(a.started)).map((p) =>
          <T key={p.player_id}>{p.players?.shirt_number != null ? `#${p.players.shirt_number} ` : ''}{p.players?.full_name}{p.started ? '' : ' (sub)'}</T>)}
      </Card></>}
    </Screen>
  );
}
