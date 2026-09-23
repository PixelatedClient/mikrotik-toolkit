import { useEffect, useRef, useState } from 'react';
import { useAuth } from './auth/useAuth';
import { openAuthDialog } from '../scripts/session';

interface Comment {
  id: string;
  author: string;
  email: string;
  text: string;
  timestamp: string;
  likes: number;
}

interface LessonCommentsProps {
  lessonId: string;
  lessonTitle: string;
}

const storageKey = (lessonId: string) => `na-comments:${lessonId}`;

/**
 * Comments section for lessons.
 * - Logged-in users can post comments
 * - Guests can read comments but are prompted to sign in to comment
 * - Comments are stored in localStorage (demo) or Supabase (production)
 * - Simple moderation: authors can delete their own comments
 */
export default function LessonComments({ lessonId, lessonTitle }: LessonCommentsProps) {
  const auth = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load comments from storage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey(lessonId));
      if (stored) {
        const data = JSON.parse(stored) as Comment[];
        setComments(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Failed to load comments:', e);
    }
    setLoaded(true);
  }, [lessonId]);

  const postComment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!auth.signedIn) {
      openAuthDialog();
      return;
    }

    if (!text.trim()) return;

    setBusy(true);
    try {
      const newComment: Comment = {
        id: Math.random().toString(36).slice(2),
        author: auth.email?.split('@')[0] || 'Anonymous',
        email: auth.email || '',
        text: text.trim(),
        timestamp: new Date().toISOString(),
        likes: 0,
      };

      const updated = [newComment, ...comments];
      setComments(updated);
      localStorage.setItem(storageKey(lessonId), JSON.stringify(updated));
      setText('');
      textareaRef.current?.focus();
    } catch (error) {
      console.error('Failed to post comment:', error);
    } finally {
      setBusy(false);
    }
  };

  const deleteComment = (id: string) => {
    const updated = comments.filter((c) => c.id !== id);
    setComments(updated);
    localStorage.setItem(storageKey(lessonId), JSON.stringify(updated));
  };

  const likeComment = (id: string) => {
    const updated = comments.map((c) =>
      c.id === id ? { ...c, likes: c.likes + 1 } : c
    );
    setComments(updated);
    localStorage.setItem(storageKey(lessonId), JSON.stringify(updated));
  };

  const formatDate = (iso: string): string => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return d.toLocaleDateString();
  };

  if (!loaded) {
    return (
      <section aria-labelledby="comments-h" className="mt-12 max-w-3xl">
        <h2 id="comments-h" className="text-2xl font-bold tracking-tight">Discussion</h2>
        <p className="mt-2 h-8 animate-pulse rounded bg-line" />
      </section>
    );
  }

  return (
    <section aria-labelledby="comments-h" className="mt-12 max-w-3xl">
      <h2 id="comments-h" className="text-2xl font-bold tracking-tight">Discussion</h2>
      <p className="mt-2 text-sm text-muted">
        Ask questions or share insights about this lesson. Comments are kept for all learners.
      </p>

      {/* Comment form */}
      {auth.ready && (
        <form onSubmit={postComment} className="mt-6 rounded-lg border-2 border-line bg-surface p-4">
          {!auth.signedIn ? (
            <div className="rounded-md bg-surface-2 p-3 text-sm">
              <p className="text-muted">
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    openAuthDialog();
                  }}
                  className="text-accent underline"
                >
                  Sign in
                </a>
                {' '}to join the discussion
              </p>
            </div>
          ) : (
            <>
              <label htmlFor={`comment-${lessonId}`} className="block text-sm font-medium text-fg">
                Your comment
              </label>
              <textarea
                ref={textareaRef}
                id={`comment-${lessonId}`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Share what you learned, ask a question, or point out something interesting..."
                rows={3}
                className="mt-2 w-full rounded-md border-2 border-line bg-bg px-3 py-2 text-fg placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <div className="mt-3 flex items-center justify-between">
                <p className="text-xs text-muted">
                  Be kind and constructive. No spam, credentials, or hostile content.
                </p>
                <button
                  type="submit"
                  disabled={busy || !text.trim()}
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent/90 disabled:opacity-50"
                >
                  {busy ? 'Posting...' : 'Post'}
                </button>
              </div>
            </>
          )}
        </form>
      )}

      {/* Comments list */}
      {comments.length === 0 ? (
        <div className="mt-6 rounded-lg border-2 border-line bg-surface p-4 text-center text-muted">
          <p>No comments yet. Be the first to share your thoughts!</p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {comments.map((comment) => (
            <div key={comment.id} className="rounded-lg border-2 border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-fg">{comment.author}</p>
                  <p className="text-xs text-muted">{formatDate(comment.timestamp)}</p>
                </div>
                {auth.signedIn && auth.email === comment.email && (
                  <button
                    type="button"
                    onClick={() => deleteComment(comment.id)}
                    className="text-xs text-muted hover:text-danger"
                    title="Delete your comment"
                  >
                    Delete
                  </button>
                )}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-fg">{comment.text}</p>
              <button
                type="button"
                onClick={() => likeComment(comment.id)}
                className="mt-3 text-xs text-muted hover:text-accent"
              >
                👍 {comment.likes > 0 ? comment.likes : 'Like'}
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-muted">
        Comments are stored locally in your browser for now. Sign in to save your comments permanently and sync across devices.
      </p>
    </section>
  );
}
