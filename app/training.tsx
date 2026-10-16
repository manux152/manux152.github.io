import { useState } from 'react';
import { Screen, H, T, Card, Btn, Input, Loading, Err, fmtDate } from '../components/ui';
import { supabase } from '../lib/supabase';
import { useApp } from '../lib/app-context';
import { useTable } from '../lib/useQuery';

export default function Training() {
  const { session } = useApp();
  const [code, setCode] = useState<Record<string, string>>({}); const [res, setRes] = useState<Record<string, string>>({});
  const me = useTable('players', (q) => (session ? q.eq('profile_id', session.user.id).limit(1) : q.limit(0)), [session?.user.id]);
  const { data, loading, error } = useTable('training_sessions', (q) => q.order('session_date', { ascending: false }).limit(40));
  if (loading) return <Loading />;
  const now = Date.now(); const isPlayer = me.data.length > 0;
  const openNow = (s: any) => now >= new Date(s.session_date).getTime() - 3600e3 && now <= new Date(s.session_date).getTime() + 4 * 3600e3;
  const checkIn = async (sid: string) => {
    const { data: r, error: e } = await supabase.rpc('check_in_training', { p_session: sid, p_code: (code[sid] ?? '').trim() });
    setRes((c) => ({ ...c, [sid]: e ? e.message : r === 'late' ? 'Checked in — marked late.' : 'Checked in ✅' }));
  };
  return (
    <Screen><H>Training</H><Err msg={error} />
      {data.length === 0 && <T muted>No training notes shared yet.</T>}
      {(data as any[]).map((s) => (
        <Card key={s.id}>
          <T style={{ fontWeight: '800', fontSize: 17 }}>{s.title}</T>
          <T muted>{fmtDate(s.session_date)}{s.visibility === 'staff' ? ' · staff only' : ''}</T>
          {s.focus ? <T><T style={{ fontWeight: '700' }}>Focus: </T>{s.focus}</T> : null}
          {s.plan ? <T>{s.plan}</T> : null}
          {s.notes ? <T muted>{s.notes}</T> : null}
          {isPlayer && openNow(s) && (<>
            <Input label="Check-in code from your coach" keyboardType="numeric" value={code[s.id] ?? ''} onChangeText={(v) => setCode((c) => ({ ...c, [s.id]: v }))} />
            <Btn title="Check in" onPress={() => checkIn(s.id)} />
            {res[s.id] ? <T style={{ fontWeight: '700' }}>{res[s.id]}</T> : null}
          </>)}
        </Card>
      ))}
    </Screen>
  );
}
