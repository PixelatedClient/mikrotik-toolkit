# Performance Audit - Network Academy

**Date**: 2026-09-23  
**Current Build Size**: 6.3MB (dist/)  
**JS Bundles**: 1.03MB

## Executive Summary

The Network Academy site has good fundamental optimization practices (lazy-loading with `client:visible`, dynamic imports), but has several opportunities to improve bundle efficiency:

1. **Top 3 largest JS bundles** sum to 642 KB (62% of JS):
   - SimLab (229KB) - browser lab simulator
   - dist/Supabase vendor (209KB) - authentication library  
   - client/game bundles (204KB) - game engine and state

2. **Key issues identified**:
   - Monolithic game bundle loads all game types together (Gates: 140KB)
   - Large data files bundled with components (labs, levels, incidents)
   - Some components use `client:load` when `client:visible` would suffice
   - No explicit code-splitting in Astro config

## Bundle Analysis

### JS Breakdown (Top 20)

| Bundle | Size | Type | Used On | Status |
|--------|------|------|---------|--------|
| SimLab | 229KB | Lab simulator | Lesson pages | ✓ Lazy (client:visible) |
| dist/Supabase | 209KB | Vendor | Global (auth) | Needs optimization |
| client/game | 204KB | Game engine | /play, lessons | Loaded early |
| Gates | 140KB | Game runners | /play, /practice, lessons | Monolithic |
| ui | 48KB | Game UI | /play | Bundled w/ Gates |
| ReferenceHub | 24KB | Reference pages | /reference | ✓ Lazy (client:load) |
| AuthBar | 20KB | Auth UI | Every page | Necessary |
| PixelHero | 17KB | Landing animation | Home page | ✓ OK |
| VlanDesigner | 16KB | VLAN tool | /tools/vlan-designer | ✓ Lazy (client:load) |
| SmallCalculators | 14KB | Multi calc | Multiple tools | ✓ Lazy |

### Current Performance (Build Metrics)

- Build time: 5.48s
- Pages generated: 153
- Total dist/ size: 6.3MB
- JS bundles total: 1.03MB
- CSS: ~500KB (estimated, includes Tailwind)
- HTML/Assets: ~4.7MB

## Optimization Opportunities

### 1. Code Split the Games Component (PRIORITY: HIGH)

**Current issue**: Gates.tsx imports all game components, creating a 140KB bundle that's loaded on every /play page even when only one game type is needed.

**Files affected**:
- `src/components/game/Gates.tsx`
- `src/components/game/SubnetGate.tsx` (50KB+)
- `src/components/game/RoutePuzzle.tsx` (40KB+)
- `src/components/game/FirewallDefense.tsx` (30KB+)
- `src/components/game/BreachAttack.tsx` (20KB+)

**Solution**: Use React.lazy() and Suspense to split each game type into its own chunk.

**Estimated savings**: 40-60KB on initial load for level pages (deferred until game type loads).

### 2. Optimize Data Bundling (PRIORITY: MEDIUM)

**Current issue**: Large data files are bundled at compile time:
- `src/data/game/firewallLevels.ts` (383 lines)
- `src/data/game/routeLevels.ts` (316 lines)
- `src/data/game/subnetLevels.ts` (estimated 250+ lines)
- `src/data/labs.ts` (409 lines)
- `src/data/lessonLabs.ts` (293 lines)
- `src/data/nocIncidents.ts` (304 lines)

These are included in multiple bundles.

**Solution**: Move large data files to JSON imports or lazy-load via dynamic imports only on pages that need them.

**Estimated savings**: 50-100KB across bundles.

### 3. Defer Game State on Non-Game Pages (PRIORITY: MEDIUM)

**Current**: `GameHud` (in Base.astro, client:load) pulls in the entire game state, which includes all level data.

**Solution**: 
- Keep GameHud interactive on /play, /practice
- Use client:idle or defer for non-game pages
- Move game state logic into a separate hook only imported on game pages

**Estimated savings**: 30-50KB on lesson pages.

### 4. Split the Simulator Engine (PRIORITY: LOW-MEDIUM)

**Current**: SimLab (229KB) contains the entire CLI and network simulation engine.

**Issue**: This is only used on lesson pages that actually have a lab, but ALL lesson pages need to load it when hydrating (even if not visible initially).

**Solution**: Already uses client:visible (good), but could split CLI commands into separate chunks:
- `src/lib/sim/cli.ts` (831 lines) - parsing and completions
- `src/lib/sim/network.ts` (364 lines) - packet simulation
- `src/lib/sim/device.ts` (385 lines) - device state
- `src/lib/sim/menus-*.ts` - command output formatting

