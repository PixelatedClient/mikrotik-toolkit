# Affiliate Links Guide

## Overview

Affiliate links are used to generate revenue while providing genuine recommendations to learners. Links are centralized in `src/data/affiliates.ts` and rendered via the `AffiliateLinks` component.

## Adding a New Affiliate

Edit `src/data/affiliates.ts`:

```typescript
{
  name: 'Product Name',
  url: 'https://example.com',
  category: 'hardware' | 'learning' | 'tools' | 'service',
  tags: ['tag1', 'tag2'],
  description: 'What it does and why it matters',
}
```

## Using in Lessons

Import and add to an MDX lesson (use `client:load` or `client:visible` as needed):

```jsx
import AffiliateLinks from '../../../components/AffiliateLinks';

<AffiliateLinks tag="lab" title="Lab Hardware & Tools" />
<AffiliateLinks category="tools" title="Recommended Tools" />
```

## Available Tags

- `lab` - lab equipment and VMs
- `router` - RouterOS hardware
- `certification` - training programs
- `simulation` - network simulators
- `troubleshooting` - diagnostic tools
- `free` - free/open-source options
- `routeros` - RouterOS specific
- `virtualization` - VM and cloud options

## Placement Strategy

- **After lesson intro** - quick reference to hands-on tools
- **Before hands-on sections** - "Here's what you'll need"
- **In tool pages** - context-specific recommendations
- **Lab pages** - lab-specific hardware and simulators

Avoid:
- Cluttering prose with too many links
- Placing before foundational concepts are explained
- Using for unapproved/untested products

## Tracking & Updates

Check affiliate program terms:
- MikroTik → official resellers, no affiliate program yet
- Cisco Learning Network → institutional
- Wireshark → open source
- GNS3 → professional tier referrals

Keep `accessed` dates fresh if you maintain affiliate links tracking.
