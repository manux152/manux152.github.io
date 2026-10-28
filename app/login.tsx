import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, H, T, Card, Input, Btn, Err } from '../components/ui';
import { supabase, REVOKED_KEY } from '../lib/supabase';
import { IDLE_KEY, isDeviceTrusted, sendLoginCode, setDevicePending, verifyLoginCode } from '../lib/device';
import { useApp } from '../lib/app-context';
import { passkeysSupported, passkeyError } from '../lib/passkey';
import { appUrl } from '../lib/redirect';
import { PasswordChecklist } from '../components/PasswordChecklist';
import { checkPassword, PASSWORD_ERROR } from '../lib/password';
import { SignupTerms, type SignupLegal } from '../components/SignupTerms';
import { deviceInfo, getDeviceId } from '../lib/consent';

const REVOKED_MSG = 'This account has been deactivated or deleted, so you have been signed out. Contact the club if you think this is a mistake.';

export default function Login() {
  const r = useRouter(); const params = useLocalSearchParams<{ ref?: string }>();
  const { settings, reload } = useApp();
  const [mode, setMode] = useState<'in' | 'up' | 'mfa' | 'device'>(typeof params.ref === 'string' && params.ref ? 'up' : 'in');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [name, setName] = useState(''); const [code, setCode] = useState('');
  const [refCode, setRefCode] = useState(typeof params.ref === 'string' ? params.ref.toUpperCase().slice(0, 12) : '');
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [legal, setLegal] = useState<SignupLegal>({ ready: false, docs: [] });
  const [devCode, setDevCode] = useState('');
  const [factorId, setFactorId] = useState(''); const [otp, setOtp] = useState('');
  const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const domains: string[] = Array.isArray(settings.allowed_email_domains) ? settings.allowed_email_domains : [];

  useEffect(() => { AsyncStorage.getItem(REVOKED_KEY).then((v) => { if (v) { AsyncStorage.removeItem(REVOKED_KEY); setErr(REVOKED_MSG); } }).catch(() => {}); }, []);
  useEffect(() => { AsyncStorage.getItem(IDLE_KEY).then((v) => { if (v) { AsyncStorage.removeItem(IDLE_KEY); setMsg(`You were signed out after ${v} minutes of inactivity. Please sign in again.`); } }).catch(() => {}); }, []);
  const signIn = async () => {
    setBusy(true); setErr(null); setMsg(null);
    await setDevicePending(true);   // hold the session back until we know this device is recognised
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) { await setDevicePending(false); setBusy(false); setErr(/banned|deactivated/i.test(error.message) ? REVOKED_MSG : error.message); if (/not confirmed/i.test(error.message)) setNeedsConfirm(true); return; }
    if (!(await isDeviceTrusted())) { setBusy(false); setDevCode(''); setMode('device'); await sendCode(); return; }   // new device: email a one-time code first
    await setDevicePending(false); await reload();
    await finishSignIn();
  };
  const sendCode = async () => {
    setErr(null); setMsg(null); setBusy(true);
    const e = await sendLoginCode(); setBusy(false);
    if (e) return setErr(e);
    setMsg('We emailed you a 6-digit code. It works for 10 minutes. Check your spam folder too.');
  };
  const verifyDevice = async () => {
    setErr(null); setBusy(true);
    const res = await verifyLoginCode(devCode);
    if (!res.ok) { setBusy(false); return setErr(res.message); }
    await setDevicePending(false); await reload();
    await finishSignIn();
  };
  const cancelDevice = async () => { await supabase.auth.signOut({ scope: 'local' }); await setDevicePending(false); setMode('in'); setPassword(''); setDevCode(''); setErr(null); setMsg(null); };
  // After a password OR biometric sign-in: if this person also turned on 2FA, ask for the 6-digit code before letting them in
  const finishSignIn = async () => {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
      const { data: f } = await supabase.auth.mfa.listFactors();
      const id = f?.totp?.find((x) => x.status === 'verified')?.id;
      if (id) { setBusy(false); setFactorId(id); setOtp(''); setMode('mfa'); return; }
    }
    setBusy(false); r.replace('/');
  };
  const passkeySignIn = async () => {
    setErr(null); setBusy(true);
    try { const { error } = await (supabase.auth as any).signInWithPasskey(); if (error) throw error; await finishSignIn(); }
    catch (e: any) { setBusy(false); setErr(/banned|deactivated/i.test(String(e?.message)) ? REVOKED_MSG : passkeyError(e)); }
  };
  const verifyOtp = async () => {
    setErr(null); setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: otp.replace(/\s/g, '') });
    setBusy(false);
    if (error) return setErr(/invalid|expired/i.test(error.message) ? 'That code is not right. Use the newest code from your authenticator app.' : error.message);
    r.replace('/');
  };
  const cancelMfa = async () => { await supabase.auth.signOut({ scope: 'local' }); setMode('in'); setPassword(''); setOtp(''); setErr(null); };
  const forgot = async () => {
    setErr(null); setMsg(null);
    if (!email.trim()) return setErr('Enter your email above first.');
    setBusy(true);
    // Sent by our own function so the email always uses the club's template and design.
    const { error } = await supabase.functions.invoke('password-reset', { body: { email: email.trim() } });
    setBusy(false);
    if (error) return setErr(error.message);
    setMsg('If an account exists for that email, we\'ve sent a reset link. Check your spam folder too.');
  };
  const resendConfirm = async () => {
    setErr(null); setMsg(null);
    if (!email.trim()) return setErr('Enter your email above first.');
    setBusy(true);
    const { error } = await supabase.functions.invoke('signup', { body: { action: 'resend', email: email.trim() } });
    setBusy(false);
    if (error) return setErr(error.message);
    setMsg('If that account still needs confirming, we\'ve sent a new link. Use the newest email.');
  };
  const signUp = async () => {
    setErr(null); setMsg(null);
    if (!name.trim()) return setErr('Please enter your full name.');
    if (!email.trim()) return setErr('Please enter your email address.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErr('Enter a valid email address.');
    if (!password) return setErr('Please choose a password.');
    if (!checkPassword(password).valid) return setErr(PASSWORD_ERROR);
    if (!legal.ready) return setErr('Please read the Terms of Use and Privacy Policy, then tick both boxes to create your account.');
    setBusy(true);
    const { data: check } = await supabase.rpc('check_signup', { p_email: email.trim(), p_code: code });
    if (check === 'code') { setBusy(false); return setErr('That team code is not valid, has already been used, has expired, or is for a different email.'); }
    if (check === 'domain') { setBusy(false); return setErr(`Please use your team email address${domains.length ? ` (${domains.map((d) => '@' + d).join(', ')})` : ''}.`); }
    // Created by our own function so the confirmation email always uses the club's template.
    const { error } = await supabase.functions.invoke('signup', { body: { email: email.trim(), password, full_name: name.trim(), team_code: code.trim(), referral_code: refCode.trim(), legal: { device_id: await getDeviceId(), docs: legal.docs, ...deviceInfo() } } });
    setBusy(false);
    if (error) return setErr(error.message);
    setMsg('Account created. We\'ve emailed you a confirmation link. Open it, then sign in. Check your spam folder too.'); setMode('in'); setNeedsConfirm(true);
  };

  if (mode === 'device') return (
    <Screen>
      <H>Verify this device</H>
      <Card><T muted>You're signing in from a device we don't recognise. For your security we sent a 6-digit code to {email.trim()}. Enter it below and we'll remember this device.</T></Card>
      <Input label="6-digit code" keyboardType="number-pad" maxLength={7} autoComplete="one-time-code" autoFocus value={devCode} onChangeText={setDevCode} onSubmitEditing={verifyDevice} />
      <Err msg={err} />{msg ? <T>{msg}</T> : null}
      <Btn title="Verify and sign in" onPress={verifyDevice} disabled={busy || devCode.replace(/\s/g, '').length < 6} />
      <Btn title="Send a new code" kind="ghost" onPress={sendCode} disabled={busy} />
      <Btn title="Cancel" kind="ghost" onPress={cancelDevice} />
    </Screen>
  );

  if (mode === 'mfa') return (
    <Screen>
      <H>Enter your 6-digit code</H>
      <Card><T muted>Open your authenticator app and type the code shown for Super Strikers. Lost your phone? Ask a club admin to reset your 2FA.</T></Card>
      <Input label="6-digit code" keyboardType="number-pad" maxLength={7} autoComplete="one-time-code" autoFocus value={otp} onChangeText={setOtp} onSubmitEditing={verifyOtp} />
      <Err msg={err} />
      <Btn title="Verify and sign in" onPress={verifyOtp} disabled={busy || otp.replace(/\s/g, '').length < 6} />
      <Btn title="Cancel" kind="ghost" onPress={cancelMfa} />
    </Screen>
  );

  return (
    <Screen>
      <H>{mode === 'in' ? 'Sign in' : 'Create your player account'}</H>
      {mode === 'up' && (
        <Card><T muted>Player accounts need the team email address{domains.length ? ` (${domains.map((d) => '@' + d).join(', ')})` : ''} and a one-time team code from the club.
          Not on the team yet? Check the Tryouts section.</T></Card>
      )}
      {mode === 'up' && <Input label="Full name" required autoComplete="name" textContentType="name" value={name} onChangeText={setName} />}
      <Input label="Email" required={mode === 'up'} autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <Input label="Password" required={mode === 'up'} secureTextEntry value={password} onChangeText={setPassword} />
      {mode === 'up' && <PasswordChecklist password={password} />}
      {mode === 'up' && <Input label="Team code" autoCapitalize="characters" autoCorrect={false} value={code} onChangeText={setCode} placeholder="e.g. SS-ABCD-EFGH" />}
      {mode === 'up' && settings.referral_enabled !== false && <Input label="Friend's invite code (optional)" autoCapitalize="characters" autoCorrect={false} value={refCode} onChangeText={setRefCode} />}
      {mode === 'up' && <SignupTerms onChange={setLegal} />}
      <Err msg={err} />{msg ? <T>{msg}</T> : null}
      {mode === 'in'
        ? <><Btn title="Sign in" onPress={signIn} disabled={busy} />{passkeysSupported() ? <Btn title="Sign in with Face ID / fingerprint" kind="ghost" onPress={passkeySignIn} disabled={busy} /> : null}<Btn title="I have a team code — create account" kind="ghost" onPress={() => { setMode('up'); setErr(null); }} />{needsConfirm ? <Btn title="Resend confirmation email" kind="ghost" onPress={resendConfirm} disabled={busy} /> : null}<Btn title="Forgot password?" kind="ghost" onPress={forgot} /><Btn title="See tryouts" kind="ghost" onPress={() => r.push('/tryouts')} /></>
        : <><Btn title="Create account" onPress={signUp} disabled={busy} /><Btn title="Back to sign in" kind="ghost" onPress={() => { setMode('in'); setErr(null); }} /></>}
    </Screen>
  );
}