**Estimated savings**: 30-50KB if splitting works well (may not if Astro can't analyze the split boundaries well).

## Recommended Actions

### Phase 1: Quick Wins (1-2 hours)

1. **Split Gates component** → 40KB saved
   - Create `src/components/game/LevelRunnerSplit.tsx` with React.lazy()
   - Wrap each game type in Suspense
   
2. **Move component client directive from client:load to client:idle**:
   - AuthBar: currently client:load (necessary, but could defer on non-auth pages)
   - GameHud: currently client:load (only needed on /play, /practice)
   - Companion: already client:idle (good)
   - SponsorBanner: currently client:load (could be client:idle)

3. **Verify Supabase is dynamically imported** (already done correctly)

### Phase 2: Medium-Term (2-4 hours)

1. **Convert SimLab data imports to lazy** → 15-30KB
   
2. **Split game level data** → 20-40KB
   
3. **Update Astro config** with code-splitting hints

### Phase 3: Long-Term (4+ hours)

1. **Publish data as separate JSON files** instead of importing
   
2. **Implement Route-based code splitting**:
   - Separate bundles for /learn, /play, /tools, /practice

3. **Add Lighthouse CI** to prevent regressions

## Metrics to Track

### Before Optimization
- Home page LCP: ~2.0s (estimate)
- Learn page LCP: ~2.5-3.0s (larger bundle)
- Play page LCP: ~3.0-3.5s (game engine + data)
- Total JS: 1.03MB
- Overall Lighthouse score: 75-85 (estimated)

### Targets After Phase 1
- Home page LCP: <1.5s
- Learn page LCP: <2.0s
- Play page LCP: <2.5s
- JS reduction: -60-100KB
- CLS: <0.1 (already good)
- Lighthouse score: >90

## Implementation Notes

### 1. Split Gates with React.lazy()

Create new file: `src/components/game/LevelRunnerOptimized.tsx`

```typescript
import { lazy, Suspense, type ReactNode } from 'react';
import type { GameKind } from '../../lib/gamify';
import { featureLocked, regionFeature } from '../../lib/features';
import { LockPanel } from '../auth/LockPanel';
import { useAuth } from '../auth/useAuth';

// Lazy load each game type
const SubnetGate = lazy(() => import('./SubnetGate'));
const RoutePuzzle = lazy(() => import('./RoutePuzzle'));
const FirewallDefense = lazy(() => import('./FirewallDefense'));
const BreachAttack = lazy(() => import('./BreachAttack'));

const runners: Record<GameKind, any> = {
  subnet: SubnetGate,
  route: RoutePuzzle,
  defend: FirewallDefense,
  breach: BreachAttack,
};

function Waiting() {
  return <p className="text-sm text-muted" role="status">Loading...</p>;
}

export function LevelRunner({ kind, levelId, region }: Props) {
  const { ready, signedIn } = useAuth();
  const feature = regionFeature(region);
  if (!ready && feature) return <Waiting />;
  if (feature && featureLocked(feature, signedIn)) return <LockPanel feature={feature} />;
  
  const Component = runners[kind];
  return (
    <Suspense fallback={<Waiting />}>
      <Component levelId={levelId} />
    </Suspense>
  );
}
```

### 2. Defer AuthBar on Non-Auth Pages

Modify `src/layouts/Base.astro`:

```astro
---
// Only load AuthBar eagerly on pages with game content
const eagerId = Astro.url.pathname.includes('/play') || 
                Astro.url.pathname.includes('/practice');
---

{eagerId ? (
  <AuthBar client:load />
) : (
  <AuthBar client:idle />
)}
```

### 3. Add Astro Build Config

Update `astro.config.mjs`:

```javascript
export default defineConfig({
  // ... existing config ...
  vite: {
    plugins: [tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'game-ui': ['src/components/game/ui.tsx'],
            'auth-bar': ['src/components/auth/AuthBar.tsx'],
          }
        }
      },
      // Split chunks: one vendor chunk per 200KB
      chunkSizeWarningLimit: 250,
    }
  }
});
```

## Testing Plan

1. **Before changes**:
   ```bash
   npm run build
   # Record: dist/ size, build time, main bundle sizes
   npm run preview
   # Open http://localhost:3000/play in Chrome DevTools
   # Record: LCP, CLS, FCP, TTI
   ```

2. **After Phase 1 changes**:
   - Run same measurements
   - Verify no console errors
   - Test that all game levels load correctly

3. **Before committing**:
   ```bash
   npm test
   # Ensure all tests pass
   ```

## Files to Modify

### Phase 1:
1. `src/components/game/Gates.tsx` - Add lazy imports
2. `src/layouts/Base.astro` - Conditional client directives
3. `astro.config.mjs` - Add build config

### Phase 2:
1. `src/components/game/LevelRunnerOptimized.tsx` - Replace Gates export
2. `src/data/game/*.ts` - Convert to lazy getters

### Phase 3:
1. Create `src/data/*.json` files for large data
2. Create data fetching utilities in `src/lib/`

## Performance Budget

- **JS**: <750KB (gzipped ~200KB)
- **CSS**: <200KB (gzipped ~50KB)
- **LCP**: <2.5s on 4G LTE slow
- **CLS**: <0.1
- **Lighthouse**: >90

## Verification Checklist

- [ ] `npm test` passes
- [ ] No console errors on any page
- [ ] Game levels load and play correctly
- [ ] Auth flows still work (login, logout, password reset)
- [ ] Lab simulator works with client:visible
- [ ] Tools load and calculate correctly
- [ ] Mobile performance improved (test on DevTools)
- [ ] Lighthouse audit score >90 on key pages
