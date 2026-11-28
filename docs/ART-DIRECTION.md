# Art direction — one page

**Working title of the look: “Warm low-poly Telugu village.”**
Warm, hand-crafted Telugu rural life: chunky readable shapes, one
consistent low-poly style, colours taken from the world itself. The game
should look like a storybook of a Telangana/Andhra village at golden hour
— never like a dashboard, never like generic fantasy.

## Palette (design tokens → CSS variables)

| Token | Hex | Use |
|---|---|---|
| `--terracotta` | `#C05A3E` | primary action, roofs, vehicle body, alerts |
| `--turmeric` | `#E8A317` | highlights, coins, ripe crops, selection |
| `--leaf` | `#4C8B3F` | growth, success, grass accents, “go” states |
| `--river-indigo` | `#2D5F7C` | water UI, links, info, fishing |
| `--cotton-cream` | `#F7EFD9` | panel backgrounds, paper surfaces |
| `--ink` | `#1D2B22` | body text (on cream) |
| `--brand-green` | `#1E5631` | existing brand: headers, nav, safe/confirm |
| `--night` | `#15251C` | scrims, dialog overlays (at 70–85 % alpha) |

Rules: no pure `#000`/`#fff`; terracotta and brand-green never compete in
the same cluster (terracotta = game actions, green = chrome/system);
colour-blind-safe pairs (never red/green alone — pair with icon + text).

## Typography

- **Display:** Fraunces (self-hosted, OFL) — titles, big numbers, quest
  banners. Tight leading, slight optical weight bump for on-3D text.
- **UI:** Manrope (OFL) — buttons, labels, body. 600 for labels, 400 for
  prose.
- **Telugu:** Noto Sans Telugu (OFL, already self-hosted as
  `Telugu.woff2`) — always in the stack:
  `font-family: Manrope, "Noto Telugu", sans-serif`. Telugu strings get
  +1 px size and never truncate; test every new string in తెలుగు.
- Scale: 12 / 14 / 16 / 20 / 28 / 40 px; body never below 14 px; numbers
  (`₹`, counts, prices) use tabular figures.

## Shape, outline, shadow

- Radius: **12 px** cards/panels, **999 px** chips and round HUD
  buttons, **8 px** grid slots. One radius family only.
- Borders: 1 px `--brand-green` at 18 % alpha on cream panels; no hard
  black outlines in UI (outlines belong to illustrations).
- Shadow: one soft elevation `0 6px 20px rgba(21,37,28,.18)`; modals add
  a cream scrim at 70 %, not a dimmed world.
- Buttons: filled terracotta (primary) / cream with border (secondary) /
  ghost (icon-only). Press = scale 0.96 + 1 shade darker, 120 ms.

## Icons

- **One sprite, two sources:** Lucide (ISC) as the primary UI family
  (consistent stroke), Kenney Game Icons (CC0) for mechanic-specific
  gameplay art (hoe, rod, sickle, animals, cart). Recolour to palette;
  2 px stroke, 24 px grid. **Emoji are banned as icons** (they render
  blank on some devices — seen in `docs/audit/02`).
- Item/inventory art is baked from the 3D models (same angle, same
  light) so icons and world models always match.

## 3D style

- Low-poly, flat-shaded, chunky proportions (wheels big, handles thick,
  crops readable at 2 m); one shared material model — Lambert-ish with
  vertex-tinted palette colours, no per-object textures except a small
  atlas for faces/signs.
- Consistent light: warm key (golden hour default), cool sky fill, soft
  contact shadows (existing ecoscene shadow batch); light fog for depth.
- All props/vehicles/animals harmonised to the palette table above; a
  pack that clashes gets recoloured or rejected (Phase 2 CI checks this).

## Motion

- UI: 120–180 ms ease-out; panels slide/fade 200 ms; numbers tween
  (coin counter); no infinite looping UI animation.
- World: camera follows with spring damping; harvest/fish events get a
  short particle burst (three.quarks later); everything respects
  `prefers-reduced-motion` (fade only, no travel).

## Voice & layout

- EN + తెలుగు everywhere via the existing message system; short labels,
  verbs first (“Sow”, “Reel!”, “Build”), numbers with ₹.
- Touch-first: ≥48 dp targets, safe-area insets, landscape and portrait
  both usable; nothing hover-only; no browser gestures (zoom, pull-refresh,
  selection, context menu) during play.
