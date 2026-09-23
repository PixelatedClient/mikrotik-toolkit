# Pkt - The Mascot

Pkt is the yellow router mascot on the home page (drawn in `src/components/PixelHero.astro`). It's a pixel-art character that sends glowing packets toward a castle in the animated Netland scene.

## The team

PKT (Pocket) is also the name of the team that develops Network Academy. The footer and the About page credit it ("Developed by PKT").

## Character Design

- **Name**: Pkt (packet router)
- **Look**: Golden/yellow router with animated eyes and LEDs
- **Behavior**: Bobs up and down, jumps on hover, blinks
- **Accessibility**: Has aria labels and stops animations for users with `prefers-reduced-motion`

## Future: Pkt AI Assistant (Step 18)

Once users can log in (Step 10), Pkt will become an interactive helper:

- **Click/talk to Pkt** → get contextual hints during labs and challenges
- **Smart hints** → understands what you're stuck on (subnetting, BGP config, firewall rules)
- **Difficulty levels** → hints get progressively less spoilery
- **Throttled** → one hint per task to prevent cheating
- **Personality** → friendly, encouraging tone with router/networking emojis

Example interactions:
- "Still stuck on VLSM? Remember: you can fit 3 /26 subnets in a /24!"
- "BGP session down? Check that the remote AS number matches."
- "Firewall rejecting packets? Is this chain ending in a drop-all?"

## Implementation Notes

- `src/components/PixelHero.astro` - Pkt is in the `<g class="pkt">` group (lines 80-84)
- Styles use `.world .pkt`, `.world .pkt-eyes`, `.world .pkt-led` (CSS animations)
- Pkt is clickable (`tabindex="0"`, `role="button"`)
- When AI assistant launches, add event listener to `#pkt-mascot` element
- Hint system: `src/lib/hints/` (subnetting, routing, firewall, etc.)
- Hint state: stored in user profile (once auth exists)

## Roadmap

- **Step 10** (planned): Auth & user accounts
- **Step 18** (planned): Pkt AI Assistant
