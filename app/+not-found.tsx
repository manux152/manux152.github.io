import { useRouter } from 'expo-router';
import { Screen, H, T, Btn } from '../components/ui';
import { PageHead } from '../components/PageHead';

export default function NotFound() {
  const r = useRouter();
  return (
    <Screen><PageHead title="Page not found" />
      <H>We couldn't find that page</H>
      <T muted>The link may be old or mistyped.</T>
      <Btn title="Go to the home page" onPress={() => r.replace('/')} />
      <Btn title="See fixtures" kind="ghost" onPress={() => r.replace('/matches')} />
    </Screen>
  );
}
