import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';

// Login is a two-step form when the user has 2FA enabled:
//   step 1 — email + password → may return a `pending2fa` token.
//   step 2 — render a TOTP / recovery-code input keyed by that pending token.
// The pending token lives only in this component's state; reloading the
// page drops it and the user starts over.

type Step =
  | { kind: 'credentials' }
  | { kind: 'twoFactor'; pendingToken: string };

export default function LoginPage(): JSX.Element {
  const { signIn, signInWith2fa } = useAuth();
  const nav = useNavigate();

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
    } catch {
      setError('Invalid email or password');
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
      setError('Invalid 2FA code');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      {step.kind === 'credentials' ? (
        <form
          onSubmit={submitCredentials}
          className="w-full max-w-sm bg-white shadow rounded-lg p-6 space-y-4"
        >
          <h1 className="text-2xl font-semibold">Sign in</h1>

          <label className="block">
            <span className="text-sm font-medium">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded border-slate-300 px-3 py-2 border"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded border-slate-300 px-3 py-2 border"
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-slate-900 text-white rounded py-2 font-medium disabled:opacity-50"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="text-sm text-slate-600">
            No account?{' '}
            <Link to="/register" className="text-slate-900 underline">
              Create one
            </Link>
          </p>
        </form>
      ) : (
        <form
          onSubmit={submitTwoFactor}
          className="w-full max-w-sm bg-white shadow rounded-lg p-6 space-y-4"
        >
          <h1 className="text-2xl font-semibold">Two-factor code</h1>
          <p className="text-sm text-slate-600">
            Enter the 6-digit code from your authenticator app, or one of your
            single-use recovery codes.
          </p>

          <label className="block">
            <span className="text-sm font-medium">Code</span>
            <input
              type="text"
              required
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456 or xxxx-xxxx"
              className="mt-1 w-full rounded border-slate-300 px-3 py-2 border font-mono"
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !code}
            className="w-full bg-slate-900 text-white rounded py-2 font-medium disabled:opacity-50"
          >
            {submitting ? 'Verifying…' : 'Verify'}
          </button>

          <button
            type="button"
            onClick={() => {
              setStep({ kind: 'credentials' });
              setCode('');
              setError(null);
            }}
            className="w-full text-sm text-slate-500 underline"
          >
            Back to sign-in
          </button>
        </form>
      )}
    </div>
  );
}
