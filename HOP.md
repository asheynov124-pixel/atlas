# Hop policy chunk

Drop these files onto the Atlas Expo tree from `atlas.zip`.

```
EXPO_PUBLIC_CORPUS=continuity npx expo start
```

## What landed

1. `src/hop/policy.ts` — `hopStatus` / `hopCopy` / `requestPeek`
2. `src/hop/gate.ts` — re-exports + `openOptions` type
3. `src/state/hops.ts` — persisted watermark clock, namespaced per corpus
4. `src/manifest/continuity.manifest.ts` — Odyssey demo, `features.geo = false`, `hop: 'watermark'`
5. `src/data/mock/continuity.ts` — Book 8 watermark records
6. PeekSheet / useOpenRecord / provider.search / SearchScreen wired
7. `WatermarkCard` for Activity

## Contract

| status | PeekSheet |
|---|---|
| safe | Open here / New tab / Background / Save |
| sealed | Stay / Open as Extra / Step past and move watermark / Save |
| extra | Stay / Open as Extra / Save |
| unborn | Stay only |

`useOpenRecord` with no `{ force: true }` peeks instead of opening when status !== safe.
Search hides unborn names.
No sixth tab.

## Book 8 demo (clock default 8)

- Book 8, Odysseus, Troy, Ithaca Greece — **safe**
- Alcinous, Scheria, Penelope, Ithaca — **sealed**
- The return — **unborn** (hidden from Search)
