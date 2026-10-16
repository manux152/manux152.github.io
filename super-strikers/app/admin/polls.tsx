import { useState } from 'react';
import { View } from 'react-native';
import { Screen, H, T, Card, Btn, Input, Chips, Err, Loading, Toggle, fmtDate } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useTable } from '../../lib/useQuery';
import { useApp } from '../../lib/app-context';
import { pollOpen } from '../../lib/fans';

const CLOSE = [{ value: '0', label: 'No end' }, { value: '24', label: '24 hours' }, { value: '72', label: '3 days' }, { value: '168', label: '7 days' }];
const SHOW = [{ value: 'after_vote', label: 'After they vote' }, { value: 'always', label: 'Always' }, { value: 'after_close', label: 'When closed' }];

/** Admin → Polls: ask fans a question (home page, under a match or under a news story). */
export default function AdminPolls() {
  const { can } = useApp();
  const polls = useTable('polls', (q) => q.order('created_at', { ascending: false }).limit(40).select('*, poll_options(id,label,sort_order)'));
  const matches = useTable('matches', (q) => q.order('kickoff_at', { ascending: false }).limit(8).select('id, kickoff_at, opponents(name)'));
  const news = useTable('news_posts', (q) => q.order('created_at', { ascending: false }).limit(8).select('id,title'));
  const [q, setQ] = useState(''); const [opts, setOpts] = useState(['', '']); const [where, setWhere] = useState<'home' | 'match' | 'news'>('home'); const [ref, setRef] = useState<string | null>(null);
  const [close, setClose] = useState('0'); const [show, setShow] = useState('after_vote'); const [tally, setTally] = useState<Record<string, Record<string, number>>>({});
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  if (!can('news.manage')) return <Screen><T>No permission.</T></Screen>;
  if (polls.loading) return <Loading />;
  const clean = opts.map((o) => o.trim()).filter(Boolean);
  const create = async () => {
    setErr(null);
    if (q.trim().length < 3) return setErr('Write the question first.');
    if (clean.length < 2) return setErr('Add at least two answers.');
    if (where !== 'home' && !ref) return setErr(`Choose the ${where === 'match' ? 'match' : 'story'} this poll belongs to.`);
    setBusy(true);
    const { data, error } = await supabase.from('polls').insert({ question: q.trim(), match_id: where === 'match' ? ref : null, news_id: where === 'news' ? ref : null, results_mode: show, closes_at: close === '0' ? null : new Date(Date.now() + Number(close) * 3600e3).toISOString() }).select('id').single();
    if (error || !data) { setBusy(false); return setErr(error?.message ?? 'Could not save the poll.'); }
    const { error: e2 } = await supabase.from('poll_options').insert(clean.map((label, i) => ({ poll_id: (data as any).id, label, sort_order: i })));
    setBusy(false); if (e2) return setErr(e2.message);
    setQ(''); setOpts(['', '']); setRef(null); await polls.refresh();
  };
  const patch = async (id: string, v: any) => { const { error } = await supabase.from('polls').update(v).eq('id', id); if (error) setErr(error.message); await polls.refresh(); };
  const del = async (id: string) => { const { error } = await supabase.from('polls').delete().eq('id', id); if (error) setErr(error.message); await polls.refresh(); };
  const results = async (id: string) => { const { data } = await supabase.rpc('poll_results', { p_poll: id }); setTally((t) => ({ ...t, [id]: Object.fromEntries(((data ?? []) as any[]).map((r) => [r.option_id, Number(r.votes)])) })); };

  return (
    <Screen>
      <H>Polls</H>
      <Card>
        <T style={{ fontWeight: '800' }}>New poll</T>
        <Input label="Question" value={q} onChangeText={setQ} maxLength={200} />
        {opts.map((o, i) => <Input key={i} label={`Answer ${i + 1}`} value={o} onChangeText={(v) => setOpts(opts.map((x, j) => (j === i ? v : x)))} maxLength={80} />)}
        {opts.length < 6 ? <Btn title="Add another answer" kind="ghost" onPress={() => setOpts([...opts, ''])} /> : null}
        <T muted>Where should it appear?</T>
        <Chips options={[{ value: 'home', label: 'Home page' }, { value: 'match', label: 'A match' }, { value: 'news', label: 'A news story' }]} value={where} onChange={(v) => { setWhere(v); setRef(null); }} />
        {where === 'match' ? <Chips options={(matches.data as any[]).map((m) => ({ value: m.id, label: `${m.opponents?.name} · ${new Date(m.kickoff_at).toLocaleDateString()}` }))} value={ref} onChange={setRef} /> : null}
        {where === 'news' ? <Chips options={(news.data as any[]).map((n) => ({ value: n.id, label: n.title.slice(0, 40) }))} value={ref} onChange={setRef} /> : null}
        <T muted>Closes</T><Chips options={CLOSE} value={close} onChange={setClose} />
        <T muted>Fans see results</T><Chips options={SHOW} value={show} onChange={setShow} />
        <Err msg={err} /><Btn title="Publish poll" disabled={busy} onPress={create} />
      </Card>
      {(polls.data as any[]).map((p) => { const open = pollOpen(p); const t = tally[p.id]; const opts2 = [...(p.poll_options ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order); return (
        <Card key={p.id}>
          <T style={{ fontWeight: '800' }}>{p.question}</T>
          <T muted>{p.match_id ? 'Match poll' : p.news_id ? 'Story poll' : 'Home page'} · {open ? (p.closes_at ? `open until ${fmtDate(p.closes_at)}` : 'open') : 'closed'}{p.is_published ? '' : ' · hidden'}</T>
          {t ? opts2.map((o: any) => <T key={o.id}>{o.label}: {t[o.id] ?? 0}</T>) : null}
          <View style={{ gap: 8 }}>
            <Btn title="Show results" kind="ghost" onPress={() => results(p.id)} />
            {open ? <Btn title="Close now" kind="ghost" onPress={() => patch(p.id, { closes_at: new Date().toISOString() })} /> : null}
            <Toggle label="Visible to fans" value={p.is_published} onChange={(v) => patch(p.id, { is_published: v })} />
            <Btn title="Delete" kind="danger" onPress={() => del(p.id)} />
          </View>
        </Card>); })}
    </Screen>
  );
}
