import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '@/features/auth/AuthContext';
import { useT } from '@/lib/i18n';

// Login is a two-step form when the user has 2FA enabled:
//   step 1 — email + password → may return a `pending2fa` token.
//   step 2 — render a TOTP / recovery-code input keyed by that pending token.
// The pending token lives only in this component's state; reloading the
// page drops it and the user starts over.

type Step =
  | { kind: 'credentials' }
  | { kind: 'twoFactor'; pendingToken: string };

// Testbed-only convenience: when the app is served by the local dev testbed
// (VITE_TESTBED=1, set only in testbed/docker-compose.local.yml), surface the
// seeded sample credentials on the login form with a one-click fill. The flag
// is never set in real deployments, so this stays invisible in production.
const TESTBED =
  import.meta.env.VITE_TESTBED === '1' || import.meta.env.VITE_TESTBED === 'true';
const SAMPLE_EMAIL = import.meta.env.VITE_TESTBED_EMAIL ?? 'admin@taskhub.local';
const SAMPLE_PASSWORD = import.meta.env.VITE_TESTBED_PASSWORD ?? 'admin';

export default function LoginPage(): JSX.Element {
  const { signIn, signInWith2fa } = useAuth();
  const nav = useNavigate();
  const t = useT();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submitCredentials(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await signIn(email, password);
      if (result.kind === 'pending2fa') {
        setStep({ kind: 'twoFactor', pendingToken: result.pendingToken });
      } else {
        nav('/dashboard');
      }
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 503) {
        const msg = err.response?.data?.error?.message;
        setError(typeof msg === 'string' && msg.length ? msg : t('login.invalid'));
      } else {
        setError(t('login.invalid'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function submitTwoFactor(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (step.kind !== 'twoFactor') return;
    setError(null);
    setSubmitting(true);
    try {
      await signInWith2fa(step.pendingToken, code);
      nav('/dashboard');
    } catch {
      setError(t('login.twoFactorInvalid'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      {step.kind === 'credentials' ? (
        <form
          onSubmit={submitCredentials}
          className="w-full max-w-sm bg-surface border border-border shadow rounded-lg p-6 space-y-4"
        >
          <h1 className="text-2xl font-semibold">{t('login.title')}</h1>

          <label className="block">
            <span className="text-sm font-medium">{t('login.email')}</span>
            <input
              type="text"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('login.placeholder.email')}
              className="mt-1 w-full rounded border border-border bg-surface text-text px-3 py-2"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">{t('login.password')}</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-surface text-text px-3 py-2"
            />
          </label>

          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-primary text-primary-contrast rounded py-2 font-medium disabled:opacity-50"
          >
            {submitting ? t('login.submitting') : t('login.submit')}
          </button>

          {TESTBED && (
            <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
              <div className="font-semibold">{t('login.testbed.title')}</div>
              <div className="mt-1 font-mono">
                {SAMPLE_EMAIL} / {SAMPLE_PASSWORD}
              </div>
              <button
                type="button"
                onClick={() => {
                  setEmail(SAMPLE_EMAIL);
                  setPassword(SAMPLE_PASSWORD);
                }}
                className="mt-1 underline"
              >
                {t('login.testbed.use')}
              </button>
            </div>
          )}

          {/* v1.30.11 (S-9): public self-registration removed.
              New accounts are admin-provisioned via Settings → Admin →
              New user (v1.26). The "no account → sign up" link is gone. */}
        </form>
      ) : (
        <form
          onSubmit={submitTwoFactor}
          className="w-full max-w-sm bg-surface border border-border shadow rounded-lg p-6 space-y-4"
        >
          <h1 className="text-2xl font-semibold">{t('login.twoFactorTitle')}</h1>
          <p className="text-sm text-text-muted">
            {t('login.twoFactorHelp')}
          </p>

          <label className="block">
            <span className="text-sm font-medium">{t('login.twoFactorCode')}</span>
            <input
              type="text"
              required
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t('login.placeholder.twoFactorCode')}
              className="mt-1 w-full rounded border border-border bg-surface text-text px-3 py-2 font-mono"
            />
          </label>

          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !code}
            className="w-full bg-primary text-primary-contrast rounded py-2 font-medium disabled:opacity-50"
          >
            {submitting ? t('login.twoFactorVerifying') : t('login.twoFactorVerify')}
          </button>

          <button
            type="button"
            onClick={() => {
              setStep({ kind: 'credentials' });
              setCode('');
              setError(null);
            }}
            className="w-full text-sm text-text-muted underline"
          >
            {t('login.twoFactorBack')}
          </button>
        </form>
      )}
    </div>
  );
}
