import { forwardRef, useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { TrText as Text } from './TrText';
import { useApp } from '../lib/app-context';
import { matchTitle } from '../lib/matchday';
import { useColor } from './ui';

type Props = { variant: 'result' | 'fixture' | 'lineup'; match: any; scorers?: string[]; starters?: { name: string; number?: number | null }[]; formation?: string | null };


// The picture is captured from the screen, and the capture drops pictures that are still web links.
// So each logo is fetched first and drawn from its own data, which always makes it into the shared image.
// Big logo files shrunk in one jump look jagged. On the web we shrink them in smooth half-steps to a size that suits the card.
async function smoothScale(blob: Blob, max: number): Promise<string | null> {
  const g: any = globalThis;
  if (typeof g.document === 'undefined' || !g.URL?.createObjectURL) return null;
  const href = g.URL.createObjectURL(blob);
  try {
    const img: any = await new Promise((res, rej) => { const i = new g.Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('img')); i.src = href; });
    const w: number = img.naturalWidth, h: number = img.naturalHeight; if (!w || !h) return null;
    const k = Math.min(1, max / Math.max(w, h)); const tw = Math.max(1, Math.round(w * k)), th = Math.max(1, Math.round(h * k));
    const draw = (from: any, tw2: number, th2: number) => { const c = g.document.createElement('canvas'); c.width = tw2; c.height = th2; const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(from, 0, 0, tw2, th2); return c; };
    let cur: any = img, cw = w, ch = h;
    while (cw / 2 > tw) { cw = Math.round(cw / 2); ch = Math.round(ch / 2); cur = draw(cur, cw, ch); }
    return draw(cur, tw, th).toDataURL('image/png');
  } catch { return null; } finally { g.URL.revokeObjectURL(href); }
}

function useInlineImage(url: string | null) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let off = false; setSrc(null);
    if (!url) return;
    (async () => {
      try {
        const blob = await (await fetch(url)).blob();
        const data = (await smoothScale(blob, 384)) ?? await new Promise<string>((res, rej) => { const f = new FileReader(); f.onload = () => res(String(f.result)); f.onerror = () => rej(new Error('read')); f.readAsDataURL(blob); });
        if (!off) setSrc(data);
      } catch { if (!off) setSrc(url); }
    })();
    return () => { off = true; };
  }, [url]);
  return src;
}

function Crest({ src, name, size }: { src: string | null; name: string; size: number }) {
  if (src) return <Image source={{ uri: src }} style={{ width: size, height: size }} resizeMode="contain" />;
  return <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: size * 0.4 }}>{(name || '?').trim().charAt(0).toUpperCase()}</Text></View>;
}

/** A 4:5 picture designed for Instagram / WhatsApp status. Colours and logo come from Admin → Logo & branding. */
export const ShareCard = forwardRef<View, Props>(({ variant, match, scorers = [], starters = [], formation }, ref) => {
  const { settings } = useApp(); const c = useColor();
  const team = typeof settings.team_name === 'string' ? settings.team_name : 'Super Strikers';
  const logoUrl = typeof settings.logo_url === 'string' && settings.logo_url ? settings.logo_url : null;
  const logo = useInlineImage(logoUrl);
  const themName = match.opponents?.name || 'Opponent';
  const them = useInlineImage(match.opponents?.logo_url || null);
  const crests = variant !== 'lineup';
  const when = new Date(match.kickoff_at);
  const date = when.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const time = when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const gf = match.goals_for ?? 0, ga = match.goals_against ?? 0;
  const verdict = gf > ga ? 'VICTORY' : gf < ga ? 'FULL TIME' : 'DRAW';
  const white = '#FFFFFF';
  return (
    <View ref={ref} collapsable={false} style={{ width: 320, height: 400, backgroundColor: c, padding: 22, justifyContent: 'space-between' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {!crests && logo ? <Image source={{ uri: logo }} style={{ width: 40, height: 40 }} resizeMode="contain" /> : null}
        <Text style={{ color: white, fontWeight: '800', fontSize: 16, flex: 1 }} numberOfLines={1}>{team}</Text>
      </View>
      <View style={{ alignItems: 'center', gap: 6 }}>
        {crests ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
            <Crest src={logo} name={team} size={56} />
            <Text style={{ color: white, opacity: 0.85, fontWeight: '800', fontSize: 14 }}>{match.is_home === false ? '@' : 'VS'}</Text>
            <Crest src={them} name={themName} size={56} />
          </View>
        ) : logo ? <Crest src={logo} name={team} size={56} /> : null}
        <Text style={{ color: white, opacity: 0.85, fontWeight: '700', letterSpacing: 2, fontSize: 13 }}>
          {variant === 'result' ? verdict : variant === 'lineup' ? 'STARTING XI' : 'MATCH DAY'}
        </Text>
        {variant === 'result' ? <Text style={{ color: white, fontWeight: '900', fontSize: 64 }}>{gf} – {ga}</Text> : null}
        <Text style={{ color: white, fontWeight: '800', fontSize: variant === 'result' ? 20 : 28, textAlign: 'center' }} numberOfLines={2}>
          {matchTitle(match, team)}
        </Text>
        {variant === 'result' && scorers.length ? <Text style={{ color: white, opacity: 0.9, textAlign: 'center', fontSize: 14 }} numberOfLines={3}>⚽ {scorers.join(' · ')}</Text> : null}
        {variant === 'fixture' ? <Text style={{ color: white, fontWeight: '700', fontSize: 18 }}>{time}</Text> : null}
        {variant === 'lineup' ? (
          <View style={{ gap: 2, alignItems: 'center' }}>
            {formation ? <Text style={{ color: white, opacity: 0.85, fontSize: 13 }}>{formation}</Text> : null}
            <Text style={{ color: white, fontWeight: '700', fontSize: 14, textAlign: 'center', lineHeight: 20 }}>{starters.slice(0, 11).map((p) => `${p.number != null ? p.number + ' ' : ''}${p.name}`).join('\n')}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ gap: 2 }}>
        <Text style={{ color: white, fontWeight: '700', fontSize: 14 }}>{date}</Text>
        <Text style={{ color: white, opacity: 0.85, fontSize: 13 }} numberOfLines={1}>{[match.venue, match.competition].filter(Boolean).join(' · ')}</Text>
      </View>
    </View>
  );
});
ShareCard.displayName = 'ShareCard';
