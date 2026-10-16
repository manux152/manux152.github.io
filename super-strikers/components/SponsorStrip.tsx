import { T, Card } from './ui';
import { useApp } from '../lib/app-context';
import type { Placement } from '../lib/clubops';
import { SponsorSlider } from './SponsorSlider';

/** "Proudly supported by…" — a slide show of the sponsors switched on for this place, within their contract dates. Views and clicks are counted for the sponsor report. */
export function SponsorStrip({ placement, title = 'Proudly supported by' }: { placement: Exclude<Placement, 'footer'>; title?: string }) {
  const { sponsors } = useApp();
  const list = sponsors.filter((s) => (placement === 'home' ? s.show_home : s.show_match));
  if (!list.length) return null;
  return (
    <Card>
      <T muted style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' }}>{title}</T>
      <SponsorSlider list={list} placement={placement} />
    </Card>
  );
}
