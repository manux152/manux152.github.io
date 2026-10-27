import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Screen, H, T, Card, Btn, Err } from '../components/ui';
import { supabase } from '../lib/supabase';

// Opened from the confirmation email. Needs a tap (not automatic) so email scanners can't confirm for someone.
export default function FanConfirm() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(false); const [err, setErr] = useState<string | null>(null);
  const confirm = async () => {
    setErr(null); setBusy(true);
    const { error } = await supabase.functions.invoke('fan-join', { body: { action: 'confirm', token: typeof token === 'string' ? token : '' } });
    setBusy(false); if (error) return setErr(error.message); setDone(true);
  };
  return (
    <Screen>
      <H>{done ? 'You\'re in! 🎉' : 'Confirm your email'}</H>
      {done ? <Card><T>Thanks for joining the fan club. Look out for our next newsletter.</T></Card>
        : <><T muted>One last tap to finish joining the fan club.</T><Err msg={err} /><Btn title={busy ? 'Confirming…' : 'Yes, count me in'} onPress={confirm} disabled={busy || !token} /></>}
    </Screen>
  );
}
