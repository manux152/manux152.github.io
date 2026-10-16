import { useCallback, useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { View } from 'react-native';
import { H, T, Card, Btn, Input, Err, Avatar, fmtDate } from './ui';
import { useApp } from '../lib/app-context';
import { deleteComment, fetchComments, postComment, reportComment, type Comment } from '../lib/fans';

/** Comments under a news story. Signed-in members only, no links, rate-limited, reportable. Moderators can hold comments for approval. */
export function CommentsSection({ newsId, enabled }: { newsId: string; enabled: boolean }) {
  const { session, settings } = useApp(); const me = session?.user.id;
  const [list, setList] = useState<Comment[] | null>(null); const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null); const [note, setNote] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const mode = typeof settings.comments_mode === 'string' ? settings.comments_mode : 'open';
  const load = useCallback(async () => setList(await fetchComments(newsId)), [newsId]);
  useEffect(() => { load(); }, [load]);
  if (!enabled || mode === 'off') return null;
  const run = async (fn: () => Promise<any>, ok?: string) => { setBusy(true); setErr(null); setNote(null); try { await fn(); if (ok) setNote(ok); await load(); } catch (e: any) { setErr(e.message); } setBusy(false); };
  const send = () => run(async () => { const st = await postComment(newsId, text); setText(''); setNote(st === 'pending' ? 'Thanks! Your comment will appear once a moderator approves it.' : null); });
  return (
    <View style={{ gap: 8 }}>
      <H style={{ fontSize: 20 }}>Comments{list ? ` (${list.filter((c) => c.status === 'visible').length})` : ''}</H>
      {list === null ? null : list.length === 0 ? <T muted>No comments yet. Be the first.</T> : list.map((c) => (
        <Card key={c.id} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Avatar url={c.avatar_url} name={c.author_name} size={28} />
            <T style={{ fontWeight: '700', flex: 1 }}>{c.author_name}</T><T muted style={{ fontSize: 12 }}>{fmtDate(c.created_at)}</T>
          </View>
          <T>{c.body}</T>
          {c.status === 'pending' ? <T muted style={{ fontSize: 12 }}>Waiting for approval — only you can see this.</T> : null}
          {me ? <View style={{ flexDirection: 'row', gap: 8 }}>
            {c.mine ? <Btn title="Delete" kind="ghost" disabled={busy} onPress={() => run(() => deleteComment(c.id))} />
              : <Btn title="Report" kind="ghost" disabled={busy} onPress={() => run(() => reportComment(c.id), 'Thanks — a moderator will take a look.')} />}
          </View> : null}
        </Card>))}
      {me ? (
        <Card>
          <Input label="Add a comment" value={text} onChangeText={setText} multiline maxLength={500} placeholder="Be kind. No links, please." />
          <T muted style={{ fontSize: 12 }}>{text.length}/500 · Your name shows as first name and last initial.</T>
          <Err msg={err} />{note ? <T>{note}</T> : null}
          <Btn title="Post comment" disabled={busy || !text.trim()} onPress={send} />
        </Card>
      ) : <Link href="/login"><T style={{ fontWeight: '700', textDecorationLine: 'underline' }}>Sign in to join the conversation →</T></Link>}
    </View>
  );
}
