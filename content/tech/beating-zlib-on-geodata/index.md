---
date: "2026-11-05"
tags: ["tech", "geo", "compression", "binary-format", "typescript"]
coAuthors:
    - name: Claude Opus 5
      url: https://claude.com/claude-code
---
# Beating zlib: the cities of the world in 19.5 MiB

In [my first post about this file format](/tech/compressing-the-world-into-megabytes) I squeezed every country, region and city boundary on Earth into a 45 MiB file ([two of the fixes along the way have their own post](/tech/geodata-72-to-45-mib)), and I ended up there with zlib doing the last step.n  I squeezed every country, region and city boundary on Earth into a 45 MiB file, and I ended up there with zlib doing the last step. For a while I accepted that zlib is magic, but then I snapped and, so I asked Claude together with my existing knowledge to attempt our own compressor. The same file is now 19.5 MiB, and this post is about how that works and what it costs.

## Where version 1 left off

A CGEODATA file is a list of chunks, and every chunk is a [quadtree](https://en.wikipedia.org/wiki/Quadtree) stored in [Morton order](https://en.wikipedia.org/wiki/Z-order_curve) as two parallel arrays: how deep every leaf cell sits in the tree (its *depth*), and which place it belongs to (its *palette index*). The post before this one has the full explanation, and the picture of how a quadtree turns into these two arrays. This is the example chunk it uses, a patch of the world containing Amsterdam (palette index 1) and Diemen (palette index 2):

| | 0 | 16 | 17 | 18 | 19 | 20 | 24 | 28 | 32 | 48 | 49 | 50 | 51 | 52 | 56 | 60 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **depths** | 1 | 3 | 3 | 3 | 3 | 2 | 2 | 2 | 1 | 3 | 3 | 3 | 3 | 2 | 2 | 2 |
| **palette indices** | 1 | 1 | 2 | 1 | 2 | 2 | 1 | 2 | 1 | 1 | 2 | 1 | 2 | 2 | 2 | 2 |

The numbers on top are the Morton codes of the records. Version 1 doesn't store them anymore: the depth of a record tells you how far the code advances to the next record (depth 1 is 16 codes, depth 2 is 4 codes, depth 3 is 1 code), so a reader can add them up while walking the chunk. In version 1, the depths and the palette indices of a chunk were written one array after the other, and deflated as one block.

## Can we beat zlib with our own compression?

After version 1, zlib was still doing the last step: every chunk was its depths and palette indices, one after the other, deflated as one block. zlib is a general purpose compressor. I suddenly realized one thing, zlib is designed for geneal purpose, data. The start of every chunk is mostly "random", with varint (lower numbers are more likely because of [Benford's law](https://en.wikipedia.org/wiki/Benford%27s_law)). It has no idea that after the "random" data comes structured data. So I worked together with Claude to see whether a compressor that *does* know could do better. Sometimes you have to re-invent to wheel to improve your skills. My idea was roughly this:

* Count how often each palette index is used, build a [Huffman tree](https://en.wikipedia.org/wiki/Huffman_coding) from that, then store a list which is [run length encoded](https://en.wikipedia.org/wiki/Run-length_encoding)
* Go a bit further than run-length encoding and do what [QOI](https://en.wikipedia.org/wiki/QOI_(image_format)) does: emit a marker that says "take the last X you output".
* Stop wasting a whole byte on every depth, when the deepest depth in the world file is 10.
* I expected that working with bits instead of bytes would slow things down, but maybe we would win some speed back by not running zlib.

The result is [CGEODATA version 2](https://github.com/ferrybig/loc-to-city/pull/9). The records are exactly the same records as in version 1, only stored differently:

| Metric      | v1, zlib    | v2, range coded     |
| ----------- | ----------- | ------------------- |
| records     | 110,148,645 | 110,148,645         |
| bytes       | 47,620,804  | 20,482,701 (-57.0%) |
| chunk bytes | 45,596,905  | 18,459,579 (-59.5%) |
| per record  | 3.31 bits   | 1.34 bits           |

45.4 MiB down to 19.5 MiB. That 1.34 bits per record is for the depth *and* the palette index of a record together. It works in three steps.

### Step 1: Don't store depths, store the quadtree

The depths array is a pre-order listing of a quadtree, and a quadtree can be written down with a single yes/no question per node: *does this cell split into four?* For the Amsterdam and Diemen example from earlier, walking the tree from the root:

```
root                         split   1
  south-west                 leaf    0      record 0
  south-east                 split   1
    south-west               split   1      records 16, 17, 18, 19 (depth 3, the maximum, no question needed)
    south-east               leaf    0      record 20
    north-west               leaf    0      record 24
    north-east               leaf    0      record 28
  north-west                 leaf    0      record 32
  north-east                 split   1
    ...                      1 0 0 0        records 48 to 60
```

That is 13 bits for what used to be 16 bytes of depths. A cell at the maximum depth can not split, so it does not even get a question.

Those 13 bits are still not stored as 13 bits. Each question is asked with some knowledge of what was already decoded: the depth of the node, and whether the records to the west and south of it are deeper than it. If your neighbours had to split to follow a border, there is a good chance you have to as well. If your neighbours are big cells, you are probably in the middle of a city and you are probably a big cell too.

### Step 2: Guess the palette index from the neighbours

This is the part I did not see coming. In my head, I was thinking of run length encoding, which is just dding counters after every data byte to mark how often they happen. But in Morton order, the record decoded just before you is often not even touching you: the Z-curve jumps around. What *is* always decoded before you are the cells directly to your west and south, because they have a lower Morton code.

![The example chunk, with every record marked by whether its west or south neighbour predicts its place](neighbours.svg "Guessing a record from what is already decoded")

So every leaf asks, in order:

1. Is it the same place as my west neighbour? In the world file, this is yes for 74% (!) of the records.
2. If not: is it the same place as my south neighbour? Yes for another 19%.
3. If not: which one is it? This is coded as a position in a [move-to-front list](https://en.wikipedia.org/wiki/Move-to-front_transform) of palette indices, where the most recently used index is at the front. The west and south answers are skipped in that list, since we already know it is neither of them. The position is written in [Elias gamma](https://en.wikipedia.org/wiki/Elias_gamma_coding), so small numbers are short.

The decoder finds the neighbours cheaply: for every row and every column of the chunk, it remembers the last record it decoded there. In Morton order, the last record in your row is the one directly to your west.

### Step 3: A range coder instead of zlib

After steps 1 and 2, a chunk is nothing but a long list of yes/no decisions. Those are fed into a [range coder](https://en.wikipedia.org/wiki/Range_coding), the same kind as the one inside [LZMA](https://en.wikipedia.org/wiki/Lempel%E2%80%93Ziv%E2%80%93Markov_chain_algorithm) (and so in `xz` and 7-Zip). A range coder is a form of arithmetic coding: every decision comes with a probability, and a decision that was very likely costs very little, less than a bit:

| Chance the guess is right | Cost when it is right |
|---|---|
| 50% | 1 bit |
| 90% | 0.15 bits |
| 99% | 0.015 bits |
| 99.6% (the most the format allows) | 0.005 bits |

The probabilities are not stored anywhere. Every one starts at 50% and moves a sixteenth of the way towards each answer it sees, in the encoder and the decoder alike, so they learn the chunk while it is being decoded. And there is not one probability per kind of question, but one per *situation* (the format calls these contexts): "same as west?" has a separate probability for every depth, combined with whether the west and south neighbours agree with each other, and whether the previous record agreed with either of them. Deep inside a city, where both neighbours and the previous record are all the same place, the "same as west?" probability for that situation is pushed to its limit, and a record costs about 0.005 bits. That is a run-length encoding without ever writing down a run length.

![Five decisions narrowing the interval from [0, 1) down to a small range, with the probability of each answer rising as it is seen](range-coding.svg "Narrowing an interval, one decision at a time")

Why not Huffman? A Huffman code spends at least one whole bit for every symbol it writes. Huffman coding the depths and the palette indices separately costs at least two bits per record, already more than the 1.34 bits version 2 spends on both. It would need run-lengths on top to get below one bit per symbol, and its tree stored in every chunk. zlib itself is also just LZ77 plus Huffman, so it already did most of what a hand-written Huffman stage would have done. The other agent measured where the gain actually came from:

| Variant                                       | Size     |
| --------------------------------------------- | -------- |
| v1 chunks, zlib                               | 43.5 MiB |
| v1 chunks, Zopfli (a better deflate encoder)  | 35.7 MiB |
| split flags + neighbour guesses, zlib         | 28.8 MiB |
| split flags + neighbour guesses, range coded  | 17.6 MiB |

So knowing what to predict (steps 1 and 2) already gets more than half of the way, even with plain zlib, and coding those predictions in fractions of a bit (step 3) does the rest.

#### What is actually stored in a chunk

A version 2 chunk holds three things: its palette (the place IDs it uses), a record count, and one range-coded stream. The depths are not stored at all. The stream encodes the quadtree itself.

Decoding walks the tree from the root, in Morton order. Every node above the maximum depth first decodes one *split* decision: `1` gives four children (south-west, south-east, north-west, north-east), `0` makes the node a leaf. Each leaf is the next record, and its depth is the depth of the node it came from. Decoding stops after the record count is reached.

Because Morton order visits the south-west and south-east quarters before the north ones, a node's west and south neighbours have always been decoded already. The decoder remembers the last record seen in each row and column of cells to find them. Those neighbours are what the palette index is predicted from:

1. Is the index the same as the west neighbour's? One decision.
2. If not, and the south neighbour has a different index, is it the same as the south neighbour's? One decision.
3. Otherwise, code the index's rank in a move-to-front list of palette indices, skipping the two neighbours. The rank is written as an Elias gamma code, and each of its bits has its own probability.

Move-to-front keeps recently used places near the front, so a chunk that uses a few common places codes most ranks in very few bits.

Every decision looks up its probability in a *context*, a small table entry picked from the situation: the depth, what kind of neighbour is there (none, bigger, same size, or smaller), whether the west and south neighbours agree, and whether the previous record agreed with either. Each context starts at 50% and moves a sixteenth of the way towards each answer, as described above.

#### The coder itself

The probabilities are 12-bit integers, out of 4096. The decoder keeps two numbers: `range`, the width of the current interval, and `code`, where the encoded number sits inside that interval. To decode one decision with probability `p`:

```text
bound = (range >> 12) × p
if code < bound:  bit = 0,  range = bound
else:             bit = 1,  code = code − bound,  range = range − bound
```

The lower part of the interval has size `p / 4096` of the whole, and the decision picks which part to keep. This is the interval splitting from the diagram, written with integers. When `range` falls below 2²⁴, the decoder shifts in one more byte of the stream, so whole bytes are only read once their leading bits are settled. That is how a decision costing 0.005 bits can share a byte with its neighbours.

The cost follows directly from the size of the part kept. At 99.6% (`p = 4081`), a decision that goes the likely way keeps 99.6% of the interval and costs about 0.005 bits. One that goes the unlikely way keeps 0.4% and costs about 8 bits. The probabilities learn the chunk as it is decoded, so the common case is cheap and the rare case pays for it.

## The price: decode speed

Here I was right in my prompt. Working with bits is slower than working with bytes, and a range coder is worse than that: every decision depends on the one before it, so there is nothing to vectorize, and it takes about 2.5 decisions per record. zlib's inflate on the other hand is native code that has been optimized for decades.

| Operation                       | v1          | v2                                            |
| ------------------------------- | ----------- | --------------------------------------------- |
| decode every chunk              | 1.0-1.2 s   | 4.7-5.1 s (WebAssembly), 11-12 s (JavaScript) |
| 32 tile burst, initial view z10 | 195 ms      | 212 ms                                        |
| 32 tile burst, europe z4        | 1004 ms     | 3308 ms                                       |
| cold query Paris / Tokyo        | 11.3 / 3.5  | 28.6 / 9.9 ms                                 |
| encode every chunk, one thread  | 100 s       | 11 s                                          |

The hope of winning speed back by dropping zlib only came true on the encoding side: the compressor is 9 times faster at writing chunks than zlib at its highest level.

Remember the [WebAssembly decoder I reverted for version 1](/tech/geodata-72-to-45-mib#do-we-actually-need-to-store-the-morton-codes), because it only saved 16 microseconds per chunk? For version 2 it did come back, because here it is 2.4 times as fast as the JavaScript decoder. It follows the same rules as the version 0 decoder: it can only accept or decline a chunk, never report an error, and the JavaScript decoder stays the reference. A test feeds both 8,000 corrupted streams and checks that WebAssembly never accepts one that JavaScript rejects.

A 3.3 times slower europe burst is far outside the 15% slowdown I normally allow for a reader change. I took it anyway, because tiles are not the main goal of this tool. The goal itself is resolving a WGS84 coordinate to a city, and nobody takes 100 photos per second all around the world, so the tool will be asked for answers more slowly than it can give them, even at 28.6 ms for a cold lookup. The tile burst at a normal zoom level barely changed anyway. A file that is less than half the size, on the other hand, makes it much easier to embed the tool in self-hosted software. The reader still reads version 0 and 1 files, and the compressor can still write version 1, so anyone who prefers speed over size can transcode a file back. Going version 1 → 2 → 1 gives back the exact same bytes.

## How close was Claude to my idea?

| My idea | What version 2 does | |
| --- | --- | --- |
| A Huffman tree built from how often each palette index is used | Adaptive arithmetic (range) coding, where probabilities are learned while decoding and nothing is stored | Same family, one step further: fractions of a bit, and no tree per chunk |
| Run-length encoding | No runs at all, but "the previous record agreed" is part of the context, so a long run costs ~0.005 bits per record | Same effect, different mechanism |
| QOI's "take the last X you output" | "Same as west", "same as south", and otherwise a position in a move-to-front list | The closest match. QOI keeps a table of recently seen pixels; the move-to-front list is recently used palette indices |
| Store depths in fewer bits than a byte | Depths are not stored at all, only one yes/no split flag per node | Further than my idea |
| Do it for both the depths and the palette indices | Both | Yes |
| The palette itself (the list of place ids) | Unchanged, still delta-coded varints | Not touched |
| Bits instead of bytes will be slower | About 4 times slower to decode | Correct |
| Maybe faster because there is no zlib | Encoding 9 times faster, decoding 4x slower | Half right |
| Get `world.bin` below 45.5 MiB | 19.5 MiB | Yes |

The one ingredient my prompt was missing is the second dimension. QOI is made for images stored line by line, where the previous pixel is the pixel to your left, so "same as last" works. In a Morton ordered quadtree, the previous record is often on the other side of the chunk, so Claude corrected my idea of "the last thing I output" with "the thing to my left" and "the thing below me", which is closer to what PNG's filters do than to QOI. Morton order is what made the codes free in version 1, and it is also what made the previous record a bad guess in version 2.
