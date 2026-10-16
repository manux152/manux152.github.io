import { Screen, H, T, Card, Loading } from '../../components/ui';
import { useTable } from '../../lib/useQuery';
import { useApp } from '../../lib/app-context';

export default function EmailLog() {
  const { can } = useApp();
  const log = useTable('email_log', (q) => q.order('at', { ascending: false }).limit(100));
  if (!can('emails.manage')) return <Screen><T>No permission.</T></Screen>;
  if (log.loading) return <Loading />;
  return (
    <Screen><H>Email log</H><T muted>The last 100 emails. Failed ones show the reason (e.g. missing provider key or unverified sender).</T>
      {log.data.length === 0 && <T muted>Nothing sent yet.</T>}
      {(log.data as any[]).map((l) => (
        <Card key={l.id}>
          <T style={{ fontWeight: '700', color: l.status === 'sent' ? '#2E9E5B' : '#D64545' }}>{l.status} · {l.kind}</T>
          <T>{l.subject || l.template_key || '(no subject)'}</T>
          <T muted>{l.to_name ? `${l.to_name} · ` : ''}{l.to_email} · {new Date(l.at).toLocaleString()}</T>
          {l.error ? <T muted style={{ fontSize: 12 }}>{l.error}</T> : null}
        </Card>
      ))}
    </Screen>
  );
}
