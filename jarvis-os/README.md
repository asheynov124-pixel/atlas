# Jarvis OS Mark I

Private local HUD for Adelin’s Jarvis partner.

**North star:** expand knowledge and capability. Idea→build is one instrument — never the default.

## Layout (HUD Forge)

- Left — inspector + search (unborn names hidden)
- Center — mock force-layout knowledge/capability graph
- Right — lead ring, watermark control, independent lead moves, activity inbox
- Bottom — command bar (`/lead`, `/depth N`, or search)

## Hop gate

Watermark depth gates nodes: `safe` / `sealed` / `unborn` (see [`src/hop/policy.ts`](src/hop/policy.ts)). Sealed nodes open a Peek sheet: Stay, Open as Extra, or Step past and move watermark.

## Run

Requires **Node.js ^20.19** or **≥22.12** (Vite 7; not Node 21 or 22.0–22.11).

```bash
cd jarvis-os
npm install
npm run dev
```

Production build: `npm run build` → `dist/`.

## Next wires

- Cortex Index (replace mock graph)
- Oracle Core citation contract
- Link Ops / Voice Ring / Gesture Deck mode APIs
