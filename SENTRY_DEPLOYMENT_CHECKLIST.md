# Sentry Deployment Checklist

Use this checklist before deploying to production.

## Pre-Deployment

- [ ] Sentry account created at https://sentry.io
- [ ] Sentry project created (select "Astro" framework)
- [ ] DSN copied from Sentry project settings
- [ ] `.env` file updated with `PUBLIC_SENTRY_DSN`
- [ ] `npm install` completed
- [ ] `npm run build` successful
- [ ] No TypeScript errors
- [ ] `/test-sentry` page accessible in development

## Local Testing

- [ ] Visit `http://localhost:3000/test-sentry`
- [ ] Click "Throw JavaScript Error" button
- [ ] Check Sentry dashboard - error appears within 10 seconds
- [ ] Error includes stack trace
- [ ] Error includes browser/OS info
- [ ] Click "Send Debug Message" button
- [ ] Message appears in Sentry
- [ ] Click "Trigger Fetch Error" button
- [ ] HTTP error appears in Sentry with status code

## User Context Testing (with Auth)

- [ ] Log in with test account
- [ ] Check Sentry - new error includes user ID
- [ ] Check Sentry - new error includes user email
- [ ] Log out
- [ ] Trigger error while logged out
- [ ] Check Sentry - error has no user info

## Production Environment

- [ ] `PUBLIC_SENTRY_DSN` set in production environment variables
- [ ] DSN is correct (matches production Sentry project, not staging)
- [ ] Build uses `--production` flag (if applicable)
- [ ] Build completes without Sentry-related errors
- [ ] Site loads without errors in production

## Post-Deployment

- [ ] Wait 5 minutes for CloudFront cache to clear (if using CDN)
- [ ] Visit production site
- [ ] Open browser console - no Sentry errors
- [ ] Trigger a test error (if safe to do so)
- [ ] Check Sentry dashboard for the error
- [ ] Verify error includes correct environment tag
- [ ] Verify error includes correct release (if configured)
- [ ] Test user login/logout on production
- [ ] Verify user context in Sentry

## Monitoring

- [ ] Set up Sentry alerts for critical errors
- [ ] Configure Sentry email notifications
- [ ] Add Sentry dashboard to monitoring dashboard
- [ ] Brief team on how to access Sentry
- [ ] Document Sentry login credentials in team wiki

## Optional Advanced Setup

- [ ] Source map upload configured (requires auth token)
- [ ] Release tracking configured
- [ ] Slack/Discord integration set up
- [ ] Custom error grouping configured
- [ ] Sensitive data filtering configured
- [ ] Performance monitoring dashboard set up

## Rollback Plan

If issues occur:
- [ ] Can quickly unset `PUBLIC_SENTRY_DSN` and redeploy
- [ ] No data loss if Sentry is disabled
- [ ] No performance impact if Sentry is disabled
- [ ] Application works normally without Sentry

## Documentation

- [ ] Team aware Sentry is in place
- [ ] Test page URL documented (/test-sentry - dev only)
- [ ] Sentry dashboard URL shared
- [ ] Emergency contact for Sentry issues documented
- [ ] Runbook updated with Sentry troubleshooting

## Sign-Off

- **Deployed by:** __________________ 
- **Date:** __________________ 
- **Verified by:** __________________ 
- **Date verified:** __________________

## Notes

```
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________
```

---

**Quick Links:**
- Sentry Dashboard: https://sentry.io/
- Test Page (dev only): http://localhost:3000/test-sentry
- Setup Guide: SENTRY_SETUP.md
- Quick Start: SENTRY_QUICK_START.md
