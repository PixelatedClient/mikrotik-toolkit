import { useEffect, useState } from 'react';

export default function SponsorBanner() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      const isDismissed = localStorage.getItem('na-sponsor-banner-dismissed') === 'true';
      setDismissed(isDismissed);
    } catch (e) {
      // localStorage access blocked
      setDismissed(true);
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem('na-sponsor-banner-dismissed', 'true');
    } catch (e) {
      // localStorage access blocked
    }
  };

  const handleAffiliateClick = (partnerId: string) => {
    try {
      const clicks = JSON.parse(localStorage.getItem('na-affiliate-clicks') || '{}');
      clicks[partnerId] = (clicks[partnerId] || 0) + 1;
      localStorage.setItem('na-affiliate-clicks', JSON.stringify(clicks));
    } catch (e) {
      // localStorage access blocked
    }
  };

  if (dismissed) return null;

  return (
    <div className="bg-gradient-to-r from-accent/10 to-accent/5 border-b border-line">
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <h3 className="font-semibold text-fg">Support Network Academy</h3>
            <p className="mt-1 text-sm text-muted">
              Network Academy is free. We're sustained by affiliate partnerships with tools you'll actually use in your career.
              <a href="/sponsors" className="ml-2 text-accent hover:underline">Learn more</a>
            </p>
          </div>
          <button
            onClick={handleDismiss}
            aria-label="Dismiss sponsor banner"
            className="text-muted hover:text-fg transition-colors flex-shrink-0"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
