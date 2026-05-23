import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { useAuth } from '@/features/auth/AuthContext';
import {
  regenerateRecoveryCodes,
  twoFactorConfirm,
  twoFactorDisable,
  twoFactorSetup,
  type TwoFactorSetup,
} from '@/features/auth/api';

// Settings → Security. Phase 2C surfaces TOTP enrolment + disable + recovery
// code regeneration. Future phases (password rotation policy, sign-in log
// links) can land here without restructuring the layout.

function errorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const msg = err.response?.data?.error?.message;
    if (typeof msg === 'string' && msg.length) return msg;
  }
  return fallback;
}

export default function SecurityPage(): JSX.Element {
  const { user, patchUser } = useAuth();

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold mb-1">Security</h2>
        <p className="text-sm text-slate-500">
          Two-factor authentication and account-level credentials.
        </p>
      </header>

      <div className="border rounded p-4">
        <h3 className="font-medium mb-1">Two-factor authentication</h3>
        <p className="text-sm text-slate-600 mb-3">
          Add a 6-digit code from an authenticator app on top of your password.
          Recommended.
        </p>
        {user?.totpEnabled
          ? <DisablePanel onDisabled={() => patchUser({ totpEnabled: false })} />
          : <EnrollPanel onEnrolled={() => patchUser({ totpEnabled: true })} />}
      </div>
    </section>
  );
}

// ── Enrol new ────────────────────────────────────────────────────────────
function EnrollPanel({ onEnrolled }: { onEnrolled: () => void }): JSX.Element {
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setupMut = useMutation({
    mutationFn: twoFactorSetup,
    onSuccess: (data) => {
      setSetup(data);
      setError(null);
    },
    onError: (err) => setError(errorMessage(err, 'Could not start enrolment')),
  });

  const confirmMut = useMutation({
    mutationFn: (input: { secret: string; code: string }) => twoFactorConfirm(input),
    onSuccess: (data) => {
      setRecoveryCodes(data.recoveryCodes);
      onEnrolled();
    },
    onError: (err) => setError(errorMessage(err, 'Invalid code')),
  });

  // Just-finished — show the one-time recovery codes.
  if (recoveryCodes) {
    return <RecoveryCodeReveal codes={recoveryCodes} title="2FA enabled" />;
  }

  // Step 1 — start.
  if (!setup) {
    return (
      <button
        type="button"
        onClick={() => setupMut.mutate()}
        disabled={setupMut.isPending}
        className="bg-slate-900 text-white rounded px-3 py-1 text-sm font-medium"
      >
        {setupMut.isPending ? 'Setting up…' : 'Enable 2FA'}
      </button>
    );
  }

  // Step 2 — scan + confirm.
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        confirmMut.mutate({ secret: setup.secret, code });
      }}
      className="space-y-3 text-sm"
    >
      <ol className="list-decimal pl-5 text-slate-700 space-y-1">
        <li>
          Scan the QR code with your authenticator app (Google Authenticator,
          1Password, Bitwarden, Authy, …).
        </li>
        <li>Or paste the manual key into the app.</li>
        <li>Type the 6-digit code the app shows.</li>
      </ol>
      <div className="flex flex-wrap gap-4 items-start">
        <img src={setup.qrDataUrl} alt="2FA QR code" className="border rounded" />
        <div className="text-xs">
          <p className="text-slate-500 mb-1">Manual key</p>
          <code className="bg-slate-100 rounded px-2 py-1 block break-all">{setup.secret}</code>
        </div>
      </div>
      <label className="block">
        <span className="text-xs font-medium">6-digit code</span>
        <input
          required
          autoFocus
          inputMode="numeric"
          pattern="\d{6}"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="mt-1 border rounded px-2 py-1 w-32 font-mono"
        />
      </label>
      {error && <p className="text-red-600 text-xs">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={confirmMut.isPending || code.length !== 6}
          className="bg-slate-900 text-white rounded px-3 py-1 text-sm font-medium disabled:opacity-50"
        >
          {confirmMut.isPending ? 'Verifying…' : 'Confirm + finish'}
        </button>
        <button
          type="button"
          onClick={() => {
            setSetup(null);
            setCode('');
            setError(null);
          }}
          className="text-sm underline"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Disable + regenerate ─────────────────────────────────────────────────
function DisablePanel({ onDisabled }: { onDisabled: () => void }): JSX.Element {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  const disableMut = useMutation({
    mutationFn: (c: string) => twoFactorDisable(c),
    onSuccess: () => {
      onDisabled();
      setCode('');
      setError(null);
    },
    onError: (err) => setError(errorMessage(err, 'Invalid code')),
  });

  const regenMut = useMutation({
    mutationFn: regenerateRecoveryCodes,
    onSuccess: (res) => setNewCodes(res.recoveryCodes),
    onError: (err) => setError(errorMessage(err, 'Could not regenerate codes')),
  });

  if (newCodes) {
    return <RecoveryCodeReveal codes={newCodes} title="New recovery codes" />;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-emerald-700">2FA is enabled on this account.</p>

      <div>
        <p className="text-xs font-medium text-slate-700 mb-1">Disable</p>
        <p className="text-xs text-slate-500 mb-2">
          Removing 2FA reduces account security. Confirm with a current 6-digit
          code or one of your recovery codes.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            disableMut.mutate(code);
          }}
          className="flex flex-wrap gap-2 items-end"
        >
          <input
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456 or xxxx-xxxx"
            className="border rounded px-2 py-1 text-sm font-mono w-48"
          />
          <button
            type="submit"
            disabled={disableMut.isPending || !code}
            className="bg-red-600 text-white rounded px-3 py-1 text-sm font-medium disabled:opacity-50"
          >
            {disableMut.isPending ? 'Disabling…' : 'Disable 2FA'}
          </button>
        </form>
      </div>

      <div className="border-t pt-3">
        <p className="text-xs font-medium text-slate-700 mb-1">Recovery codes</p>
        <p className="text-xs text-slate-500 mb-2">
          Regenerating produces a fresh set and invalidates the previous one
          immediately.
        </p>
        <button
          type="button"
          onClick={() => regenMut.mutate()}
          disabled={regenMut.isPending}
          className="text-sm underline"
        >
          {regenMut.isPending ? 'Generating…' : 'Regenerate recovery codes'}
        </button>
      </div>

      {error && <p className="text-red-600 text-xs">{error}</p>}
    </div>
  );
}

// ── One-shot recovery-code reveal ────────────────────────────────────────
function RecoveryCodeReveal({ codes, title }: { codes: string[]; title: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  const joined = codes.join('\n');
  return (
    <div className="space-y-3">
      <h4 className="font-medium text-emerald-700">{title}</h4>
      <p className="text-xs text-slate-600">
        Save these recovery codes somewhere safe. Each can be used once if you
        lose access to your authenticator. This is the only time they'll be
        shown.
      </p>
      <pre className="bg-slate-100 rounded p-3 text-xs font-mono whitespace-pre">
        {joined}
      </pre>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(joined).catch(() => undefined);
          setCopied(true);
        }}
        className="text-xs underline"
      >
        {copied ? 'Copied' : 'Copy all'}
      </button>
    </div>
  );
}
