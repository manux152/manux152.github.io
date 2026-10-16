import { useEffect, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { T, Card, Btn } from './ui';
import { EmbeddedVideo } from './EmbeddedVideo';
import { embedInfo } from '../lib/embed';
import { supabase } from '../lib/supabase';
import { fmtClock, tagIcon, tagLabel } from '../lib/video';
import { useColor } from './ui';

type Clip = { id: string; start_sec: number; end_sec: number | null; tag: string; note: string | null; is_public: boolean; players: { full_name: string } | null; match_videos: { id: string; title: string; url: string } };

/** Tagged clips from the match video(s): tap one to watch just that moment. Used on match pages (all clips) and player pages (that player's clips). */
export function HighlightsCard({ matchId, playerId, title = 'Highlights' }: { matchId?: string; playerId?: string; title?: string }) {
  const c = useColor(); const [clips, setClips] = useState<Clip[]>([]); const [sel, setSel] = useState<string | null>(null);
  useEffect(() => {
    let q: any = supabase.from('video_clips').select('id,start_sec,end_sec,tag,note,is_public,players(full_name),match_videos!inner(id,title,url,match_id,is_published)').order('start_sec').limit(60);
    if (matchId) q = q.eq('match_videos.match_id', matchId); if (playerId) q = q.eq('player_id', playerId);
    q.then(({ data }: any) => setClips((data ?? []) as Clip[]), () => {});
  }, [matchId, playerId]);
  const cur = clips.find((x) => x.id === sel);
  if (!clips.length) return null;
  const info = cur ? embedInfo(cur.match_videos.url) : null;
  return (
    <Card>
      <T style={{ fontWeight: '800', fontSize: 17 }}>🎬 {title}</T>
      {cur ? (info?.kind === 'embed'
        ? <EmbeddedVideo key={cur.id} url={cur.match_videos.url} autoplay start={cur.start_sec} end={cur.end_sec ?? undefined} />
        : <Btn title={`Open the video (at ${fmtClock(cur.start_sec)})`} kind="ghost" onPress={() => Linking.openURL(cur.match_videos.url)} />) : null}
      {clips.map((x) => (
        <Pressable key={x.id} accessibilityRole="button" accessibilityLabel={`${tagLabel(x.tag)} at ${fmtClock(x.start_sec)}${x.players ? `, ${x.players.full_name}` : ''}`} onPress={() => setSel(x.id === sel ? null : x.id)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingVertical: 4, borderLeftWidth: 3, borderLeftColor: x.id === sel ? c : 'transparent', paddingLeft: 8 }}>
          <T style={{ fontSize: 20 }}>{tagIcon(x.tag)}</T>
          <View style={{ flex: 1 }}>
            <T style={{ fontWeight: '700' }}>{tagLabel(x.tag)}{x.players ? ` · ${x.players.full_name}` : ''}</T>
            <T muted style={{ fontSize: 13 }}>{fmtClock(x.start_sec)}{x.note ? ` · ${x.note}` : ''}{x.is_public ? '' : ' · staff only'}</T>
          </View>
        </Pressable>))}
    </Card>
  );
}
