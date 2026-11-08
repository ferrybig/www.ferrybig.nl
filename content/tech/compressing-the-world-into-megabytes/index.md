---
date: "2026-10-21"
tags: ["tech", "geo", "compression", "binary-format", "openstreetmap", "typescript"]
coAuthors:
    - name: Claude Opus 5.5
      url: https://claude.com/claude-code
    - name: Claude Sonnet 5.5
      url: https://claude.com/claude-code
thumbnail:
    image: ./the-netherlands.png
    link: https://geodata.ferrybig.nl/
    alt: Netherlands as mapped by this tool
---
# Compressing the cities of the world into a mere 72 MiB

I started [loc-to-city](https://github.com/ferrybig/loc-to-city) because my favourite photo manager kept telling me the wrong city. It has since turned into something I keep reaching for in other projects, so this post is about the tool and the file format it produces, not about the photo manager. The headline I still find hard to believe: every country, region and city boundary on Earth, at a resolution of roughly 300 by 150 metres, in a single 72 MiB file that answers a lookup without ever reading more than a small slice of it.

Every colleague I showed this to guessed the file would be ten to a hundred times bigger, so somewhere between roughly 720 MiB and 7 GiB. That is a fair guess for the obvious approaches: shipping the polygons themselves costs around 5.1 GiB according to the filtered polygon list.

> **Update 2026-11-04:** the numbers in this post are for version 0 of the file format, the 72 MiB file, and how it got from 72 MiB to 45 MiB is told in [Two fixes that took the geodata file from 72 MiB to 45 MiB](/tech/geodata-72-to-45-mib). Version 2 stores the same data in 19.5 MiB, see [Beating zlib: the cities of the world in 19.5 MiB](/tech/beating-zlib-on-geodata).

## What the tool actually is

Five TypeScript packages.

* **data-ingest**: Takes the extracted OSM data and filters it (with as many threads as you have cores)
* **compressor**: Takes the filtered OSM data and builds a `.bin` file (with as many threads as you have cores)
* **reader**: Designed to read the `.bin` file
* **verify**: A verification tool and scripts for all the findings, designed to prevent regressions when tuning things (this has happened *a lot*!)
* **demo**: A [ExpressJS](https://expressjs.com/) webserver that runs a tile server based on the `.bin`
 
The one that matters to users is **reader**, published as `@ferrybig/cgeodata-reader`, which has zero 3rd-party runtime dependencies (note that it uses either node [`zlib`](https://nodejs.org/api/zlib.html) or the browsers [`CompressionStream`](https://developer.mozilla.org/en-US/docs/Web/API/CompressionStream)).

The format of the `.bin` file is documented at [binary-format.md](https://github.com/ferrybig/loc-to-city/blob/master/reader/binary-format.md), I decided to work on the format first before making implementations. This post describes version 0 of the format. Two bumps came after it. The first dropped the Morton codes, which turned out to be redundant ([how I got there](/tech/geodata-72-to-45-mib)). The second bump replaced zlib for the chunks with a compressor written for this data, which took the file from 45.4 MiB to 19.5 MiB, [described in its own post](/tech/beating-zlib-on-geodata).

## Why not just store one point per city?

![Showing the cities of Northern Ireland, where the OSM info doesn't contain city boundaries for a lot of cities](northern-ireland-5.png)

Cities are not points. *They are irregular polygons*, and a big city's label point is often further from you than a small neighbour's label point even while you are standing well inside the big city. In this tool, we only fall back to cities as points when there is no better polygon source. When seeing cities as points, there are a lot of places that go wrong, for example

| Coordinates | Actual location | Returned as |
| --- | --- | --- |
| [52.034656, 4.388124](https://geodata.ferrybig.nl/#map=12/52.034656/4.388124) | Den Haag | Nootdorp |
| [51.970738, 4.123725](https://geodata.ferrybig.nl/#map=12/51.970738/4.123725) | Europoort | Hoek van Holland |
| [52.683459, 5.295410](https://geodata.ferrybig.nl/#map=12/52.683459/5.295410) | Lelystad | Enkhuizen |

The last case is my favourite. It looks "wrong", but if you look at the municipal border records, it is actually correct. The border of Lelystad goes over the water to the edge of the provincial border.

## Why not store the polygons then?

First off, they are 5.1 GiB uncompressed for worldwide coverage. It likely can be compressed to 500 MiB with standard compression algo's (unverified claim), but this is still a lot of data. While a single polygon can be simplified, it is hard to do correctly. During the development of the file format, I played around with simplified polygons for large countries like Russia and Germany. This created unwanted artifacts in the data.

During development I benchmarked four approaches against each other on just *the Netherlands*, with exact point-in-polygon as the ground truth:

| | Approach | On disk(uncompressed) | Accuracy | Query |
| --- | --- | --- | --- | --- |
| A | Nearest labelled point | 55 KiB | 26 to 46% | ~14 to 21 µs |
| B | Exact point-in-polygon | 41.5 MiB | 100% (it *is* the truth) | ~24 to 41 µs |
| C | Adaptive grid, polygons as fallback | 0.60 MiB + the polygons | 100% | ~6 µs inside, ~39 µs near a border |
| D | Adaptive grid, ambiguity resolved at build time | 0.54 MiB, nothing else | ~97% | ~7 µs |

D won, and the interesting part is *why* it won on size. C and D store the same grid. The difference is that C keeps the polygons around so it can fall back to exact maths at a border, and D decides the border cells once, while building, and then throws the geometry away.

**The shipped file contains no polygons at all**, not a single polygon. The reader never sees a coordinate pair that wasn't a query. That is the single biggest reason the format is small, and we can only choose it because we are willing to be approximately wrong in a thin band along every border.

## So what is in there instead?

A list of chunks, containing a [quadtree](https://en.wikipedia.org/wiki/Quadtree), flattened.

Take a square patch of the world and ask which places overlap it. Throw away the ones whose polygon misses it entirely, and the ones that are only in the list because they contain something more specific that is also in the list, since a province is irrelevant here if one of its own cities is still in the running. If *every* place that survives covers the whole patch, write one record for it and stop. Otherwise somebody's boundary runs through the patch, so cut it into four and start again. At the depth cap we cannot split any further, so we sample the cell on a 5 × 5 grid and give it to whichever place wins most of the 25 points.

The condition for stopping is worth being precise about. It is not "one place wins the cell". It is "no boundary passes through the cell". A cell that is 99% Amsterdam and 1% Diemen is *not* finished: it gets split, and so do its children, all the way down. Then, on the way back up, four children that all came back with the same answer collapse into one record for their parent.

Then number every leaf cell with its [Morton code](https://en.wikipedia.org/wiki/Z-order_curve) (interleave the bits of its row and column) and sort. Morton order is quadtree order, so a sorted list of codes *is* the tree, and a lookup is one binary search over integers.

![A quadtree over a single chunk, and the two parallel arrays it is stored as](quadtree-to-columns.svg "How one chunk gets small")

Written out as columns, with the Morton codes stored as deltas:

| **Cell index**      | 0 | 16 | 17 | 18 | 19 | 20 | 24 | 25 | 26 | 27 | 28 | 32 | 48 | 49 | 50 | 51 | 52 | 56 | 57 | 58 | 59 | 60 |
| ------------------- | - | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- |
| **deltas**          | 0 | 16 | 1  | 1  | 1  | 4  | 1  | 1  | 1  | 1  | 1  | 4  | 16 | 1  | 1  | 1  | 1  | 4  | 1  | 1  | 1  | 1  |
| **depths**          | 1 | 3  | 3  | 3  | 3  | 2  | 3  | 3  | 3  | 3  | 2  | 1  | 3  | 3  | 3  | 3  | 2  | 3  | 3  | 3  | 3  | 3  |
| **palette indices** | 1 | 1  | 2  | 1  | 2  | 2  | 1  | 1  | 1  | 1  | 2  | 1  | 1  | 2  | 1  | 2  | 2  | 2  | 2  | 2  | 2  | 2  |

Codes 24 and 56 are both merges of four cells. The boundary still crosses 24, but all four of its children went to Amsterdam anyway.

Note that the depths are mostly ones, twos and fours, in long runs, which is what zlib is good at. Interleaved as 16 fixed-width records it would have had nothing to find.

The thing that makes this cheap is in the left half of that picture. A record costs the same whether it covers one cell or a quarter of the chunk, so the inside of a city is nearly free, and only the boundary is expensive. Boundaries are one-dimensional and area is two-dimensional, so we end up paying for the perimeter of the world's cities rather than for their surface.

### The codes are stored as deltas

The first row of that table, the Morton codes, is in the file, but not as absolute numbers. Consecutive codes are close together, so each one is stored as the difference from the previous code, written as a varint. Most of those deltas fit in one or two bytes. A reader gets the code of a cell by adding up the deltas as it goes. The codes turn out to be redundant, because the depths already say what they say. Dropping them is [CGEODATA version 1](https://github.com/ferrybig/loc-to-city/pull/7), one of two changes covered in [Two fixes that took the geodata file from 72 MiB to 45 MiB](/tech/geodata-72-to-45-mib). The other merges sibling cells that resolved to the same place back into their parent.

### Can we beat zlib with our own compression?

After the two fixes in the next post, zlib was still doing the last step, and zlib has no idea that it is looking at a quadtree. That became CGEODATA version 2, where the chunks are written with a compressor that knows what a chunk is: **45.4 MiB down to 19.5 MiB**, at the cost of decoding that is about 4 times slower. It is a big enough story for its own post: [Beating zlib: the cities of the world in 19.5 MiB](/tech/beating-zlib-on-geodata).

## How does 17 billion cells fit in 72 MiB?

Let me do the arithmetic that makes this sound impossible first.

The worldwide file uses a 128 × 128 grid of chunks and a quadtree depth of 10, which works out to 131,072 × 131,072 cells across the planet. That is **17,179,869,184** cells, each about 306 m wide and 152 m tall at the equator. There are 274,171 distinct places, so a place id needs 19 bits. If we stored one id per cell we would need

$$
17{,}179{,}869{,}184 \times 19 \text{ bits} \approx 38 \text{ GiB}
$$

Nobody would ship that. It is just the upper bound the grid starts from, before any of the structure below is applied. The actual file is 75,935,694 bytes, so **537 times smaller** than the dense grid, and 72 times smaller than the 5.1 GiB of polygons it was built from.

Where does it go? The quadtree collapses those 17.18 billion cells into **166,081,761 records on disk**, a factor of 103 on its own. Those records are stored in 72.4 MiB, which works out to **0.46 bytes per record**: a depth, a place reference and a code delta, together less than half a byte. The next post merges sibling cells and drops the codes, which takes it to 110,148,645 records in 45.4 MiB. [Version 2](/tech/beating-zlib-on-geodata) stores those in 19.5 MiB, 1.34 bits per record across the chunks.

Three things get us there. The prototype measured the last two on a 954,497-record dataset, so I can put real numbers on them:

1. **Don't store cells, store leaves.** The quadtree collapses every uniform area into one record. This is the big one, and it is the one that makes the other two possible.
2. **Delta-code the sorted codes as varints.** Consecutive Morton codes are close together, so most deltas fit in one or two bytes instead of a fixed eight. The code stream went from 7.2 MiB to under 1 MiB, and the whole blob from 7,744,895 bytes to 3,824,888. (The next post covers how the format dropped codes from storage entirely.)
3. **Then zlib it.** 632,143 bytes, 12× smaller than the naive fixed-width encoding with the drawback of losing random access

The step I did not expect to matter is hiding in there, and it does not show up on its own: **storing the arrays separately rather than as a list of records.** That change is free. The same numbers go into the file in the same order, just grouped by kind instead of by record, so it saves nothing at all before compression. What it does is put all the depths next to each other, and all the palette indices next to each other, and all the small deltas next to each other, so the compressor finally has runs to find instead of a stream of interleaved unrelated bytes. Grouping the values is what made step 3 worth 6×.

## Why deflate, when zstd exists?

Let me answer that with a table

| Method       | Size      | NodeJS support | Browser supported |
|--------------|-----------|----------------|-------------------|
| Uncompressed | 236.3 MiB | yes            | yes               |
| Deflate      | 43.5 MiB  | yes            | yes               |
| Gzip         | 43.6 MiB  | yes            | yes               |
| Brotli       | 36.9 MiB  | yes            | partial           |
| Zstd         | 37.0 MiB  | experimental   | no                |
| xz           | 35.8 MiB  | no             | no                |

I used deflate anyway, because any compression with the delta-varint columnar layout had already captured most of the available gain, and because deflate is a compressor that is built into both Node.js (`zlib.inflateSync`) and every browser (`DecompressionStream('deflate')`). Paying a native addon or a WASM blob as a dependency, in exchange for 18%, in a library whose entire selling point is that it has no dependencies, was not a trade I wanted.

In version 2, the chunks don't use deflate anymore, but a range coder that is part of the reader itself ([see the follow-up post](/tech/beating-zlib-on-geodata)), and that one beats every row of this table by a wide margin. The name blocks are still deflated.

## What does the file look like?

Four sections, no padding, no trailer. There is no partial updating support at the moment.

![The four sections of a CGEODATA file: header, directory, place table, and one compressed block per chunk](file-layout.svg "CGEODATA file layout")

The directory is the part that makes partial reads work. It lists the byte length of every chunk, in order, so a reader sums the prefix once at load time and then knows exactly where any chunk lives. A length of `0` means that chunk is empty and nothing is stored for it at all, which is how the oceans cost almost nothing: 8,776 of the 16,384 chunks are empty.

The place table is the other surprise. All 274,171 names, with their hierarchy and their alternative spellings, are 2,000,931 bytes. **2.6% of the file.** The hierarchy itself is almost free because it is never stored as parent pointers: places are numbered so that all countries come first, then all regions grouped by country, then all cities grouped by region, and the file only records *how many children each parent has*. Parent lookup is a binary search over a prefix sum.

Names are split into blocks of 128 and each block is deflated separately, so recovering one name means inflating about 2 KiB rather than 2 MiB. I tested several block sizes on the worldwide file:

| Names per block | Place table | Resolving one place | Scanning every name |
|---|---|---|---|
| 8192 | 1.56 MiB | 4.9 ms | 134 ms |
| 512 | 1.74 MiB | 0.9 ms | 141 ms |
| 128 | 1.96 MiB | 0.7 ms | 152 ms |
| 32 | 2.41 MiB | 1.4 ms | 210 ms |

128 is the sweet spot. Below that the per-block zlib framing and the longer length table start costing more than the finer granularity saves.

## How is a lookup fast when the file is 45 MiB?

It never reads the full 45 MiB. A lookup reads the header and the directory once (about 22 KiB), and after that it reads exactly one chunk, inflates it, and binary searches it. Most chunks are a few KiB; the very worst one in the world, a square covering Belgium and the French border, is 151 KiB compressed and holds 270,514 records. Nothing else in the file is touched.

From the benchmark suite, on the worldwide file:

| Operation | Case | Result |
|---|---|---|
| open | | 10.30 ms |
| query | cold, Paris / Tokyo / Amsterdam | 13.03 / 3.56 / 3.77 ms |
| query | warm | 0.06 ms |
| search "berlin" --sort | cold / warm | 37.04 / 1.70 ms |
| 300 lookups | cold, concurrent | 192.08 ms |
| memory | after open | 100 MiB RSS |

These are from the 45 MiB build, (which at the moment is still the present version) with [version 2](/tech/beating-zlib-on-geodata) a cold Paris query takes 28.6 ms and a cold Tokyo query 9.9 ms, since a range coded chunk is slower to decode. The cold numbers are entirely "how big is the chunk the query landed in". Paris is in a dense chunk; Amsterdam is not. Once a chunk is decoded it stays in an LRU cache, and then a lookup costs well under a tenth of a millisecond, which is why the map tile renderer in the demo is usable at all: neighbouring pixels share a chunk.

## How can search be fast when it matches anything?

This was the part I expected to be easy and wasn't. `search("dam")` should find Amsterdam, Zaandam and Rotterdam. `search("munchen")` should find München. Substring matching, diacritic-insensitive, over 274,171 places, each with several alternative names. The naive version inflates and scans every name in the file, which is not fast.

The answer is a **trigram index**, shipped as an optional sidecar file. Every run of three consecutive characters in every name gets a list of the places that contain it. A query of three or more characters only has to intersect the lists of its own trigrams, and only places present in *all* of them can possibly match.

Two details make it actually work:

* **The lists are allowed to be wrong in one direction only.** Every stage of the folding (strip diacritics, lowercase, bucket all digits together, bucket all punctuation together) is many-to-one, so the candidate set is always a superset of the true matches. The reader then confirms every candidate by comparing the actual names, exactly as it would without an index. A corrupt or stale index can make a search slow or make it miss results; it can never make it return a wrong answer.
* **Hashing instead of a naive pool of Latin-only letters**, which gives 32,768 lists, alongside the 21,952 lists that the 28 Latin symbols generate on their own. The earlier version mapped every non-Latin letter to a single "other" symbol, which meant a three-letter Cyrillic query left all 36,000-odd non-Latin cities as candidates. Hashing fixed that without making the file meaningfully bigger.

What about one- and two-character queries, which have no trigram at all and match nearly everything? We cannot index our way out of that, so the file just stores the answer: for every one- and two-character string that occurs anywhere in any name, the top five places in relevance order, precomputed. 25,497 keys, about 365 KiB, binary searched by key.

The whole search index is 4.06 MiB against a 72 MiB main file. Measured end to end, opening both files fresh for every query:

| | 1 char | 2 chars | 3 chars | 5 chars | 8 chars |
|---|---|---|---|---|---|
| With the index | 11 ms | 10 ms | 26 ms | 13 ms | 12 ms |
| Without | 181 ms | 141 ms | 138 ms | 136 ms | 135 ms |

Intersecting the lists takes well under a millisecond. Everything in the three-character column is the cost of *confirming* candidates, because the commonest trigrams still have thousands of them, and confirming one means inflating the name block it lives in. Which is how the block size experiment above ended up mattering far more than the index did.

## How do I know any of it is right?

I don't, which is why there is a 3,000-line file called [countries.md](https://github.com/ferrybig/loc-to-city/blob/master/countries.md) with a section per country and a status marker on every finding: *fixed*, *open*, *unsolvable*, *false positive*, or *human error*. Currently 52 open and 4 unsolvable.

Almost all of it was found by staring at the demo's tile overlay, which paints each cell by the city it resolves to. Wrong data looks wrong immediately in a way it never does in a table. I tried to find ways to automate this and eventually I created the "verify" package. This package contains verification tests. It also contains tests like counting the "islands" of a city. A high island count either happens in the country of [Fr. Polynesia](https://geodata.ferrybig.nl/#map=12/-16.8942/-144.6642) or when multiple city polygons overlap and every "cell" switches order

A sample of what is actually out there:

**"City" doesn't mean anything.** There is no administrative level that means "city" worldwide. The Netherlands has survey-grade `admin_level=10` boundaries straight from the national address register. Most of the US resolves at the county level. France uses communes, Australia gazetted localities. Picking the right level per country is a 112-section research problem and it is most of the project's actual difficulty.

**Picking the level by coverage is a trap.** Germany's ordinary municipality level covers 96% of the country's land area, so by any coverage metric it is done. It also excludes all ~107 *kreisfreie Städte*, the cities that are legally their own district. That is why there is a separate spot-check that queries capitals and major cities by name rather than trusting a percentage.

**Capitals often aren't cities.** Vienna, Prague, Minsk, Kyiv, Moscow, Berlin, Washington DC: in OpenStreetMap these are *region*-level units with nothing beneath them, so a lookup can correctly say "the region of Vienna" and never "the city of Vienna", because no such polygon exists. There is now a hand-reviewed list that re-emits the region's own polygon as a city of the same name, which fixed 24 capitals in one pass. It does not fix Tashkent, Yerevan or Astana, where the level below the capital-region isn't empty, it is a grid of districts with entirely different names. There is simply no shape anywhere in the data that means "the capital, as a city".

**Dependencies overlap their parents, and something has to win.** Puerto Rico's outline is drawn inside the United States' outline; Hong Kong's inside China's. Both claim the same land, in the source data, literally. Left alone, the "largest area wins" tie-break flipped 543 cities to the parent country. There are 39 such overlaps and each now has a declared owner, derived from whichever country the city and region lookups already name on that ground.

**Some places have no answer, and that is correct.** Bir Tawil, a 2,000 km² strip between Egypt and Sudan, is claimed by neither country, because each prefers a different disputed triangle instead. It resolves to no country at all. It is filed as a *false positive*: it looks exactly like a bug and it is the only right answer.

**Some places have no answer, and that is just a loss.** Shire and Yebokile in Ethiopia have no boundary polygon of any kind finer than the region. Nothing can be done without falling back to nearest-point, which is the precise failure mode this whole project exists to avoid. Filed as *unsolvable*.

**And occasionally the data is just a record of something else.** The West Bank's administrative relations are drawn as the Oslo Accords' Areas A, B and C plus Hebron's H2 zone: hundreds of genuinely disconnected enclaves. The internal tool that flags broken geometry by counting how many disjoint pieces a place has (1 to 4 is normal, 50 or more usually means two shapes are fighting over the same cells) reports Palestine as the most fragmented place on Earth: 5 cities in 289 pieces. The tool is wrong and the geometry is right, and I had not expected a political settlement to show up as a metric in my build pipeline.

## Things that surprised me

* **Simplifying the polygons made the output file bigger.** I was simplifying region boundaries at a ~1.1 km tolerance to keep build times sane. Turning that off entirely took the worldwide file of the day from 72.4 MiB to 69.6 MiB, and from 166.0 to 159.4 million records, because simplified neighbours overlap each other, and every overlap is an ambiguity that forces extra subdivision to resolve. It also un-broke Campione d'Italia, Vatican City and Monaco, which had been simplified into slivers too coarse to contain their own cities.
* **Chasing precision made it worse too.** The first design pushed every ambiguous cell down to a ~10 m floor. 17.7 million records, 129 MiB, which lost to the 107 MiB baseline it was supposed to beat. Capping the recursion much shallower and resolving what is left at build time is the entire difference between a failed prototype and a working format. Then a second discovery made the output file smaller still, see [the post about that](/tech/geodata-72-to-45-mib).
* **45% of the build was a single function call.** A CPU profile showed nearly half of all samples inside `@turf/intersect`, running exact arbitrary-precision arithmetic, called only to decide which candidate covered the largest share of an ambiguous cell. Replacing it with a 5 × 5 grid of sample points gave byte-identical output at roughly 5× the speed, because the question never needed an exact area in the first place.
* **The thing that looked like an afterthought was the file.** In one early Europe build, the compressed spatial index was 4.4 KiB and the *uncompressed city name strings* were 7.08 MiB: 99.94% of the file. Compressing that part, which I had never thought about, made the file 4.5× smaller.
* **One hardcoded constant deleted Ireland.** An assumption that counties live at `admin_level=4` silently dropped 54,361 Irish city candidates, plus most of Estonia and Portugal. Ireland uses level 6.
* **Async made it slower.** One goal I had was that the library count also be used from a browser session, the simplistic solution was ["infecting"](https://journal.stuffwithstuff.com/2015/02/01/what-color-is-your-function/) everything with async/await. One purpose the tool has, is the demo server. This is many lookups in the exact same chunk. Each chunk being awaited had a significant overhead, so I had to make a non promise based method that could return `null` to say the user needed to call promise based method.
* **Turf.js gave wrong answers at country scale.** `booleanContains` and `booleanIntersects` claimed containment for regions where sampled points demonstrably fell outside. Both are now a hand-written Liang-Barsky segment/rectangle classifier.
* **Every time I thought the build speed couldn't be improved, Claude proved me wrong.** The current compressor is 1000 times faster than the initial "prototype" version. We went from 28 hours to 4.8 minutes


## Try it

```sh
# Note that this downloads the latest version, which might have a different filesize, a catalogue is planned
wget https://geodata.ferrybig.nl/download/world.bin
wget https://geodata.ferrybig.nl/download/world.search-index.bin
wget https://geodata.ferrybig.nl/download/world.locate-index.bin

npx @ferrybig/cgeodata-reader lookup world.bin 52.37,4.9
npx @ferrybig/cgeodata-reader search world.bin amsterdam --sort
npx @ferrybig/cgeodata-reader info   world.bin
npx @ferrybig/cgeodata-reader list   world.bin
```

Or from the api:

```ts
import { openFile } from "@ferrybig/cgeodata-reader/node";

const reader = await openFile("world.bin");
const result = await reader.query(35.6762, 139.6503);

result.country?.internationalName; // "Japan"
result.region?.localName;          // "東京都"
result.region?.internationalName;  // "Tokyo"
result.city?.localName;            // "杉並区"
```

The whole thing is 239+ commits over five weeks, from 2026-09-16 to 2026-10-21, and the sequence was: build four approaches on one country, measure them against each other, pick the winner, then delete the prototype and rewrite it properly. That middle step is the one I'd keep. I went in sure that exact polygon maths would be the thing to beat, and it lost on size and on speed and barely won on accuracy: the only queries it answered better were the few per cent that land within sight of a border, and paying for the polygons everywhere to fix those turned out to be the worse deal.
