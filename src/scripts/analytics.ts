// Plausible Analytics integration for Network Academy
// Tracks: lesson completion, quiz scores, level wins, affiliate clicks, auth events, tool usage

const DOMAIN = import.meta.env.PUBLIC_PLAUSIBLE_DOMAIN as string | undefined;

/** Initialize Plausible analytics. Call this once on page load. */
export function initAnalytics(): void {
  if (!DOMAIN || typeof window === 'undefined') return;

  // Load Plausible script if not already loaded
  if (!window.plausible) {
    const script = document.createElement('script');
    script.defer = true;
    script.async = true;
    script.setAttribute('data-domain', DOMAIN);
    script.src = 'https://plausible.io/js/script.js';
    document.head.appendChild(script);
  }
}

/** Send a custom event to Plausible. */
function trackEvent(eventName: string, props?: Record<string, string | number | boolean>): void {
  if (!DOMAIN || typeof window === 'undefined') return;

  // Use the plausible function if available (injected by the script)
  if (window.plausible) {
    window.plausible(eventName, { props });
  }
}

/**
 * Track lesson completion.
 * @param lessonId The lesson ID (e.g., "foundations/01-intro")
 */
export function trackLessonCompletion(lessonId: string): void {
  trackEvent('Lesson Completion', { lesson_id: lessonId });
}

/**
 * Track quiz results.
 * @param lessonId The lesson ID
 * @param score The score as a percentage (0-100)
 * @param passed Whether the quiz was passed (70%+)
 */
export function trackQuizResult(lessonId: string, score: number, passed: boolean): void {
  trackEvent('Quiz Result', {
    lesson_id: lessonId,
    score,
    passed,
  });
}

/**
 * Track game level wins (subnet, route, firewall levels).
 * @param levelId The level ID (e.g., "subnet-1", "route-advanced-1")
 * @param stars The number of stars earned (1-3)
 * @param levelType The type of level (subnet, route, fw)
 */
export function trackLevelWin(levelId: string, stars: number, levelType: 'subnet' | 'route' | 'fw'): void {
  trackEvent('Level Won', {
    level_id: levelId,
    stars,
    level_type: levelType,
  });
}

/**
 * Track affiliate link clicks.
 * @param partnerId The partner/affiliate ID
 * @param partnerName The partner name
 * @param category The affiliate category (hardware, learning, tools, service, hosting)
 */
export function trackAffiliateClick(
  partnerId: string,
  partnerName: string,
  category?: string
): void {
  trackEvent('Affiliate Click', {
    partner_id: partnerId,
    partner_name: partnerName,
    ...(category && { category }),
  });
}

/**
 * Track authentication events.
 * @param eventType The auth event type (signup, login, logout, password_reset)
 */
export function trackAuthEvent(eventType: 'signup' | 'login' | 'logout' | 'password_reset'): void {
  trackEvent(`Auth ${eventType.charAt(0).toUpperCase()}${eventType.slice(1)}`, {
    event_type: eventType,
  });
}

/**
 * Track tool usage (calculator, config generator, VLAN designer, etc.).
 * @param toolName The tool name (e.g., "subnet-calculator", "config-generator")
 * @param action The action (view, generate, export, etc.)
 */
export function trackToolUsage(toolName: string, action: string = 'view'): void {
  trackEvent('Tool Usage', {
    tool_name: toolName,
    action,
  });
}

/**
 * Track lab activity.
 * @param labId The lab ID
 * @param action The action (start, complete, verify, etc.)
 */
export function trackLabActivity(labId: string, action: string = 'view'): void {
  trackEvent('Lab Activity', {
    lab_id: labId,
    action,
  });
}

/**
 * Track practice/training activity.
 * @param topicId The practice topic ID (e.g., "subnetting", "routing")
 * @param action The action (start, complete, daily_challenge, etc.)
 */
export function trackPracticeActivity(topicId: string, action: string = 'view'): void {
  trackEvent('Practice Activity', {
    topic_id: topicId,
    action,
  });
}

/**
 * Track NOC (Network Operations Center) incident handling.
 * @param incidentId The incident ID
 * @param action The action (start, solve, view_solution, etc.)
 */
export function trackNocActivity(incidentId: string, action: string = 'view'): void {
  trackEvent('NOC Activity', {
    incident_id: incidentId,
    action,
  });
}

/**
 * Track badge awards.
 * @param badgeId The badge ID
 * @param badgeName The badge name
 */
export function trackBadgeAwarded(badgeId: string, badgeName: string): void {
  trackEvent('Badge Awarded', {
    badge_id: badgeId,
    badge_name: badgeName,
  });
}

/**
 * Track sponsor banner interactions.
 * @param action The action (view, dismiss, click, etc.)
 */
export function trackSponsorBannerInteraction(action: string): void {
  trackEvent('Sponsor Banner', {
    action,
  });
}

// Extend Window to include Plausible function
declare global {
  interface Window {
    plausible?: (eventName: string, options?: { props?: Record<string, any> }) => void;
  }
}
