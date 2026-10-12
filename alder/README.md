# Alder

A design atelier for the house you are building: color, framing, texture, light, the pieces that finish a room, and now the real rooms themselves, with a plan, a budget, and an order sheet.

Built with Vite, React 19, TypeScript, Tailwind 4, zustand and three.js. Everything is stored in the browser (localStorage); use **My House → Back up the house** to export a JSON file.

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

## What is in it

- **Studies** – ten photoreal rooms, each with palette, framing, texture, the hard numbers, the pieces, and a one-tap "make it a real room".
- **Catalog** – 70+ pieces with price ranges, lead times, dimensions, why they work, used-vs-new advice and marketplace searches. Add any piece to a real room's list.
- **Ideas** – a composer that rolls a room from mood, light, budget, must-haves and your own notes and colors.
- **Learn** – 16 short lessons with quizzes: color and LRV, texture, framing, light, scale, metals, contrast, measuring, budgeting, order of operations, kitchens, baths, windows, rugs, and a glossary.
- **Studio** – a live three.js model: 25 paints with undertone/LRV/near-equivalents, 7 wall finishes, 8 floors, 6 trim profiles, 6 metals, 9 cloths, ceilings, hour-of-day daylight and lamp warmth, 40+ pieces, side-by-side compare, a rules-based critique ("Read it"), snapshot, palette harmonizer.
- **My House** – real rooms with dimensions, facing, doors and windows; a drag-and-drop 2D plan to scale with a 3D walkthrough of the same room; surfaces that compute quantities (paint gallons, flooring with waste, trim linear feet, curtain panels, tile, counters, rug size, lumens) and installed-cost ranges; an item list with quantities, unit prices, retailer, SKU, lead time, priority and a status pipeline from idea to installed; clearance and overlap checks.
- **Budget** – whole-house rollup with tax, delivery, contingency, by room, by category, by status, room budgets, CSV and print.
- **Orders** – a pipeline board, "what to order first" sequenced by lead time and build order, and an order sheet.
- **Boards** – saves sorted onto named boards; a paper (light) theme.
