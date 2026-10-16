import { Screen, H, T, Card, Loading } from '../../components/ui';
import { useTable } from '../../lib/useQuery';
import { useApp } from '../../lib/app-context';

export default function Audit() {
  const { can } = useApp();
  const log = useTable('audit_log', (q) => q.order('at', { ascending: false }).limit(100).select('*, profiles:actor(full_name,email)'));
  if (!can('audit.view')) return <Screen><T>No permission.</T></Screen>;
  if (log.loading) return <Loading />;
  return (
    <Screen><H>Audit log</H><T muted>The last 100 changes to roles, permissions, accounts, settings and registrations.</T>
      {(log.data as any[]).map((l) => (
        <Card key={l.id}>
          <T style={{ fontWeight: '700' }}>{l.op} · {l.table_name}</T>
          <T muted>{new Date(l.at).toLocaleString()} · {l.profiles?.full_name || l.profiles?.email || (l.actor ? 'user' : 'system')}</T>
          <T muted style={{ fontSize: 12 }}>{JSON.stringify(l.new_data ?? l.old_data).slice(0, 160)}</T>
        </Card>
      ))}
    </Screen>
  );
}
