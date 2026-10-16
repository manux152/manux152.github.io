import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, H, T, Card, Btn, Input, Chips, Err, Loading } from '../../../components/ui';
import { PictureList, Picture } from '../../../components/PictureList';
import { TagPicker } from '../../../components/TagPicker';
import { Person, fetchTagsForEditor, saveTags } from '../../../lib/tags';
import { supabase } from '../../../lib/supabase';
import { useApp } from '../../../lib/app-context';
import { DateTimeField } from '../../../components/DateTimeField';

const TONES = [{ value: 'professional', label: 'Professional' }, { value: 'enthusiastic', label: 'Enthusiastic' }, { value: 'friendly', label: 'Friendly' }];
const LENGTHS = [{ value: 'short', label: 'Short' }, { value: 'medium', label: 'Medium' }, { value: 'long', label: 'Long' }];
const slugify = (t: string) => t.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'story';
const randSuffix = () => Math.random().toString(36).slice(2, 6);

type Idea = { kind: string; ref_id: string | null; label: string; hint: string };

export default function NewsEditor() {
  const { id, ai } = useLocalSearchParams<{ id: string; ai?: string }>();
  const isNew = id === 'new'; const router = useRouter(); const { can, session } = useApp();
  const [loaded, setLoaded] = useState(isNew);
  const [f, setF] = useState({ title: '', slug: '', summary: '', body: '', category: '', is_featured: false, comments_enabled: true });
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [pics, setPics] = useState<Picture[]>([]); const [cover, setCover] = useState<string | null>(null);
  const [when, setWhen] = useState<'draft' | 'now' | 'schedule'>('draft'); const [at, setAt] = useState('');
  const [tagged, setTagged] = useState<Person[]>([]);
  const [aiMeta, setAiMeta] = useState<{ gen: boolean; source: string | null }>({ gen: false, source: null });
  // AI panel
  const [showAi, setShowAi] = useState(ai === '1'); const [ideas, setIdeas] = useState<Idea[] | null>(null); const [custom, setCustom] = useState('');
  const [tone, setTone] = useState('professional'); const [length, setLength] = useState('medium'); const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    fetchTagsForEditor('news', String(id)).then(setTagged).catch(() => {});
    supabase.from('news_posts').select('*').eq('id', id).maybeSingle().then(({ data }) => {
      if (data) {
        setF({ title: data.title, slug: data.slug, summary: data.summary ?? '', body: data.body, category: data.category ?? '', is_featured: !!data.is_featured, comments_enabled: data.comments_enabled !== false });
        const g: Picture[] = Array.isArray(data.gallery) ? data.gallery : [];
        const list = data.cover_url && !g.some((p) => p.url === data.cover_url) ? [{ url: data.cover_url, caption: '' }, ...g] : g;
        setPics(list); setCover(data.cover_url ?? list[0]?.url ?? null);
        setWhen(!data.published_at ? 'draft' : new Date(data.published_at) <= new Date() ? 'now' : 'schedule'); setAt(data.published_at && new Date(data.published_at) > new Date() ? data.published_at : '');
        setAiMeta({ gen: !!data.ai_generated, source: data.ai_source ?? null });
      }
      setLoaded(true);
    });
  }, [id, isNew]);
  useEffect(() => {
    if (!showAi || ideas || !can('news.manage')) return;
    supabase.functions.invoke('news-ai', { body: { mode: 'sources' } }).then(({ data, error }) => {
      if (error || data?.error) setErr(data?.error ?? error?.message ?? 'Could not load story ideas'); else setIdeas(data.ideas ?? []);
    });
  }, [showAi]); // eslint-disable-line
  if (!can('news.manage')) return <Screen><T>No permission.</T></Screen>;
  if (!loaded) return <Loading />;
  const set = (k: string, v: any) => setF((c) => ({ ...c, [k]: v }));

  const fill = (d: any, source: string | null) => {
    setF((c) => ({ ...c, title: d.title ?? c.title, summary: d.summary ?? c.summary, body: d.body ?? c.body, category: d.category ?? c.category, slug: slugTouched ? c.slug : slugify(d.title ?? c.title) }));
    setAiMeta({ gen: true, source }); setMsg('Draft ready. Read it, fix anything that is not right, add pictures, then save.');
  };
  const generate = async (kind: string, ref: string | null, topic?: string) => {
    setErr(null); setMsg(null); setBusy(true);
    const { data, error } = await supabase.functions.invoke('news-ai', { body: { mode: 'generate', kind, ref_id: ref, tone, length, notes: notes.trim() || undefined, topic } });
    setBusy(false);
    if (error || data?.error) return setErr(data?.error ?? error?.message ?? 'Could not write a draft');
    fill(data, `${kind}${ref ? ':' + ref : ''}`);
    if (!data.ai) setMsg('Draft built from your data. AI wording is switched off, so the text is plain — edit it before publishing.');
  };
  const polish = async () => {
    setErr(null); setMsg(null); if (f.body.trim().length < 20) return setErr('Write some text first.');
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('news-ai', { body: { mode: 'polish', title: f.title, body: f.body, tone } });
    setBusy(false);
    if (error || data?.error) return setErr(data?.error ?? error?.message ?? 'Could not polish the text');
    setF((c) => ({ ...c, title: data.title || c.title, summary: data.summary || c.summary, body: data.body || c.body })); setMsg(data.ai ? 'Text polished. Check it still says what you mean.' : 'AI wording is switched off, so nothing was changed.');
  };

  const save = async () => {
    setErr(null); setMsg(null);
    if (!f.title.trim()) return setErr('Add a title.'); if (!f.body.trim()) return setErr('Add the story text.');
    let published_at: string | null = null;
    if (when === 'now') published_at = new Date().toISOString();
    if (when === 'schedule') { const d = new Date(at); if (!at || isNaN(d.getTime())) return setErr('Choose the publish date and time.'); published_at = d.toISOString(); }
    setBusy(true);
    const row: any = { title: f.title.trim(), slug: (f.slug.trim() || slugify(f.title)), summary: f.summary.trim() || null, body: f.body.trim(), category: f.category.trim() || null, is_featured: f.is_featured, comments_enabled: f.comments_enabled,
      cover_url: cover ?? pics[0]?.url ?? null, gallery: pics.map((p) => ({ url: p.url, caption: (p.caption ?? '').trim() })), published_at, ai_generated: aiMeta.gen, ai_source: aiMeta.source };
    let res = isNew ? await supabase.from('news_posts').insert({ ...row, author_id: session?.user.id }).select('id').single() : await supabase.from('news_posts').update(row).eq('id', id).select('id').single();
    if (res.error?.code === '23505') { row.slug = `${row.slug}-${randSuffix()}`; set('slug', row.slug); res = isNew ? await supabase.from('news_posts').insert({ ...row, author_id: session?.user.id }).select('id').single() : await supabase.from('news_posts').update(row).eq('id', id).select('id').single(); }
    if (res.error) { setBusy(false); return setErr(res.error.message); }
    try { await saveTags('news', (res.data as any).id, tagged, session?.user.id); } catch (e: any) { setBusy(false); return setErr(`Story saved, but tags were not: ${e.message}`); }
    setBusy(false);
    if (isNew) router.replace(`/admin/news/${res.data.id}` as any); else setMsg(when === 'draft' ? 'Saved as a draft.' : when === 'now' ? 'Saved and published.' : 'Saved and scheduled.');
  };
  const del = async () => { const { error } = await supabase.from('news_posts').delete().eq('id', id); if (error) return setErr(error.message); router.replace('/admin/news' as any); };

  return (
    <Screen>
      <H>{isNew ? 'New story' : 'Edit story'}</H>
      <Btn title={showAi ? 'Hide AI writer' : '✨ Write with AI'} kind="ghost" onPress={() => setShowAi(!showAi)} />
      {showAi && (
        <Card style={{ borderColor: '#2F7FD8' }}>
          <T style={{ fontWeight: '800' }}>AI writer</T>
          <T muted>Pick a story idea built from your results, awards, tryouts and shop. The AI only uses facts from your system and never invents scores or quotes. You always review before publishing.</T>
          <T muted>Tone</T><Chips options={TONES} value={tone} onChange={(v) => v && setTone(v)} />
          <T muted>Length</T><Chips options={LENGTHS} value={length} onChange={(v) => v && setLength(v)} />
          <Input label="Anything to add? (optional — e.g. thank the volunteers)" multiline value={notes} onChangeText={setNotes} />
          {!ideas && !err ? <Loading /> : null}
          {(ideas ?? []).length === 0 && ideas ? <T muted>No story ideas yet. Add match results, awards or tryouts first, or write about a topic below.</T> : null}
          {(ideas ?? []).map((i) => (
            <Card key={`${i.kind}:${i.ref_id}`}>
              <T style={{ fontWeight: '700' }}>{i.label}</T><T muted style={{ fontSize: 12 }}>{i.hint}</T>
              <Btn title={busy ? 'Writing…' : 'Write this story'} onPress={() => generate(i.kind, i.ref_id)} disabled={busy} />
            </Card>
          ))}
          <Input label="Or write about your own topic" multiline value={custom} onChangeText={setCustom} placeholder="e.g. Thank our volunteers for the training-ground clean-up" />
          <Btn title={busy ? 'Writing…' : 'Write about this topic'} kind="ghost" onPress={() => generate('custom', null, custom)} disabled={busy || custom.trim().length < 5} />
        </Card>
      )}
      <Input label="Title *" value={f.title} onChangeText={(v) => { set('title', v); if (!slugTouched) set('slug', slugify(v)); }} />
      <Input label="Web address ending (slug)" autoCapitalize="none" value={f.slug} onChangeText={(v) => { setSlugTouched(true); set('slug', slugify(v)); }} />
      <Input label="Category (e.g. Match report, Club news)" value={f.category} onChangeText={(v) => set('category', v)} />
      <Input label="Short summary (shown in the news list)" multiline value={f.summary} onChangeText={(v) => set('summary', v)} />
      <Input label="Story *" multiline value={f.body} onChangeText={(v) => set('body', v)} style={{ minHeight: 220 }} />
      <Btn title={busy ? 'Working…' : '✨ Polish my text with AI'} kind="ghost" onPress={polish} disabled={busy} />
      <Card><TagPicker value={tagged} onChange={(t) => { setTagged(t); setMsg(null); }} suggestFrom={`${f.title}\n${f.summary}\n${f.body}`} /></Card>
      <PictureList pictures={pics} cover={cover} onChange={(p, c) => { setPics(p); setCover(c); }} />
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><T style={{ fontWeight: '700' }}>Featured story</T><Switch value={f.is_featured} onValueChange={(v) => set('is_featured', v)} /></View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><T style={{ fontWeight: '700' }}>Allow comments on this story</T><Switch value={f.comments_enabled} onValueChange={(v) => set('comments_enabled', v)} /></View>
        <T muted>Publishing</T>
        <Chips options={[{ value: 'draft', label: 'Keep as draft' }, { value: 'now', label: 'Publish now' }, { value: 'schedule', label: 'Schedule' }]} value={when} onChange={(v) => v && setWhen(v as any)} />
        {when === 'schedule' ? <DateTimeField label="Publish at" value={at || null} onChange={(v) => setAt(v ?? '')} /> : null}
        <T muted style={{ fontSize: 12 }}>Publishing sends the “news published” notification set up in Notification rules.</T>
      </Card>
      <Err msg={err} />{msg ? <T style={{ fontWeight: '700' }}>{msg}</T> : null}
      <Btn title={busy ? 'Saving…' : 'Save story'} onPress={save} disabled={busy} />
      {!isNew && <Btn title="Delete story" kind="danger" onPress={del} />}
      <Btn title="Back to news" kind="ghost" onPress={() => router.replace('/admin/news' as any)} />
    </Screen>
  );
}
