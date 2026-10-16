import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, H, T, Btn } from '../components/ui';
import { PaymentStatus } from '../components/PaymentStatus';

// Where Stripe / Flutterwave send the customer back to (the website). The app polls the same status.
export default function PayReturn() {
  const p = useLocalSearchParams<{ order?: string; t?: string; session_id?: string; transaction_id?: string; cancelled?: string }>();
  const r = useRouter();
  if (!p.order || !p.t) return <Screen><H>Payment</H><T muted>This payment link is incomplete.</T></Screen>;
  return (
    <Screen><H>{p.cancelled ? 'Payment cancelled' : 'Thanks for your order'}</H>
      <PaymentStatus orderId={p.order} token={p.t} verify={{ session_id: p.session_id, transaction_id: p.transaction_id }} />
      <T muted>If you paid on your phone, you can close this page and go back to the app.</T>
      <Btn title="Back to the shop" kind="ghost" onPress={() => r.replace('/shop')} />
    </Screen>
  );
}
