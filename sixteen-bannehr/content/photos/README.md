# Photos for the book

Put photos in the folder of the chapter they belong to, then run `npm run import-photos`.

| Folder | Chapter |
|---|---|
| `cover/` | The cover |
| `prologue/` | Prologue — The House on Bannehr Street |
| `approach/` | 1 · The Approach |
| `vault/` | 2 · The Vault |
| `kitchen/` | 3 · A Cook’s Kitchen |
| `archer-bath/` | 4 · The Bath with the Archer |
| `small-bath/` | 5 · The Small Bath |
| `rest/` | 6 · Rest |
| `below/` | 7 · Below |
| `outside/` | 8 · Outside |
| `palette/` | 9 · The Palette |
| `epilogue/` | Still to Decide |

- **Photos directly in a chapter folder** fill that chapter's empty pictures in filename
  order: the opener first, then before/after, full-bleed pictures, the plan and the mood
  board, then any options and materials left over. Name them `01-…`, `02-…` to set the order.
- **Photos in the chapter's `items/` folder** go only to options and materials (the 32
  vanity renders, cabinet samples, appliances), in filename order.
- JPEG, PNG, WebP, TIFF and iPhone HEIC all work. Originals stay here untouched; the book
  gets web copies at 800, 1600 and 2800 px, never larger than the original.
- A photo is placed once. If Sonny removes it in the book, it does not come back.

These originals are not committed to Git (they can be large). The web copies in
`public/photos/` are, so a Git deploy carries them.
