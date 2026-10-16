import { forwardRef } from 'react';
import { View } from 'react-native';
import { TrText as Text } from './TrText';
import { Image } from 'expo-image';
import { useApp } from '../lib/app-context';
import { matchTitle } from '../lib/matchday';
import { useColor } from './ui';

type Props = { variant: 'result' | 'fixture' | 'lineup'; match: any; scorers?: string[]; starters?: { name: string; number?: number | null }[]; formation?: string | null };

/** A 4:5 picture designed for Instagram / WhatsApp status. Colours and logo come from Admin → Logo & branding. */
export const ShareCard = forwardRef<View, Props>(({ variant, match, scorers = [], starters = [], formation }, ref) => {
  const { settings } = useApp(); const c = useColor();
  const team = typeof settings.team_name === 'string' ? settings.team_name : 'Super Strikers';
  const logo = typeof settings.logo_url === 'string' ? settings.logo_url : null;
  const when = new Date(match.kickoff_at);
  const date = when.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const time = when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const gf = match.goals_for ?? 0, ga = match.goals_against ?? 0;
  const verdict = gf > ga ? 'VICTORY' : gf < ga ? 'FULL TIME' : 'DRAW';
  const white = '#FFFFFF';
  return (
    <View ref={ref} collapsable={false} style={{ width: 320, height: 400, backgroundColor: c, padding: 22, justifyContent: 'space-between' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {logo ? <Image source={{ uri: logo }} style={{ width: 40, height: 40 }} contentFit="contain" /> : null}
        <Text style={{ color: white, fontWeight: '800', fontSize: 16, flex: 1 }} numberOfLines={1}>{team}</Text>
      </View>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Text style={{ color: white, opacity: 0.85, fontWeight: '700', letterSpacing: 2, fontSize: 13 }}>
          {variant === 'result' ? verdict : variant === 'lineup' ? 'STARTING XI' : 'MATCH DAY'}
        </Text>
        {variant === 'result' ? <Text style={{ color: white, fontWeight: '900', fontSize: 64 }}>{gf} – {ga}</Text> : null}
        <Text style={{ color: white, fontWeight: '800', fontSize: variant === 'result' ? 20 : 28, textAlign: 'center' }} numberOfLines={2}>
          {matchTitle(match, team)}
        </Text>
        {variant === 'result' && scorers.length ? <Text style={{ color: white, opacity: 0.9, textAlign: 'center', fontSize: 14 }} numberOfLines={4}>⚽ {scorers.join(' · ')}</Text> : null}
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
