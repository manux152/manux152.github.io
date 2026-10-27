import { useState } from 'react';
import { Screen, H, T, Card, Btn, Input, Chips, Toggle, Err } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../lib/app-context';

const PRESETS = [{ value: '0', label: 'Off' }, { value: '5', label: '5 min' }, { value: '10', label: '10 min' }, { value: '15', label: '15 min' }, { value: '30', label: '30 min' }, { value: '60', label: '1 hour' }];

// Admin → Security: automatic sign-out after inactivity, and emailed codes for sign-ins from new devices.
export default function Security() {
  const { can, settings, reload } = useApp();
  const [mins, setMins] = useState(String(settings.idle_logout_minutes ?? 10));
  const [otp, setOtp] = useState(settings.new_device_otp_enabled !== false && settings.new_device_otp_enabled !== 'false');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  if (!can('settings.manage')) return <Screen><T>No permission.</T></Screen>;

  const save = async () => {
    setErr(null); setMsg(null);
    const n = Number(mins.trim());
    if (!Number.isInteger(n) || n < 0 || n > 1440) return setErr('Enter a whole number of minutes between 1 and 1440, or 0 to turn auto sign-out off.');
    setBusy(true);
    const { error } = await supabase.from('site_settings').upsert([{ key: 'idle_logout_minutes', value: n }, { key: 'new_device_otp_enabled', value: otp }], { onConflict: 'key' });
    setBusy(false); if (error) return setErr(error.message);
    await reload(); setMsg(n ? `Saved. People are signed out after ${n} minute${n === 1 ? '' : 's'} without activity.` : 'Saved. Auto sign-out is off.');
  };
  const forgetAll = async () => {
    if (!confirm) { setConfirm(true); return; }
    setErr(null); setMsg(null); setBusy(true); setConfirm(false);
    const { data, error } = await supabase.rpc('forget_all_trusted_devices');
    setBusy(false); if (error) return setErr(error.message);
    setMsg(`Done. ${data ?? 0} remembered device${data === 1 ? '' : 's'} cleared. Everyone gets a new code at their next sign-in.`);
  };

  return (
    <Screen>
      <H>Security</H>
      <Card>
        <T style={{ fontWeight: '800' }}>Auto sign-out after inactivity</T>
        <T muted style={{ fontSize: 13 }}>Signs people out when they haven't tapped, typed or scrolled for this long. They see a 1-minute warning first. Applies to everyone on the website and app. 0 turns it off.</T>
        <Chips options={PRESETS} value={PRESETS.some((p) => p.value === mins.trim()) ? mins.trim() : null} onChange={(v) => { if (v) { setMins(v); setMsg(null); } }} />
        <Input label="Minutes of inactivity (1–1440, or 0 for off)" keyboardType="number-pad" value={mins} onChangeText={(v) => { setMins(v.replace(/[^0-9]/g, '')); setMsg(null); }} />
      </Card>
      <Card>
        <T style={{ fontWeight: '800' }}>Code for new devices</T>
        <Toggle label="Email a 6-digit code when someone signs in from a device we don't recognise" hint="Once a code is entered, that browser or phone is remembered. Needs emails set up in Admin → Email design." value={otp} onChange={(v) => { setOtp(v); setMsg(null); }} />
        <T muted style={{ fontSize: 12 }}>Applies to email-and-password sign-ins. Face ID / fingerprint sign-in and sessions that are already signed in are not affected.</T>
      </Card>
      <Err msg={err} />{msg ? <T>{msg}</T> : null}
      <Btn title={busy ? 'Saving…' : 'Save security settings'} onPress={save} disabled={busy} />
      <Card>
        <T style={{ fontWeight: '800' }}>Make everyone verify again</T>
        <T muted style={{ fontSize: 13 }}>Forgets every remembered device, so each person gets a new code at their next sign-in. People who are signed in now stay signed in.</T>
        <Btn title={confirm ? 'Tap again to confirm' : 'Forget all remembered devices'} kind="danger" onPress={forgetAll} disabled={busy} />
      </Card>
    </Screen>
  );
}
