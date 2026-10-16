import { useWindowDimensions } from 'react-native';

// Responsive helpers: phones get 2 columns / bottom tabs; wide web screens get more columns and a top menu.
export function useLayout() {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const cols = width >= 1100 ? 4 : width >= 760 ? 3 : 2;
  // Fluid values: everything in the navigation follows the window width so spacing always looks balanced.
  const clamp = (n: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, n)));
  const maxWidth = width >= 1600 ? 1280 : width >= 1100 ? 1100 : 960;
  const gutter = clamp(width * 0.03, 12, 40);                 // left/right padding of the header
  const navPadV = clamp(width * 0.012, 10, 18);               // vertical padding of menu links
  const navPadH = clamp(width * 0.014, 8, 20);                // horizontal padding of menu links
  const navFont = clamp(width * 0.0105, 12, 15);              // menu text size
  const logoH = clamp(width * 0.034, 30, 48);                 // logo height
  const avatar = clamp(width * 0.032, 34, 44);                // profile picture size
  return { width, wide, cols, maxWidth, gutter, navPadV, navPadH, navFont, logoH, avatar };
}
