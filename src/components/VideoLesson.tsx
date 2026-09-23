import { useEffect, useRef, useState } from 'react';
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
 * Supports YouTube embeds (iframe) and self-hosted .mp4 files (HTML5 video tag).
 * Tracks progress and awards XP when video is marked as watched.
 */
export default function VideoLesson({ videoUrl, title, duration, lessonId }: VideoLessonProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { state } = useGame();
  const [isYouTube, setIsYouTube] = useState(false);
  const [watchedPct, setWatchedPct] = useState(0);
  const [showCaptions, setShowCaptions] = useState(false);
  const [isWatched, setIsWatched] = useState(false);
  const [badge, setBadge] = useState<Badge | null>(null);

  const levelId = lessonId ? `video-${lessonId}` : null;
  const best = levelId ? state.stars[levelId] ?? 0 : 0;

  // Detect if URL is YouTube
  useEffect(() => {
    const isYt = videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be');
    setIsYouTube(isYt);
  }, [videoUrl]);

  // Track video progress
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

  // Get YouTube embed URL from various YouTube URL formats
  const getYouTubeEmbedUrl = () => {
    let videoId = '';
    if (videoUrl.includes('youtube.com/watch')) {
      const url = new URL(videoUrl);
      videoId = url.searchParams.get('v') || '';
    } else if (videoUrl.includes('youtu.be/')) {
      videoId = videoUrl.split('youtu.be/')[1]?.split('?')[0] || '';
    } else if (videoUrl.includes('youtube.com/embed/')) {
      videoId = videoUrl.split('embed/')[1]?.split('?')[0] || '';
    }
    return videoId ? `https://www.youtube.com/embed/${videoId}?modestbranding=1&rel=0` : videoUrl;
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

      {/* Video Container */}
      <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
        {isYouTube ? (
          <iframe
            src={getYouTubeEmbedUrl()}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        ) : (
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
        )}
      </div>

      {/* Self-hosted video controls and progress */}
      {!isYouTube && videoRef.current && (
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

          {/* Captions toggle */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowCaptions(!showCaptions)}
              className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm font-medium hover:border-accent"
              aria-pressed={showCaptions}
            >
              <span className="text-xs">CC</span>
              {showCaptions ? 'Captions on' : 'Captions off'}
            </button>
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
