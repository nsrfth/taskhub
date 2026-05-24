import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchSystemInfo, fetchUpdateCheck } from '@/features/system/api';
import { useAuth } from '@/features/auth/AuthContext';

// "About" view — quick reference to the running instance: version, build
// info, environment, headline counts, license, and links to deeper docs.
// Public-ish (anyone authenticated can see it; the backend endpoint is
// auth-less so even the login page could pull from it if needed).

export default function AboutPage(): JSX.Element {
  const { user } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ['system', 'info'],
    queryFn: fetchSystemInfo,
    staleTime: 5 * 60_000,
  });

  // Admin-only opt-in update check. We gate the fetch on globalRole so
  // non-admins never hit the 403; the endpoint is also no-op (enabled:false)
  // when the operator hasn't set UPDATE_CHECK_ENABLED, so we still hide the
  // badge in that case.
  const isAdmin = user?.globalRole === 'ADMIN';
  const { data: update } = useQuery({
    queryKey: ['system', 'update-check'],
    queryFn: fetchUpdateCheck,
    enabled: isAdmin,
    // Backend caches for 6h; the SPA caches for 5 min so refreshing the page
    // doesn't fire a new request, but switching tabs after a while does.
    staleTime: 5 * 60_000,
    // The badge is purely informational — a flaky network shouldn't surface
    // a red error in the UI.
    retry: false,
  });

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">About TaskHub</h1>

      <section className="bg-white shadow rounded p-6 space-y-4">
        {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        {error && (
          <p className="text-sm text-red-600">
            Could not reach the server.
          </p>
        )}

        {data && (
          <>
            <Field label="Application">{data.name}</Field>
            <Field label="Version">
              <span className="inline-flex items-center gap-2 flex-wrap">
                <code>{data.version}</code>
                {/* Admin-only "update available" badge. Only renders when the
                    operator enabled UPDATE_CHECK_ENABLED AND GitHub returned
                    a newer tag than what's running. Quiet by design — a small
                    inline pill, not a banner. */}
                {isAdmin && update?.enabled && update.updateAvailable && update.latestVersion && (
                  <a
                    href={update.releaseUrl ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-xs hover:bg-emerald-200"
                    title={
                      update.publishedAt
                        ? `Released ${new Date(update.publishedAt).toLocaleDateString()}`
                        : 'View release on GitHub'
                    }
                  >
                    ↑ Update available: {update.latestVersion}
                  </a>
                )}
              </span>
            </Field>
            {data.buildTime && (
              <Field label="Built">
                <time dateTime={data.buildTime}>{data.buildTime}</time>
              </Field>
            )}
            <Field label="Environment"><code>{data.nodeEnv}</code></Field>
            <Field label="Off-days">
              {data.calendarWeekend.length === 0
                ? 'None configured (every day is a work day)'
                : data.calendarWeekend
                    .map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d])
                    .join(' · ')}
            </Field>
            <Field label="Counts">
              {data.counts.users} user{data.counts.users === 1 ? '' : 's'} ·{' '}
              {data.counts.teams} team{data.counts.teams === 1 ? '' : 's'} ·{' '}
              {data.counts.tasks} task{data.counts.tasks === 1 ? '' : 's'}
            </Field>
          </>
        )}

        <hr className="my-2" />

        <Field label="License">
          MIT — Copyright © 2026 TaskHub contributors. See{' '}
          <a href="/LICENSE" target="_blank" rel="noopener noreferrer" className="underline">
            LICENSE
          </a>{' '}
          for the full text.
        </Field>

        <Field label="Documentation">
          <Link to="/help" className="underline">User manual</Link>{' '}
          ·{' '}
          <a href="/CHANGELOG.md" target="_blank" rel="noopener noreferrer" className="underline">
            CHANGELOG
          </a>
        </Field>

        <Field label="Tech">
          React + Vite (frontend); Fastify + Prisma + Postgres + Redis (backend);
          Caddy reverse proxy; deployed via Docker Compose.
        </Field>

        <p className="text-xs text-slate-400 mt-4">
          Need help? Open the user manual via the 📖 button (top-right),
          or contact your TaskHub administrator.
        </p>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 text-sm">
      <span className="text-xs uppercase tracking-wide text-slate-500 pt-0.5">{label}</span>
      <span className="text-slate-800">{children}</span>
    </div>
  );
}
