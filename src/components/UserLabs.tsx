import { useEffect, useRef, useState } from 'react';
import { useAuth } from './auth/useAuth';
import { openAuthDialog } from '../scripts/session';

interface UserLabsProps {
  labId?: string;
  labTitle?: string;
  configLabel?: string;
}

/**
 * Download button for lab configurations.
 * - Logged-in users can download their current lab state as an .rsc file
 * - Guests see a login prompt
 * - The config includes the lab setup and any user modifications
 */
export default function UserLabs({ labId = 'unnamed-lab', labTitle, configLabel = 'Download my lab config' }: UserLabsProps) {
  const auth = useAuth();
  const [copied, setCopied] = useState(false);
  const [config, setConfig] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);

  // Get the current lab state from the simulator (if available)
  const getLabConfig = (): string => {
    // Try to get the simulated lab config from localStorage
    const key = `na-sim:${labId}`;
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const data = JSON.parse(saved) as { history?: Array<{ dev: string; line: string }> };
        if (data.history && Array.isArray(data.history)) {
          // Build an export-like output showing the commands run
          const lines = ['# Lab: ' + (labTitle || labId)];
          lines.push('# Exported from Network Academy');
          lines.push('# Timestamp: ' + new Date().toISOString());
          lines.push('');

          // Group commands by device
          const byDevice: Record<string, string[]> = {};
          for (const h of data.history) {
            if (!byDevice[h.dev]) byDevice[h.dev] = [];
            byDevice[h.dev].push(h.line);
          }

          // Output each device's commands
          for (const [dev, cmds] of Object.entries(byDevice)) {
            lines.push(`# === ${dev} ===`);
            for (const cmd of cmds) {
              // RouterOS commands typically start with /
              if (!cmd.startsWith('/') && !cmd.startsWith(':')) {
                lines.push(cmd);
              } else {
                lines.push(cmd);
              }
            }
            lines.push('');
          }

          return lines.join('\n');
        }
      }
    } catch (e) {
      console.error('Failed to export lab config:', e);
    }

    // Fallback: return a template
    return `# Lab: ${labTitle || labId}
# Exported from Network Academy
# Timestamp: ${new Date().toISOString()}
#
# Add your RouterOS commands here.
# Each device gets its own section.
`;
  };

  const downloadConfig = async () => {
    if (!auth.signedIn) {
      openAuthDialog();
      return;
    }

    setBusy(true);
    try {
      const content = getLabConfig();
      const filename = `${labId}-${new Date().toISOString().split('T')[0]}.rsc`;

      // Create a blob and download
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
    } finally {
      setBusy(false);
    }
  };

  const copyToClipboard = async () => {
    if (!auth.signedIn) {
      openAuthDialog();
      return;
    }

    try {
      const content = getLabConfig();
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Copy failed:', error);
    }
  };

  const showAsText = () => {
    setConfig(getLabConfig());
  };

  if (!auth.ready) {
    return (
      <span className="inline-block h-7 w-24 rounded-md border-2 border-line bg-surface animate-pulse" />
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={downloadConfig}
          disabled={busy}
          className="rounded-md border-2 border-line bg-surface px-4 py-2 text-sm font-medium text-fg hover:border-accent hover:bg-surface-2 disabled:opacity-50"
          title={auth.signedIn ? 'Download config as .rsc file' : 'Sign in to download'}
        >
          {busy ? 'Preparing...' : (
            <>
              <span className="mr-2">↓</span>
              {configLabel}
            </>
          )}
        </button>

        <button
          type="button"
          onClick={copyToClipboard}
          disabled={busy}
          className="rounded-md border-2 border-line bg-surface px-4 py-2 text-sm text-fg hover:border-accent hover:bg-surface-2 disabled:opacity-50"
          title={auth.signedIn ? 'Copy to clipboard' : 'Sign in to copy'}
        >
          {copied ? '✓ Copied!' : 'Copy'}
        </button>

        <button
          type="button"
          onClick={showAsText}
          className="rounded-md border-2 border-line bg-surface px-4 py-2 text-sm text-fg hover:border-accent hover:bg-surface-2"
          title="View as text"
        >
          View
        </button>

        {!auth.signedIn && (
          <p className="text-xs text-muted">
            <a href="#" onClick={(e) => { e.preventDefault(); openAuthDialog(); }} className="text-accent underline">
              Sign in
            </a>
            {' '}to save and share
          </p>
        )}
      </div>

      {config && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="config-h"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => {
            if (e.target === dialogRef.current) setConfig('');
          }}
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border-2 border-accent bg-surface p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4 mb-4">
              <h2 id="config-h" className="pixel text-sm leading-relaxed">
                Lab Config: {labId}
              </h2>
              <button
                type="button"
                onClick={() => setConfig('')}
                aria-label="Close"
                className="rounded-md px-2 text-xl text-muted hover:text-fg"
              >
                ×
              </button>
            </div>
            <pre className="overflow-x-auto rounded-md bg-bg p-3 text-xs font-mono text-fg border border-line">
              {config}
            </pre>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={copyToClipboard}
                className="rounded-md border-2 border-line bg-surface px-4 py-2 text-sm text-fg hover:border-accent hover:bg-surface-2"
              >
                {copied ? '✓ Copied!' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={downloadConfig}
                className="rounded-md border-2 border-line bg-surface px-4 py-2 text-sm text-fg hover:border-accent hover:bg-surface-2"
              >
                Download
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
