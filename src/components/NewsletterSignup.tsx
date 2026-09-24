import { useState } from 'react';

export default function NewsletterSignup() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setMessage('Email is required');
      setStatus('error');
      return;
    }

    setStatus('loading');
    try {
      // Track locally for now; future: send to backend/email service
      const stored = localStorage.getItem('na-newsletter-signups') || '[]';
      const signups = JSON.parse(stored);
      if (!signups.includes(email)) {
        signups.push(email);
        localStorage.setItem('na-newsletter-signups', JSON.stringify(signups));
      }

      setMessage('Thanks! Check your email for confirmation.');
      setStatus('success');
      setEmail('');
      setTimeout(() => setStatus('idle'), 5000);
    } catch (err) {
      setMessage('Something went wrong. Try again.');
      setStatus('error');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-2">
        <input
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === 'loading'}
          className="flex-1 rounded border border-line bg-bg px-3 py-2 text-sm text-fg placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-50"
        >
          {status === 'loading' ? 'Signing up...' : 'Sign up'}
        </button>
      </div>
      {message && (
        <p className={`text-sm ${status === 'success' ? 'text-accent' : 'text-red-500'}`}>
          {message}
        </p>
      )}
    </form>
  );
}
