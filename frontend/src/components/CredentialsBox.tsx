import { useState } from 'react';

// Bug #17: the Clipboard API (`navigator.clipboard`) only exists in a "secure context" --
// HTTPS, or localhost. This app is currently deployed over plain HTTP on a bare IP
// (http://161.97.154.211:8085, no TLS yet), so `navigator.clipboard` is simply `undefined`
// there in every standards-compliant browser -- the old code's `navigator.clipboard?.writeText()`
// silently no-op'd every time, while still showing "Copied ✓" unconditionally right after.
// This falls back to the older (deprecated, but still universally supported)
// `document.execCommand('copy')` technique, which *does* still work over plain HTTP, and
// reports back whether it actually succeeded so the UI can be honest about the outcome.
// Once this app gets TLS (see architecture-plan.md's outstanding SSL/domain item), the
// primary `navigator.clipboard` path just starts succeeding and this fallback goes unused.
async function copyToClipboard(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the execCommand fallback below
    }
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    // Off-screen but still focusable/selectable -- execCommand('copy') only works on
    // the current selection, so the element has to actually be focused and selected.
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

// The "tap the box to copy" credentials block -- used for pharmacy creation, Super
// Admin's pharmacy-admin password regeneration, and (bug #15) a pharmacy admin's staff
// password regeneration. Only ever shown once per generated password: only the bcrypt
// hash survives after this render, so there's no way to show it again later.
export function CredentialsBox({ email, password }: { email: string; password: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const text = `Your Credentials\n--------------------------\nEmail: ${email}\nPassword: ${password}`;

  async function copy() {
    const ok = await copyToClipboard(text);
    setStatus(ok ? 'copied' : 'failed');
    setTimeout(() => setStatus('idle'), ok ? 2000 : 3500);
  }

  const borderColor = status === 'copied' ? 'var(--success)' : status === 'failed' ? 'var(--warning)' : 'var(--border)';

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={copy}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            copy();
          }
        }}
        style={{
          fontFamily: 'monospace',
          fontSize: 14,
          lineHeight: 1.7,
          whiteSpace: 'pre-wrap',
          background: 'var(--bg)',
          border: `1px solid ${borderColor}`,
          borderRadius: 'var(--radius)',
          padding: '14px 16px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <div style={{ fontWeight: 700, fontFamily: 'inherit' }}>Your Credentials</div>
        <div style={{ color: 'var(--text-muted)' }}>--------------------------</div>
        <div>Email: {email}</div>
        <div>Password: {password}</div>
      </div>
      <div
        style={{
          fontSize: 12,
          color: status === 'copied' ? 'var(--success)' : status === 'failed' ? 'var(--warning)' : 'var(--text-muted)',
          fontWeight: status === 'idle' ? 400 : 600,
          marginTop: 8,
          textAlign: 'center',
        }}
      >
        {status === 'copied'
          ? 'Copied ✓ — paste it into WhatsApp'
          : status === 'failed'
            ? "Couldn't copy — select the text above and copy it manually"
            : 'Tap to copy'}
      </div>
    </div>
  );
}
