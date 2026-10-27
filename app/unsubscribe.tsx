import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Screen, H, T, Card, Btn, Err } from '../components/ui';
import { supabase } from '../lib/supabase';

// Opened from the unsubscribe link at the bottom of every fan club email.
export default function Unsubscribe() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(false); const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setErr(null); setBusy(true);
    const { error } = await supabase.functions.invoke('fan-join', { body: { action: 'unsubscribe', token: typeof token === 'string' ? token : '' } });
    setBusy(false); if (error) return setErr(error.message); setDone(true);
  };
  return (
    <Screen>
      <H>{done ? 'You\'ve been unsubscribed' : 'Unsubscribe'}</H>
      {done ? <Card><T>You won't get any more fan club emails. You can rejoin any time from the Fan club page.</T></Card>
        : <><T muted>Stop getting fan club emails?</T><Err msg={err} /><Btn title={busy ? 'Working…' : 'Unsubscribe me'} onPress={go} disabled={busy || !token} /></>}
    </Screen>
  );
}
