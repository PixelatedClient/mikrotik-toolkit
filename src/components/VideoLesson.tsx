import { useRef, useState } from 'react';
import { finishLevel, useGame } from './game/useGame';
import type { Badge } from '../lib/gamify';

interface VideoLessonProps {
  videoUrl: string;
  title: string;
  duration: string;
  lessonId?: string;
}

/**
 * Video player component for lessons.
 * Supports self-hosted .mp4 files only (no third-party embeds per project policy).
 * Tracks progress and awards XP when video is marked as watched.
 * For external videos, link to them instead of embedding.
 */
export default function VideoLesson({ videoUrl, title, duration, lessonId }: VideoLessonProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { state } = useGame();
  const [watchedPct, setWatchedPct] = useState(0);
  const [isWatched, setIsWatched] = useState(false);
  const [badge, setBadge] = useState<Badge | null>(null);

  const levelId = lessonId ? `video-${lessonId}` : null;
  const best = levelId ? state.stars[levelId] ?? 0 : 0;

  // Track video progress for self-hosted videos
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const pct = (videoRef.current.currentTime / videoRef.current.duration) * 100;
    setWatchedPct(pct);

    // Mark as watched when 80% through
    if (pct >= 80 && !isWatched && levelId) {
      setIsWatched(true);
      const result = finishLevel(levelId, 1);
      if (result.fresh.length > 0) {
        setBadge(result.fresh[0]);
        setTimeout(() => setBadge(null), 3000);
      }
    }
  };

  return (
    <div className="not-prose space-y-4 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-sm text-muted">Duration: {duration}</p>
        </div>
        {levelId && best > 0 && (
          <p className="text-xs text-muted">Watched ✓</p>
        )}
      </div>

      {/* Video Container - Local MP4 only (no third-party embeds) */}
      <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
        <video
          ref={videoRef}
          src={videoUrl}
          className="h-full w-full"
          controls
          controlsList="nodownload"
          onTimeUpdate={handleTimeUpdate}
        >
          <track kind="captions" srcLang="en" label="English" />
          Your browser does not support the video tag.
        </video>
      </div>

      {/* Video controls and progress tracking */}
      {videoRef.current && (
        <>
          {/* Progress bar */}
          <div className="space-y-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-line">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${watchedPct}%` }}
              />
            </div>
            <p className="text-xs text-muted">
              {isWatched ? 'Watched (80%)' : `${Math.round(watchedPct)}% watched`}
            </p>
          </div>
        </>
      )}

      {/* Badge notification */}
      {badge && (
        <div className="flex items-center gap-2 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-sm">
          <span className="text-base">🏆</span>
          <span className="font-medium">
            {badge.name}: {badge.desc}
          </span>
        </div>
      )}

      {/* XP and watch status */}
      {levelId && (
        <div className="flex items-center justify-between border-t border-line pt-3 text-sm">
          <span className="text-muted">
            {isWatched
              ? '✓ Watched – XP earned'
              : `Watch 80% to earn XP`}
          </span>
          {best > 0 && <span className="font-medium text-accent">+40 XP</span>}
        </div>
      )}
    </div>
  );
}
