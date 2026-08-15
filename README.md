

## Known limits

- A component that gets split and reused in two places (half the dough as base,
  half crumbled on top) doesn't fit the merge-tree model. Extraction is told to
  flag it in `notes` rather than force a bad diagram.
- More than three ingredient groups fails colour-vision-deficiency checks, so
  the app turns colour coding off and says why instead of rendering a palette
  that can't be read. Merge groups down to three in the editor to get it back.
- Shareable links carry the whole recipe in the URL fragment. Very long recipes
  make very long links, and some chat apps truncate them.
