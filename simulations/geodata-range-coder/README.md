# Range coder simulation

An interactive, step-through animation of how a CGEODATA version 2 chunk is range
coded and decoded, for the post
[Beating zlib: the cities of the world in 19.5 MiB](../../content/tech/beating-zlib-on-geodata/index.md).

It is a separate project, so that it can use esbuild, TypeScript, Preact and
[motion](https://motion.dev) without going through the site's MDX pipeline. It builds to
one ES module that registers a `<geodata-range-coder>` element.

## Running it

```sh
npm install        # see the note on esbuild below
npm run dev        # http://127.0.0.1:5173/, rebuilds on every save (into dist-dev/)
npm test           # the codec against the spec and against loc-to-city
npm run tsc
npm run build      # dist/geodata-range-coder.js, minified: the file the site imports
```

`package.json` has `allowScripts` for esbuild's postinstall, because this machine's npm runs
with `strict-allow-scripts`.

## What you see

Three views, all driven by the same step:

1. **The records**: the chunk as a grid, with the quadtree appearing as cells split, the
   current cell outlined, and its west and south neighbours marked.
2. **Split flags and guesses**: the quadtree as an array of flags, each record's depth and
   place, how its place was guessed (`W`, `S` or a rank), and the move-to-front list.
3. **The range coder**: the interval being cut at the probability, the actual 32-bit
   arithmetic, the bytes, the cost of every decision, and the probabilities as they learn.

*Encode* goes from records to bytes. *Decode* goes from the bytes back to records: it starts
with nothing but the stream, the record count and the palette size, and the same three views
fill in. A step is one binary decision; the record buttons jump to where a record is finished.
Keys: `←`/`→` step, `Shift` + arrow by record, `Space` plays, `Home` resets.

A step is shown in the order the work happens: the encoder updates the records, then the flags
and guesses, then the range coder, and the decoder goes the other way round, from the bytes up
to the records. Each section updates (text and animation) when its turn comes, 0.3 s apart. A step
backwards undoes them in the opposite order, and a jump (scrubber, record buttons, reset) updates
everything at once. Playing fast shortens the animations to fit. The flush at the end of an
encode only writes bytes, so the records and the arrays stay on the last decision, and an encode
and a decode of the same chunk end on the same records overview.

## A real chunk

`<geodata-real-chunk>` decodes chunk 207623 of `cfbea5e_world_super_res.bin` (35,422 records, 73,480
decisions, a 5,963 byte stream) from its own bytes. It is the same walk and the same decoder, but a
chunk that size cannot keep a step object per decision, so `codec/lite.ts` runs the walk with a sink
that stores a few numbers per decision in typed arrays, and rebuilds the probabilities at any step
from checkpoints. The view keeps only the controls, the records (a canvas, painted record by record),
the stream (a tape that slides past a read head, drawing only the bytes near it) and the busiest
probabilities. It does not decode until it is close to the screen, and the box reserves the height
of the finished view.

`src/real/` holds the chunk: `scripts/extract-chunk.mts <world.bin> <index>` writes it, and
`test/lite.test.ts` checks a decode against the reader's records by checksum, without the 76 MB file.

## Is it faithful?

The codec in `src/codec/` is not a drawing of the algorithm, it is the algorithm. `walk.ts`
is the traversal of Sections 8.7.2 to 8.7.4 of `loc-to-city/reader/binary-format.md`, written
once and used by both directions, so a view can never show the encoder doing something the
decoder would not. `coder.ts` is the range coder of 8.7.1, recording its registers.
`test/codec.test.ts` checks that:

- the spec's Appendix A.6 example gives the stream `00 a5 11 64 ba 00 00`, and the same 24
  decisions in the same order as the table there;
- the decoder takes the encoder's stream back to the same records, decision for decision;
- 2000 random chunks round trip;
- the bytes are identical to `encodeRangeCodedRecords` from loc-to-city's reader, for the
  examples and 500 random chunks (skipped when that checkout is not at the default path,
  or set `LOC_TO_CITY_RANGE_CHUNK`).

The lower part of the interval is the bit `0`, and which answer that is depends on the question
(`0` is "leaf" for a split flag, and "no" for "same as west"). The simulation says which bit
it is, and the post's `range-coding.svg` is drawn the same way.

## Nothing moves

Text that changes with each step wraps onto a different number of lines, which would push
everything below it up and down. `Stable.tsx` fixes that without guessing a height: it lays out
every possible content invisibly in the same grid cell as the visible one, so the cell is always
as tall as the longest at the current width. It is used for the caption, the arithmetic table, the
decision header, the flag row and the byte strip. The price is some empty space under a short caption.

## In the post

The post writes the element and a script tag, with the diagram as the content for readers
without JavaScript (the element draws in a shadow root and has no `<slot>`, so that content is
hidden once the element is defined):

```mdx
<geodata-range-coder mode="encode" example="blog">

![Fallback for readers without JavaScript](range-coding.svg)

</geodata-range-coder>

<script async type="module" src="../../../simulations/geodata-range-coder/dist/geodata-range-coder.js"></script>
```

- The `src` is relative to the post, like an image. `md-compiler/rehype/rehypeMdxAssets.ts`
  imports it as an asset, so it is emitted as
  `/_next/static/simulations/geodata-range-coder/dist/geodata-range-coder.<hash>.js`: the hash
  is in the name, so old and new deploys never fight over one URL, and it gets the long cache of
  `/_next/static/*`.
- `next.config.mjs` makes sure that file is copied byte for byte: Next's script loaders and its
  minifier skip anything imported with `?rehype-asset`.
- `async` is required while the site runs on Next: a plain `<script>` React creates after a
  client-side navigation never runs, an `async` one is moved to `<head>`, loaded once for both
  elements and run.
- The `Dockerfile` builds the bundle in its own stage (tsc, tests, `npm run build`) and copies it
  into the build. Locally, `npm run build-simulations` in the site's root does the same, and
  must have been run before `npm run dev` or `npm run build`. `npm run dev` here writes to
  `dist-dev/`, not to `dist/`.

## Layout

```
src/codec/   types, coder (range coder), walk (the traversal), trace (drivers),
             state (what each step looks like), describe (the words), examples
src/ui/      App, MapView, ArrayView, RangeView, tween (motion), Stable, style.css
src/element.ts
test/        node --test, TypeScript run directly by Node
```
