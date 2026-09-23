# Sentry Error Tracking - Documentation Index

Welcome! Sentry error tracking has been successfully integrated into Network Academy. This index will help you navigate the documentation.

## Start Here (Pick One)

### For Developers (5 minutes)
**→ Read:** `SENTRY_QUICK_START.md`

Quick setup guide with:
- How to get your DSN
- How to add it to your environment
- How to test it works
- Common functions to use in code

### For Operations/DevOps (15 minutes)
**→ Read:** `SENTRY_DEPLOYMENT_CHECKLIST.md`

Deployment verification checklist with:
- Pre-deployment checks
- Local testing procedures
- Production verification
- Rollback procedures
- Sign-off template

### For Reference/Deep Dive (30 minutes)
**→ Read:** `SENTRY_SETUP.md`

Complete reference guide with:
- What Sentry does
- Full feature breakdown
- Configuration details
- Advanced setup options
- Privacy & security
- Troubleshooting guide

## Quick Reference

### Essential Files

**Production Code:**
- `src/scripts/sentry.ts` - Main initialization
- `src/scripts/sentry-fetch.ts` - Fetch error wrapper
- `src/components/ErrorBoundary.tsx` - React error boundary
- `src/layouts/Base.astro` - Loads on all pages

**Configuration:**
- `astro.config.mjs` - Sentry integration
- `package.json` - Dependencies (@sentry/astro, @sentry/react)
- `.env.example` - PUBLIC_SENTRY_DSN variable

**Testing:**
- `src/pages/test-sentry.astro` - Verification page at `/test-sentry`

**Documentation:**
- This file (you are here)
- `SENTRY_IMPLEMENTATION_SUMMARY.md` - What was implemented
- `SENTRY_FILES_CREATED.txt` - File manifest
- `SENTRY_QUICK_START.md` - Get started in 5 minutes
- `SENTRY_SETUP.md` - Complete reference
- `SENTRY_DEPLOYMENT_CHECKLIST.md` - Deployment verification

## What Gets Tracked

### Automatic (No Code Changes)
- ✓ JavaScript errors
- ✓ Promise rejections
- ✓ React component errors
- ✓ HTTP/Fetch failures
- ✓ Core Web Vitals
- ✓ Navigation events

### Manual (Use When Needed)
```typescript
import { captureError, captureMessage, addBreadcrumb } from '../scripts/sentry';

// Capture error
captureError(error, { context: 'my-function' });

// Send message
captureMessage('Something important', 'info');

// Track action
addBreadcrumb('User clicked button', 'user-action');
```

## Setup in 3 Steps

### 1. Get Your DSN
- Go to https://sentry.io
- Create an account (free)
- Create a new project (select "Astro")
- Copy your DSN

### 2. Add to Environment
Add to `.env`:
```
PUBLIC_SENTRY_DSN=https://your-key@sentry.io/your-project-id
```

### 3. Test It
```bash
npm run dev
# Visit http://localhost:3000/test-sentry
# Click buttons to trigger errors
# Check Sentry dashboard
```

## Verify Setup Works

1. Start dev server: `npm run dev`
2. Visit: `http://localhost:3000/test-sentry`
3. Click: "Throw JavaScript Error"
4. Check: Sentry dashboard (should show error in 10 seconds)
5. Verify: Error includes stack trace, browser info, etc.

## Most Common Questions

**Q: Do I need a Sentry account?**  
A: Yes, create one at https://sentry.io (free tier available)

**Q: Will this slow down my site?**  
A: No, Sentry has negligible performance impact (<5ms initialization)

**Q: What if I don't set the DSN?**  
A: Sentry will gracefully disable with no impact on your app

**Q: Can I disable it later?**  
A: Yes, just remove `PUBLIC_SENTRY_DSN` and redeploy

**Q: Will it capture passwords?**  
A: No, Sentry filters sensitive data automatically

**Q: What about GDPR/privacy?**  
A: Sentry is GDPR compliant. See SENTRY_SETUP.md for details.

## Deployment

Before deploying to production:

1. ✓ Create Sentry project
2. ✓ Add DSN to production environment variables
3. ✓ Run `npm run build` successfully
4. ✓ Test with `/test-sentry` page
5. ✓ Deploy
6. ✓ Verify errors appear in Sentry

See `SENTRY_DEPLOYMENT_CHECKLIST.md` for detailed procedures.

## File Organization

```
Network Academy/
├── SENTRY_INDEX.md (this file - overview)
├── SENTRY_QUICK_START.md (get started in 5 min)
├── SENTRY_SETUP.md (complete reference)
├── SENTRY_DEPLOYMENT_CHECKLIST.md (pre-deployment)
├── SENTRY_IMPLEMENTATION_SUMMARY.md (what was built)
├── SENTRY_FILES_CREATED.txt (file manifest)
│
├── src/
│   ├── scripts/
│   │   ├── sentry.ts (init & helpers)
│   │   └── sentry-fetch.ts (fetch wrapper)
│   ├── components/
│   │   └── ErrorBoundary.tsx (React errors)
│   ├── layouts/
│   │   └── Base.astro (loads Sentry)
│   └── pages/
│       └── test-sentry.astro (test page)
│
├── astro.config.mjs (+ Sentry integration)
├── package.json (+ Sentry dependencies)
└── .env.example (+ DSN variable)
```

## Key Concepts

### Sampling
- **Traces:** 10% in production (1 in 10 requests logged)
- **Errors:** 100% in production (all errors captured)
- **Sessions:** 10% recorded, 100% on error

### Environments
- **Production:** Full monitoring
- **Preview:** Full monitoring
- **Development:** Full monitoring + higher trace rate

### User Tracking
- When logged in: User ID and email sent to Sentry
- When logged out: No user info sent
- Helps you find errors for specific users

### Breadcrumbs
Show sequence of events leading to an error:
- Navigation (user clicked link)
- HTTP calls (API requests)
- User actions (custom events)

## Support

- **Sentry Docs:** https://docs.sentry.io/
- **Discord:** https://discord.gg/Wjxnqf8
- **Issues:** Check browser console for errors

## Documentation Checklist

What you should read based on your role:

**Frontend Developer:**
- [ ] SENTRY_QUICK_START.md (5 min)
- [ ] Using captureError/captureMessage examples
- [ ] Test the /test-sentry page

**DevOps/SRE:**
- [ ] SENTRY_DEPLOYMENT_CHECKLIST.md (15 min)
- [ ] Production environment setup
- [ ] Alert configuration in Sentry

**System Admin:**
- [ ] SENTRY_SETUP.md - Privacy section
- [ ] Data retention policies
- [ ] Access control in Sentry

**Team Lead:**
- [ ] SENTRY_IMPLEMENTATION_SUMMARY.md (overview)
- [ ] Brief team on new error tracking
- [ ] Assign Sentry access

## Next Steps

1. **Read:** Pick a guide above based on your role
2. **Setup:** Follow the quick start guide
3. **Test:** Use the /test-sentry page to verify
4. **Deploy:** Use the deployment checklist
5. **Monitor:** Check Sentry dashboard regularly

---

**Status:** ✓ Fully Implemented and Tested  
**Build:** ✓ Successful  
**Ready for:** Production Deployment  

**Questions?** See the relevant documentation file above.
