---
date: "2026-11-03"
tags: ["tech", "geo", "compression", "binary-format", "typescript"]
coAuthors:
    - name: Claude Opus 5
      url: https://claude.com/claude-code
---
# Beating zlib: the cities of the world in 19.5 megabytes

In [the previous post](/tech/compressing-the-world-into-megabytes) I squeezed every country, region and city boundary on Earth into a 45 MB file, and I ended up there with zlib doing the last step. It kept bothering me that zlib has no idea what it is compressing, so I asked Claude to write a compressor that does. The same file is now 19.5 MB, and this post is about how that works and what it costs.

## Where version 1 left off

A CGEODATA file is a list of chunks, and every chunk is a [quadtree](https://en.wikipedia.org/wiki/Quadtree) stored in [Morton order](https://en.wikipedia.org/wiki/Z-order_curve) as two parallel arrays: how deep every leaf cell sits in the tree (its *depth*), and which place it belongs to (its *palette index*). The post before this one has the full explanation, and the picture of how a quadtree turns into these two arrays. This is the example chunk it uses, a patch of the world containing Amsterdam (palette index 1) and Diemen (palette index 2):

| | 0 | 16 | 17 | 18 | 19 | 20 | 24 | 28 | 32 | 48 | 49 | 50 | 51 | 52 | 56 | 60 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **depths** | 1 | 3 | 3 | 3 | 3 | 2 | 2 | 2 | 1 | 3 | 3 | 3 | 3 | 2 | 2 | 2 |
| **palette indices** | 1 | 1 | 2 | 1 | 2 | 2 | 1 | 2 | 1 | 1 | 2 | 1 | 2 | 2 | 2 | 2 |

The numbers on top are the Morton codes of the records. Version 1 doesn't store them anymore: the depth of a record tells you how far the code advances to the next record (depth 1 is 16 codes, depth 2 is 4 codes, depth 3 is 1 code), so a reader can add them up while walking the chunk. In version 1, the depths and the palette indices of a chunk were written one array after the other, and deflated as one block.

## Can we beat zlib with our own compression?

After version 1, zlib was still doing the last step: every chunk was its depths and palette indices, one after the other, deflated as one block. zlib is a general purpose compressor. It has no idea that it is looking at a quadtree, or that two records next to each other on the map usually belong to the same city. So I asked Claude whether a compressor that *does* know could do better. My idea was roughly this:

* Count how often each palette index is used, build a [Huffman tree](https://en.wikipedia.org/wiki/Huffman_coding) from that, and store the indices run-length encoded.
* Go a bit further than run-length encoding and do what [QOI](https://en.wikipedia.org/wiki/QOI_(image_format)) does: emit a marker that says "take the last X you output".
* Stop wasting a whole byte on every depth, when the deepest depth in the world file is 10.
* I expected that working with bits instead of bytes would slow things down, but maybe we would win some speed back by not running zlib.

The result is [CGEODATA version 2](https://github.com/ferrybig/loc-to-city/pull/9). The records are exactly the same records as in version 1, only stored differently:

```
               v1, zlib      v2, range coded
records     110,148,645          110,148,645
bytes        47,620,804           20,482,701   -57.0%
chunk bytes  45,596,905           18,459,579   -59.5%
per record    3.31 bits            1.34 bits
```

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

This is the part I did not see coming. In my head, "take the last X you output" meant the last few records. But in Morton order, the record decoded just before you is often not even touching you: the Z-curve jumps around. What *is* always decoded before you are the cells directly to your west and south, because they have a lower Morton code.

![The example chunk, with every record marked by whether its west or south neighbour predicts its place](neighbours.svg "Guessing a record from what is already decoded")

So every leaf asks, in order:

1. Is it the same place as my west neighbour? In the world file, this is yes for 74% of the records.
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

Why not Huffman? A Huffman code spends at least one whole bit for every symbol it writes. Huffman coding the depths and the palette indices separately costs at least two bits per record, already more than the 1.34 bits version 2 spends on both. It would need run-lengths on top to get below one bit per symbol, and its tree stored in every chunk. zlib itself is also just LZ77 plus Huffman, so it already did most of what a hand-written Huffman stage would have done. The other agent measured where the gain actually came from:

```
v1 chunks, zlib                                 45.6 MB
v1 chunks, Zopfli (a better deflate encoder)    37.4 MB
split flags + neighbour guesses, zlib           30.2 MB
split flags + neighbour guesses, range coded    18.5 MB
```

So knowing what to predict (steps 1 and 2) already gets more than half of the way, even with plain zlib, and coding those predictions in fractions of a bit (step 3) does the rest.

## The price: decode speed

Here I was right in my prompt. Working with bits is slower than working with bytes, and a range coder is worse than that: every decision depends on the one before it, so there is nothing to vectorize, and it takes about 2.5 decisions per record. zlib's inflate on the other hand is native code that has been optimized for decades.

```
                                    v1          v2
decode every chunk                  1.0-1.2 s   4.7-5.1 s (WebAssembly), 11-12 s (JavaScript)
32 tile burst, initial view z10     195 ms      212 ms
32 tile burst, europe z4            1004 ms     3308 ms
cold query Paris / Tokyo            11.3 / 3.5  28.6 / 9.9 ms
encode every chunk, one thread      100 s       11 s
```

The hope of winning speed back by dropping zlib only came true on the encoding side: the compressor is 9 times faster at writing chunks than zlib at its highest level.

Remember the [WebAssembly decoder I reverted for version 1](/tech/geodata-72-to-45-mib#do-we-actually-need-to-store-the-morton-codes), because it only saved 16 microseconds per chunk? For version 2 it did come back, because here it is 2.4 times as fast as the JavaScript decoder. It follows the same rules as the version 0 decoder: it can only accept or decline a chunk, never report an error, and the JavaScript decoder stays the reference. A test feeds both 8,000 corrupted streams and checks that WebAssembly never accepts one that JavaScript rejects.

A 3.3 times slower europe burst is far outside the 15% slowdown I normally allow for a reader change. I took it anyway, because tiles are not the main goal of this tool. The goal is resolving a WGS84 coordinate to a city, and nobody takes 100 photos per second all around the world, so the tool will be asked for answers more slowly than it can give them, even at 28.6 ms for a cold lookup. The tile burst at a normal zoom level barely changed anyway. A file that is less than half the size, on the other hand, makes it much easier to embed the tool in self-hosted software. The reader still reads version 0 and 1 files, and the compressor can still write version 1, so anyone who prefers speed over size can transcode a file back. Going version 1 → 2 → 1 gives back the exact same bytes.

## How close was Claude to my idea?

| My idea | What version 2 does | |
|---|---|---|
| A Huffman tree built from how often each palette index is used | Adaptive arithmetic (range) coding, where probabilities are learned while decoding and nothing is stored | Same family, one step further: fractions of a bit, and no tree per chunk |
| Run-length encoding | No runs at all, but "the previous record agreed" is part of the context, so a long run costs ~0.005 bits per record | Same effect, different mechanism |
| QOI's "take the last X you output" | "Same as west", "same as south", and otherwise a position in a move-to-front list | The closest match. QOI keeps a table of recently seen pixels; the move-to-front list is recently used palette indices |
| Store depths in fewer bits than a byte | Depths are not stored at all, only one yes/no split flag per node | Further than my idea |
| Do it for both the depths and the palette indices | Both | Yes |
| The palette itself (the list of place ids) | Unchanged, still delta-coded varints | Not touched |
| Bits instead of bytes will be slower | About 4 times slower to decode | Correct |
| Maybe faster because there is no zlib | Encoding 9 times faster, decoding slower | Half right |
| Get `world.bin` below 45.5 MiB | 19.5 MiB | Yes |

The one ingredient my prompt was missing is the second dimension. QOI is made for images stored line by line, where the previous pixel *is* the pixel to your left, so "same as last" works. In a Morton ordered quadtree, the previous record is often on the other side of the chunk, so Claude replaced "the last thing I output" with "the thing to my left" and "the thing below me", which is closer to what PNG's filters do than to QOI. Morton order is what made the codes free in version 1, and it is also what made the previous record a bad guess in version 2.
