---
date: "2026-10-21"
tags: ["tech", "geo", "compression", "binary-format", "openstreetmap", "typescript"]
coAuthors:
    - name: Claude Opus 5
      url: https://claude.com/claude-code
thumbnail:
    image: ./the-netherlands.png
    link: https://geodata.ferrybig.nl/
    alt: Netherlands as mapped by this tool
---
# Compressing the cities of the world into a mere 45 megabytes

I started [loc-to-city](https://github.com/ferrybig/loc-to-city) because my favorite photo manager kept telling me the wrong city. It has since turned into something I keep reaching for in other projects, so this post is about the tool and the file format it produces, not about the photo manager. The headline I still find hard to believe: every country, region and city boundary on Earth, at a resolution of roughly 300 by 150 metres, in a single 45 MB file that answers a lookup without ever reading more than a small slice of it.

Every colleague I showed this to guessed the file would be ten to a hundred times bigger, so somewhere between 700 MB and 7 GB. That is a fair guess for the obvious approaches: shipping the polygons themselves costs 1 to 10 GB depending on how much they are simplified, and my own build pipeline carries 5.5 GB of them as its intermediate form.

## What the tool actually is

Five TypeScript packages. The one that matters to users is `reader/`, published as `@ferrybig/cgeodata-reader`, which has zero runtime dependencies beyond Node's built-in `zlib` and also runs in a browser:

```ts
import { openFile } from "@ferrybig/cgeodata-reader/node";

const reader = await openFile("world.bin");
const result = await reader.query(35.6762, 139.6503);

result.country?.internationalName; // "Japan"
result.region?.localName;          // "東京都"
result.region?.internationalName;  // "Tokyo"
result.city?.localName;            // "杉並区"
```

There is a CLI for the same thing, which is usefull to quickly poke a single data point (great for LLM based coding agents)

```sh
cgeodata lookup world.bin 52.37,4.9
cgeodata search world.bin amsterdam --sort
cgeodata info   world.bin
```

The other four packages are `compressor/` (GeoJSON in, `.bin` out), `data-ingest/` (everything OpenStreetMap-shaped, driven by osmium), `verify/` (spot-checks against a hand-written ledger of known-wrong places) and `demo/` (a Leaflet page where you click a point and get an answer, plus a tile overlay that paints every pixel by the city it resolves to).

During development I decided to document the binary format I used inside, [binary-format.md](https://github.com/ferrybig/loc-to-city/blob/master/reader/binary-format.md), this was because the complixity of the file format became huge and too much to remember.

## Why not just store one point per city?

That is what almost everything does, and it is what the system I was replacing does: one `(lat, lon)` per named place, and "which city is this?" becomes a nearest-neighbour search. It costs 112 MB worldwide and it is wrong a lot.

Cities are not points. They are irregular polygons, and a big city's label point is often further from you than a small neighbour's label point even while you are standing well inside the big city. The Python prototype I started with measured this against real Dutch boundaries: nearest-point agreed with the truth **26 to 46%** of the time, and within a metre of a real border it dropped to 25%. Which is exactly where geotagged photos tend to land, because borders follow roads and rivers and people take photos there.

A few real ones:

```
52.488789, 4.794346  is Wormerveer, not Zaandijk
52.034656, 4.388124  is Den Haag, not Nootdorp
51.970738, 4.123725  is Europoort, not Hoek van Holland
```

My favourite is the opposite case, where the correct answer looks wrong. `52.683459, 5.295410` is open water in the IJsselmeer, several kilometres from anything, and it genuinely resolves to **Lelystad**, whose municipal boundary swallows most of the surrounding lake. Every method that asks "which polygon contains this point" agrees on that. Only nearest-point disagrees, and only by accident.

## Why not store the polygons then?

The polygons of OSM are highly detailed, but it is very hard to know what points you can or cannot move, they tend to re-use points, if you remove 1 point at one polygon, but not at another, you get deadzones in the data. During the development of the file format, I played around with simplified polygons for large countries like Russia and Germany. This created artifacts in the data that were unwanted.
Also, the Netherlands alone is 41.5 MiB of uncompressed GeoJSON, and that is one small country with unusually good data.

So I benchmarked four approaches against each other on the Netherlands, with exact point-in-polygon as the ground truth:

| | Approach | On disk | Accuracy | Query |
|---|---|---|---|---|
| A | Nearest labelled point | 55 KiB | 26 to 46% | ~14 to 21 µs |
| B | Exact point-in-polygon | 41.5 MiB | 100% (it *is* the truth) | ~24 to 41 µs |
| C | Adaptive grid, polygons as fallback | 0.60 MiB + the polygons | 100% | ~6 µs inside, ~39 µs near a border |
| D | Adaptive grid, ambiguity resolved at build time | 0.54 MiB, nothing else | ~97% | ~7 µs |

D won, and the interesting part is *why* it won on size. C and D store the same grid. The difference is that C keeps the polygons around so it can fall back to exact maths at a border, and D decides the border cells once, while building, and then throws the geometry away.

**The shipped file contains no geometry at all**, not a single polygon. The reader never sees a coordinate pair that wasn't a query. That is the single biggest reason the format is small, and we can only choose it because we are willing to be approximately wrong in a thin band along every border.

## So what is in there instead?

A quadtree, flattened.

Take a square patch of the world and ask which places overlap it. Throw away the ones whose polygon misses it entirely, and the ones that are only in the list because they contain something more specific that is also in the list, since a province is irrelevant here if one of its own cities is still in the running. If *every* place that survives covers the whole patch, write one record for it and stop. Otherwise somebody's boundary runs through the patch, so cut it into four and start again. At the depth cap we cannot split any further, so we sample the cell on a 5 × 5 grid and give it to whichever place wins most of the 25 points.

The condition for stopping is worth being precise about. It is not "one place wins the cell". It is "no boundary passes through the cell". A cell that is 99% Amsterdam and 1% Diemen is *not* finished: it gets split, and so do its children, all the way down. Then, on the way back up, four children that all came back with the same answer collapse into one record for their parent.

Then number every leaf cell with its [Morton code](https://en.wikipedia.org/wiki/Z-order_curve) (interleave the bits of its row and column) and sort. Morton order is quadtree order, so a sorted list of codes *is* the tree, and a lookup is one binary search over integers.

![A quadtree over a single chunk, and the two parallel arrays it is stored as](quadtree-to-columns.svg "How one chunk gets small")

The thing that makes this cheap is in the left half of that picture. A record costs the same whether it covers one cell or a quarter of the chunk, so the inside of a city is nearly free, and only the boundary is expensive. Boundaries are one-dimensional and area is two-dimensional, so we end up paying for the perimeter of the world's cities rather than for their surface.

Step 5 in that picture was not there when I first drew it, and it is why the file was already smaller by the time anyone but me had read this post.

I drew an earlier version of this diagram from memory and got it wrong: I showed a cell with the boundary clipping one corner as a single large record, because I assumed the rule was "one place wins the cell". It isn't. Any boundary passing through a cell splits it, so a border is a band of finest cells, not a staircase of big ones. Fixing the drawing meant reading the subdivision code properly, and that turned up something else: **once a cell had been split, its children were never merged back.** Four siblings that all resolved to the same place stayed four records, even though the parent cell covers exactly the same ground and gives exactly the same answer.

So I counted. On the worldwide file as it then stood, a single bottom-up merge pass would have removed 45,954,924 of 166,081,761 records. I guessed the file would barely shrink, on the grounds that zlib was already eating the long runs of identical depths and palette indices those records produce, and that merging would break some of those runs up.

That guess was wrong. The merge cascades, because a merged parent can itself become one of four mergeable siblings, so the real reduction is **36.0% of the records, 166,081,761 down to 106,377,942**. And the file:

```
                 before        after
records     166,081,761  106,377,942   -36.0%
bytes        75,935,694   64,244,778   -15.4%
chunk bytes  73,911,162   62,220,461   -15.8%
```

zlib's loss on the shortened runs is real but small next to the win from dropping a third of the varint deltas: 5,748 chunks got smaller, 15 got bigger. Lookups got faster too: a cold query in the densest chunk went from 17.9 ms to 9.5 ms, because there is a third less to decode.

The subtle part is the condition. It is not enough that four children each came back as a single record for the same place; they must each be a record *at the child depth*. A child that only one place touches a corner of also comes back as exactly one record, but a smaller and deeper one, and merging four of those hands the place all the empty cells in between. On the first worldwide build that invented 88,542 records of ocean, caught only because the output disagreed with an independent simulation by exactly that count.

Drawing that diagram made me look at the bottom row longer than I meant to. Nearly every stored code was simply the end of the record before it: the next one picks up exactly where the previous cell's span ran out. The only thing that ever broke the pattern was a gap, a stretch of unplaced cells between two records. Make the gap an explicit record instead of a silent skip, and there is nothing left for the codes array to say that the depths array does not already say: a reader can get a cell's code by walking the chunk and adding up depths as it goes.

That became [CGEODATA version 1](https://github.com/ferrybig/loc-to-city/pull/7): the codes array is gone, and an empty stretch of cells is now an explicit "no place" record instead of a silent skip. Measured on the real rebuilt file, not a prototype:

```
             v0, codes stored   v1, codes derived
records          106,377,942          110,148,645    +3.5%
bytes             64,244,778           47,620,804   -25.9%
chunk bytes       62,220,461           45,596,905   -26.7%
```

The extra 3,770,703 records are the gaps, which used to cost nothing and now cost one record each. They are cheap anyway: a long run of identical depths and index-0 palette indices is exactly what zlib likes. Losing the codes array outright pays for them several times over.

I gave version 1 chunks the same WebAssembly decoder version 0 already had, then reverted it a day later. Measured across the whole file, deriving codes in WebAssembly instead of plain JavaScript saved about 16 microseconds per chunk, not enough to justify a second compiled decoder and its own fuzz tests. Version 0 files still decode through WebAssembly; version 1 does not. The honest cost of that shows up in a cold lookup: Paris, which used to resolve in 9.5 ms, now takes about 13 ms, because the arithmetic a compiled module used to do now runs as plain JavaScript on every chunk a query happens to land in. The file got smaller and a cold query got slower, in the same release.

## How does 17 billion cells fit in 45 MB?

Let me do the arithmetic that makes this sound impossible first.

The worldwide file uses a 128 × 128 grid of chunks and a quadtree depth of 10, which works out to 131,072 × 131,072 cells across the planet. That is **17,179,869,184** cells, each about 306 m wide and 152 m tall at the equator. There are 274,171 distinct places, so a place id needs 19 bits. If we stored one id per cell we would need

```
17,179,869,184 cells × 19 bits = about 40 GB
```

Nobody would ship that, and it is not what the 1 to 10 GB above refers to. It is just the upper bound the grid starts from, before any of the structure below is applied. The actual file is 47,620,804 bytes, so **857 times smaller** than the dense grid, and 115 times smaller than the 5.5 GB of polygons it was built from.

Where does it go? The quadtree collapses those 17.18 billion cells into **110,148,645 records on disk** — 106,377,942 real places plus 3,770,703 explicit gaps, now that a gap needs its own record rather than a skipped code — a factor of 156 on its own. Then those records are stored in 47.6 MB, which works out to **0.43 bytes per record**: a depth and a place reference, well under half a byte each.

Three things get us there. The prototype measured the last two on a 954,497-record dataset, so I can put real numbers on them:

1. **Don't store cells, store leaves.** The quadtree collapses every uniform area into one record. This is the big one, and it is the one that makes the other two possible.
2. **Delta-code the sorted codes as varints.** Consecutive Morton codes are close together, so most deltas fit in one or two bytes instead of a fixed eight. The code stream went from 7.6 MB to under 1 MB, and the whole blob from 7,744,895 bytes to 3,824,888. (The shipped format has since gone one step further and dropped codes from storage entirely — covered above.)
3. **Then zlib it.** 632,143 bytes, 12× smaller than the naive fixed-width encoding.

The step I did not expect to matter is hiding in there, and it does not show up on its own: **storing the three arrays separately rather than as a list of records.** That change is free. The same numbers go into the file in the same order, just grouped by kind instead of by record, so it saves nothing at all before compression. What it does is put all the depths next to each other, and all the palette indices next to each other, and all the small deltas next to each other, so the compressor finally has runs to find instead of a stream of interleaved unrelated bytes. Reordering nothing is what made step 3 worth 6×.

## Why zlib, when zstd exists?

I measured that too: on the same blob, zlib got 523 KB, zstd `-19` got 427 KB and brotli `-q11` got 423 KB. So the modern compressors win by 10 to 20%.

I used zlib anyway, because the delta-varint columnar layout had already captured most of the available gain, and because zlib is the one compressor that is built into both Node.js (`zlib.inflateSync`) and every browser (`DecompressionStream('deflate')`). Paying a native addon or a WASM blob as a dependency, in exchange for 15%, in a library whose entire selling point is that it has no dependencies, was not a trade I wanted.

## What does the file look like?

Four sections, no padding, no trailer.

![The four sections of a CGEODATA file: header, directory, place table, and one compressed block per chunk](file-layout.svg "CGEODATA file layout")

The directory is the part that makes partial reads work. It lists the byte length of every chunk, in order, so a reader sums the prefix once at load time and then knows exactly where any chunk lives. A length of `0` means that chunk is empty and nothing is stored for it at all, which is how the oceans cost almost nothing: 8,776 of the 16,384 chunks are empty.

The place table is the other surprise. All 274,171 names, with their hierarchy and their alternative spellings, are 2,000,931 bytes. **4.2% of the file.** The hierarchy itself is almost free because it is never stored as parent pointers: places are numbered so that all countries come first, then all regions grouped by country, then all cities grouped by region, and the file only records *how many children each parent has*. Parent lookup is a binary search over a prefix sum.

Names are split into blocks of 128 and each block is deflated separately, so recovering one name means inflating about two kilobytes rather than two megabytes. I tested several block sizes on the worldwide file:

| Names per block | Place table | Resolving one place | Scanning every name |
|---|---|---|---|
| 8192 | 1.64 MB | 4.9 ms | 134 ms |
| 512 | 1.82 MB | 0.9 ms | 141 ms |
| 128 | 2.05 MB | 0.7 ms | 152 ms |
| 32 | 2.53 MB | 1.4 ms | 210 ms |

128 is the sweet spot. Below that the per-block zlib framing and the longer length table start costing more than the finer granularity saves.

## How is a lookup fast when the file is 45 MB?

It never reads 45 MB. A lookup reads the header and the directory once (about 23 KB), and after that it reads exactly one chunk, inflates it, and binary searches it. Most chunks are a few kilobytes; the very worst one in the world, a square covering Belgium and the French border, is 155 KB compressed and holds 270,514 records — the same count as before, since that chunk has almost no gaps for version 1 to pay for. Nothing else in the file is touched.

From the benchmark suite, on the worldwide file:

```
open                                     10.30 ms
query, cold   Paris / Tokyo / Amsterdam  13.03 / 3.56 / 3.77 ms
query, warm                               0.06 ms
search "berlin" --sort, cold / warm      37.04 / 1.70 ms
300 cold lookups, concurrent            192.08 ms
memory after open                         100 MB RSS
```

The cold numbers are entirely "how big is the chunk the query landed in". Paris is in a dense chunk; Amsterdam is not. Once a chunk is decoded it stays in an LRU cache, and then a lookup costs well under a tenth of a millisecond, which is why the map tile renderer in the demo is usable at all: neighbouring pixels share a chunk.

The chunk decoder used to be the one place WebAssembly paid for itself: turning stored codes back into absolute ones was a tight loop over a few hundred thousand values, worth moving into a compiled SIMD module. Version 1 chunks have no codes to turn back into anything; deriving them is one running sum over the depths array, which is cheap enough in plain JavaScript that the WebAssembly version of the same idea was not worth keeping, as the earlier section covers. Version 0 files still decode through WebAssembly; the file this whole post is now measured against does not.

## How can search be fast when it matches anything?

This was the part I expected to be easy and wasn't. `search("dam")` should find Amsterdam, Zaandam and Rotterdam. `search("munchen")` should find München. Substring matching, diacritic-insensitive, over 274,171 places, each with several alternative names. The naive version inflates and scans every name in the file, which is not fast.

The answer is a **trigram index**, shipped as an optional sidecar file. Every run of three consecutive characters in every name gets a list of the places that contain it. A query of three or more characters only has to intersect the lists of its own trigrams, and only places present in *all* of them can possibly match.

Two details make it actually work:

- **The lists are allowed to be wrong in one direction only.** Every stage of the folding (strip diacritics, lowercase, bucket all digits together, bucket all punctuation together) is many-to-one, so the candidate set is always a superset of the true matches. The reader then confirms every candidate by comparing the actual names, exactly as it would without an index. A corrupt or stale index can make a search slow or make it miss things; it can never make it return a wrong answer.
- **Non-Latin trigrams get hashed into a shared pool** of 32,768 lists, alongside the 21,952 lists that the 28 Latin symbols generate on their own. The earlier version mapped every non-Latin letter to a single "other" symbol, which meant a three-letter Cyrillic query left all 36,000-odd non-Latin cities as candidates. Hashing fixed that without making the file meaningfully bigger.

What about one- and two-character queries, which have no trigram at all and match nearly everything? We cannot index our way out of that, so the file just stores the answer: for every one- and two-character string that occurs anywhere in any name, the top five places in relevance order, precomputed. 25,497 keys, about 365 KiB, binary searched by key.

The whole search index is 4.26 MB against a 45 MB main file. Measured end to end, opening both files fresh for every query:

| | 1 char | 2 chars | 3 chars | 5 chars | 8 chars |
|---|---|---|---|---|---|
| With the index | 11 ms | 10 ms | 26 ms | 13 ms | 12 ms |
| Without | 181 ms | 141 ms | 138 ms | 136 ms | 135 ms |

Intersecting the lists takes well under a millisecond. Everything in the three-character column is the cost of *confirming* candidates, because the commonest trigrams still have thousands of them, and confirming one means inflating the name block it lives in. Which is how the block size experiment above ended up mattering far more than the index did.

## How do I know any of it is right?

I don't, which is why there is a 3,000-line file called [countries.md](https://github.com/ferrybig/loc-to-city/blob/master/countries.md) with a section per country and a status marker on every finding: *fixed*, *open*, *unsolvable*, *false positive*, or *human error*. Currently 52 open and 4 unsolvable.

Almost all of it was found by staring at the demo's tile overlay, which paints each cell by the city it resolves to. Wrong data looks wrong immediately in a way it never does in a table.

A sample of what is actually out there:

**"City" doesn't mean anything.** There is no administrative level that means "city" worldwide. The Netherlands has survey-grade `admin_level=10` boundaries straight from the national address register. Most of the US resolves at the county level. France uses communes, Australia gazetted localities. Picking the right level per country is a 112-section research problem and it is most of the project's actual difficulty.

**Picking the level by coverage is a trap.** Germany's ordinary municipality level covers 96% of the country's land area, so by any coverage metric it is done. It also excludes all ~107 *kreisfreie Städte*, the cities that are legally their own district, which is where a third of the names anyone would search for live. That is why there is a separate spot-check that queries capitals and major cities by name rather than trusting a percentage.

**Capitals often aren't cities.** Vienna, Prague, Minsk, Kyiv, Moscow, Berlin, Washington DC: in OpenStreetMap these are *region*-level units with nothing beneath them, so a lookup can correctly say "the region of Vienna" and never "the city of Vienna", because no such polygon exists. There is now a hand-reviewed list that re-emits the region's own polygon as a city of the same name, which fixed 24 capitals in one pass. It does not fix Tashkent, Yerevan or Astana, where the level below the capital-region isn't empty, it is a grid of districts with entirely different names. There is simply no shape anywhere in the data that means "the capital, as a city".

**Dependencies overlap their parents, and something has to win.** Puerto Rico's outline is drawn inside the United States' outline; Hong Kong's inside China's. Both claim the same land, in the source data, literally. Left alone, the "largest area wins" tie-break flipped 543 cities to the parent country. There are 39 such overlaps and each now has a declared owner, derived from whichever country the city and region lookups already name on that ground.

**Some places have no answer, and that is correct.** Bir Tawil, a 2,000 km² strip between Egypt and Sudan, is claimed by neither country, because each prefers a different disputed triangle instead. It resolves to no country at all. It is filed as a *false positive*: it looks exactly like a bug and it is the only right answer.

**Some places have no answer, and that is just a loss.** Shire and Yebokile in Ethiopia have no boundary polygon of any kind finer than the region. Nothing can be done without falling back to nearest-point, which is the precise failure mode this whole project exists to avoid. Filed as *unsolvable*.

**And occasionally the data is just a record of something else.** The West Bank's administrative relations are drawn as the Oslo Accords' Areas A, B and C plus Hebron's H2 zone: hundreds of genuinely disconnected enclaves. The internal tool that flags broken geometry by counting how many disjoint pieces a place has (1 to 4 is normal, 50 or more usually means two shapes are fighting over the same cells) reports Palestine as the most fragmented place on Earth: 5 cities in 289 pieces. The tool is wrong and the geometry is right, and I had not expected a political settlement to show up as a metric in my build pipeline.

## Things that surprised me

- **Simplifying the polygons made the output file bigger.** I was simplifying region boundaries at a ~1.1 km tolerance to keep build times sane. Turning that off entirely took the worldwide file of the day from 75.7 MB to 73.0 MB, and from 166.8 to 159.4 million records, because simplified neighbours overlap each other, and every overlap is an ambiguity that forces extra subdivision to resolve. It also un-broke Campione d'Italia, Vatican City and Monaco, which had been simplified into slivers too coarse to contain their own cities.
- **Chasing precision made it worse too.** The first design pushed every ambiguous cell down to a ~10 m floor. 17.7 million records, 135 MB, which lost to the 112 MB baseline it was supposed to beat. Capping the recursion much shallower and resolving what is left at build time is the entire difference between a failed prototype and a working format.
- **45% of the build was a single function call.** A CPU profile showed nearly half of all samples inside `@turf/intersect`, running exact arbitrary-precision arithmetic, called only to decide which candidate covered the largest share of an ambiguous cell. Replacing it with a 5 × 5 grid of sample points gave byte-identical output at roughly 5× the speed, because the question never needed an exact area in the first place.
- **The thing that looked like an afterthought was the file.** In one early Europe build, the compressed spatial index was 4.5 KB and the *uncompressed city name strings* were 7.42 MB: 99.94% of the file. Compressing the part I had never thought about made it 4.5× smaller.
- **One hardcoded constant deleted Ireland.** An assumption that counties live at `admin_level=4` silently dropped 54,361 Irish city candidates, plus most of Estonia and Portugal. Ireland uses level 6.
- **Async made it slower.** Running zlib asynchronously, which looks like the obviously correct non-blocking choice, made the tile-burst benchmark 15 to 40% worse. Async file reads cost about 10% and were worth keeping; async inflate was not.
- **Turf.js gave wrong answers at country scale.** `booleanContains` and `booleanIntersects` claimed containment for regions where sampled points demonstrably fell outside. Both are now a hand-written Liang-Barsky segment/rectangle classifier.

## Try it

```sh
npm install -g @ferrybig/cgeodata-reader
cgeodata lookup world.bin 52.37,4.9
```

You need a `.bin` to point it at. `make netherlands` builds a small one in a few minutes; `make world` downloads the planet and takes rather longer, and wants a machine with some RAM. Both are in the [repository](https://github.com/ferrybig/loc-to-city).

The whole thing is 239 commits over five weeks, from 2026-09-16 to 2026-10-22, and the sequence was: build four approaches on one country, measure them against each other, pick the winner, then delete the prototype and rewrite it properly. That middle step is the one I'd keep. I went in sure that exact polygon maths would be the thing to beat, and it lost on size and on speed and barely won on accuracy: the only queries it answered better were the few per cent that land within sight of a border, and paying for the polygons everywhere to fix those turned out to be the worse deal.
