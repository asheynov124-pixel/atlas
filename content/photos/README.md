# Photos

Drop photos here, one folder per chapter, then run `npm run import-photos`.

```
content/photos/
  front/          the cover
  prologue/
  approach/       chapter 1
  vault/          chapter 2
  kitchen/        chapter 3
  bath-archer/    chapter 4
  small-bath/     chapter 5
  rest/           chapter 6
  below/          chapter 7
  outside/        chapter 8
  palette/        chapter 9
  epilogue/
```

JPG, PNG, WebP and HEIC all work. Files are placed in filename order into
that chapter's empty image slots, so name them `01-front.jpg`, `02-porch.jpg`
and so on. Originals are kept, untouched, next to the WebP variants in
`public/photos/`. Neither folder is committed to git.
