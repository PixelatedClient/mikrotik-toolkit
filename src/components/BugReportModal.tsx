import { useState } from 'react';

export default function BugReportModal() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [page, setPage] = useState(typeof window !== 'undefined' ? window.location.pathname : '');
  const [description, setDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !description.trim()) {
      setError('Email and description are required');
      return;
    }

    const report = {
      email: email.trim(),
      page: page.trim() || window.location.pathname,
      description: description.trim(),
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
    };

    try {
      // Store in localStorage for now
      const reports = JSON.parse(localStorage.getItem('na-bug-reports') || '[]');
      reports.push(report);
      localStorage.setItem('na-bug-reports', JSON.stringify(reports));

      setSubmitted(true);
      setTimeout(() => {
        setOpen(false);
        setEmail('');
        setPage(typeof window !== 'undefined' ? window.location.pathname : '');
        setDescription('');
        setSubmitted(false);
      }, 2000);
    } catch (err) {
      setError('Failed to submit report. Please try again.');
      console.error('Bug report error:', err);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="block px-1 py-0.5 hover:text-fg text-muted"
        aria-label="Report a bug"
      >
        Report bug
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="block px-1 py-0.5 hover:text-fg text-muted"
      >
        Report bug
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-line bg-surface p-6">
            <div className="flex items-center justify-between gap-4 mb-4">
              <h2 className="text-lg font-semibold">Report a bug or concern</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-muted hover:text-fg p-1"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {submitted ? (
              <div className="text-center py-6">
                <p className="text-fg font-semibold mb-2">Thank you!</p>
                <p className="text-muted text-sm">Your report has been saved. We'll review it soon.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="bug-email" className="block text-sm font-medium mb-1.5">
                    Email
                  </label>
                  <input
                    id="bug-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full rounded border border-line bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="bug-page" className="block text-sm font-medium mb-1.5">
                    Page (optional)
                  </label>
                  <input
                    id="bug-page"
                    type="text"
                    value={page}
                    onChange={(e) => setPage(e.target.value)}
                    placeholder="/learn/foundations/01-intro"
                    className="w-full rounded border border-line bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="bug-description" className="block text-sm font-medium mb-1.5">
                    Issue description
                  </label>
                  <textarea
                    id="bug-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe what went wrong..."
                    rows={5}
                    className="w-full rounded border border-line bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none resize-none"
                    required
                  />
                </div>

                {error && <p className="text-red-400 text-sm">{error}</p>}

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    className="flex-1 rounded bg-accent px-4 py-2 font-medium text-accent-fg hover:opacity-90"
                  >
                    Send report
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="flex-1 rounded border border-line px-4 py-2 text-muted hover:text-fg"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
