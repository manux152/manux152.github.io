import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Screen, H, T, Card, Btn, Input, Chips, Err } from '../../components/ui';
import { Pitch } from '../../components/Pitch';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../lib/app-context';

export default function FormationDesign() {
  const { can, session } = useApp();
  const router = useRouter();
  const [format, setFormat] = useState('11-a-side'); const [prompt, setPrompt] = useState(''); const [shape, setShape] = useState('');
  const [d, setD] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  if (!can('lineups.manage')) return <Screen><T>No permission.</T></Screen>;
  const set = (k: string, v: string) => setD({ ...d, [k]: v });

  const run = async () => {
    setErr(null); setBusy(true);
    const { data, error } = await supabase.functions.invoke('formation-ai', { body: { mode: 'design', format, prompt, formation: shape.trim() } });
    setBusy(false);
    if (error || data?.error) return setErr(data?.error ?? error?.message ?? 'Could not design a formation');
    setD(data);
  };
  const save = async () => {
    setErr(null);
    const { error } = await supabase.from('formations').insert({ name: d.name, format: d.format, positions: d.positions, description: d.description, how_to_use: d.how_to_use,
      strengths: d.strengths, weaknesses: d.weaknesses, is_custom: true, created_by: session?.user.id });
    if (error) return setErr(error.code === '23505' ? 'A formation with that name already exists for this format — change the name.' : error.message);
    router.replace('/formations');
  };
  return (
    <Screen><H>Design a formation</H>
      <T muted>Describe what you want — or type a shape like 4-2-3-1. The AI picks a suitable shape and explains it; the pitch positions are laid out automatically. Review and edit before saving.</T>
      <Chips options={['11-a-side', '9-a-side', '7-a-side'].map((v) => ({ value: v, label: v }))} value={format} onChange={(v) => v && setFormat(v)} />
      <Input label="What do you need? (e.g. defensive, with wing-backs, against a strong striker)" multiline value={prompt} onChangeText={setPrompt} />
      <Input label="Or a specific shape (optional)" autoCapitalize="none" value={shape} onChangeText={setShape} placeholder="e.g. 3-4-3" />
      <Err msg={err} />
      <Btn title={busy ? 'Designing…' : 'Design with AI'} onPress={run} disabled={busy} />
      {d && (<>
        <Card><Pitch positions={d.positions} width="75%" />{!d.ai && <T muted style={{ fontSize: 12 }}>AI wording is switched off, so the explanation is basic — edit it below.</T>}</Card>
        <Input label="Name" value={d.name} onChangeText={(v) => set('name', v)} />
        <Input label="What it is" multiline value={d.description ?? ''} onChangeText={(v) => set('description', v)} />
        <Input label="How to use it" multiline value={d.how_to_use ?? ''} onChangeText={(v) => set('how_to_use', v)} />
        <Input label="Strengths" multiline value={d.strengths ?? ''} onChangeText={(v) => set('strengths', v)} />
        <Input label="Weaknesses" multiline value={d.weaknesses ?? ''} onChangeText={(v) => set('weaknesses', v)} />
        <Btn title="Save formation" onPress={save} />
      </>)}
    </Screen>
  );
}
