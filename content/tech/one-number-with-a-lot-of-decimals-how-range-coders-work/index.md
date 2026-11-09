---
date: "2026-11-08"
tags: ["tech", "geo", "compression", "binary-format"]
authors:
    - name: Fernando
      url: https://www.ferrybig.nl/
    - name: Vibe GLM 5.3
      url: https://chat.mistral.ai/
      role: "draft"
    - name: Claude Haiku 5.5
      url: https://claude.com/claude-code
      role: "reviewer"
thumbnail:
    image: ./chunk.svg
    alt: The number stored in chunk 207623
---

# One number with a lot of decimals: how range coders work

*This is part of the series on my geodata file format. The previous posts got us to a [range coder in version 2](/tech/beating-zlib-on-geodata) and a 19.5 MiB file, but honestly: I shipped a compressor I could not fully explain. This post is the explanation I wish I had read first.*

When I wrote about version 2 of the format, I described how the chunks became a long list of yes/no decisions, *does this cell split?*, *same place as the west neighbour?*, and how those decisions are fed into a range coder, the same one that lives inside LZMA, `xz` and 7-Zip. I could use it. It beat zlib by 57%. But if you had asked me *why* it works, I would have changed the subject, because two things about it genuinely bothered me:

1. **How do you store half a bit?** My format spends 1.34 bits *per record*, and the common case costs 0.005 bits. A bit is the smallest thing a computer stores. What does a fraction of a bit even look like?
2. **How can a decoder read 4 bytes and get more than 4 bytes of data out of them?** The decoder keeps a 32-bit register, reads a few bytes, and reconstructs hundreds of thousands of decisions. That looks like information appearing out of nowhere.

I asked Claude to explain it, and the answer it gave made the whole thing click at once. Not through the register, not through the 12-bit probabilities, but through one single idea:

> **The compressed chunk is not a list of codes. It is one number between 0 and 1, written in binary, with a lot of decimals.**

Something like 0.968115671174500935737799… except it goes on for thousands of digits, and the decoder never needs all of them at once. Once you see the chunk as a single number, both of my questions answer themselves.

## The encoder: twenty questions in reverse

The classic way to think of the encoder is the game of twenty questions, played in reverse. You (the encoder) already know the answers, the records, the split flags, the palette indices. Your job is to agree with the decoder on a number that encodes those answers, using rules you both know.

You maintain an interval `[low, high)`, starting as `[0, 1)`. Every yes/no question cuts that interval into two parts, sized by how likely each answer is, and keeps the part the true answer lives in.

The first question is the one everyone knows: *is the number smaller than 0.5?* The interval splits in half. If the answer is "yes", `high` moves down to 0.5; if "no", `low` moves up to 0.5. That is [arithmetic coding](https://en.wikipedia.org/wiki/Arithmetic_coding) with a probability of 50%, and it costs one bit, you kept half the interval, and writing down which half takes −log₂(½) = 1 binary digit.

The next question does the same thing again, inside the remaining interval. But now the split does not have to be in half. Suppose the question is *same place as your west neighbour?*, and in this situation the model says "yes" 90% of the time. Then the interval splits 90/10 instead of 50/50: a "yes" keeps the bottom 90% of `[low, high)` and a "no" keeps the top 10%. Answer "yes", and `high` comes down to `low + 0.9 × (high − low)`, the interval barely shrank. Answer "no", and `low` jumps up almost to `high`, the interval collapsed to a tenth.

That is where fractional bits come from. A question with probability `p` shrinks the interval by a factor of `p`, so it costs −log₂(p) bits to record which piece was kept:

| Chance the guess is right | Cost when right |
| ------------------------- | --------------- |
| 50%                       | 1 bit           |
| 90%                       | 0.15 bits       |
| 99%                       | 0.015 bits      |
| 99.6% (our maximum)       | 0.005 bits      |

A *bit* was never the real unit. The unit is −log₂(p), and it only happens to be 1 for a coin flip. A bit is just the price of one specific question, the 50/50 one.

This is also why the format gets its "run-length encoding without run lengths". Ten consecutive well-predicted decisions at 99.6% shrink the interval by a factor of 0.996¹⁰ ≈ 0.96, almost nothing. Deep inside a city, where every cell is the same place as its west neighbour, you can make hundreds of decisions and the interval has barely moved. No run was ever counted, no length was ever stored; the interval simply refused to shrink.

### A tiny worked example

Four decisions, starting from `[0, 1)`:

| # | Question                              | Split    | Answer | New interval      |
| - | ------------------------------------- | -------- | ------ | ----------------- |
| 1 | 50/50                                 | 50 / 50  | 0      | `[0, 0.5)`        |
| 2 | "same as west?", 90% yes              | 90 / 10  | 0      | `[0, 0.45)`       |
| 3 | "same as west?", 90% yes              | 90 / 10  | 1      | `[0.405, 0.45)`   |
| 4 | 50/50                                 | 50 / 50  | 1      | `[0.4275, 0.45)`  |

The final interval is `[0.4275, 0.45)`, width 0.0225. Any number inside it identifies the whole sequence of answers, the encoder can pick, say, 0.43. Writing a number inside an interval of width 0.0225 takes about −log₂(0.0225) ≈ 5.5 binary digits, and indeed the four decisions cost 1 + 0.15 + 3.3 + 1 ≈ 5.5 bits. The maths keeps its promise.

Notice what the encoder wrote down: not the decisions, not the probabilities, just **one number inside the final interval**. That number is the compressed stream.

## The decoder: asking the questions again

Now flip it around. The decoder knows the rules (the order of the questions) and it knows the leading digits of the number, the first bytes of the chunk. It rebuilds the *same* interval splits, in the same order, and at every question asks: which side of the split does the number fall on?

- Is the number below the 0.5 mark? Then the first answer was "0", and I zoom into the bottom half.
- Inside that, is it below the 90% mark? Then the second answer was "yes", and so on.

Each answer is recovered exactly as cheaply as it was spent, and the decoder zooms into ever smaller intervals around the number, peeling off one answer per zoom. It never needs to "see" the whole number, only enough leading digits to tell which side of the current boundary it is on.

And that is the answer to my second question. The decoder's 4-byte register is not the data. **It is a window onto a much longer fraction.** The decoder looks at the leading digits, makes a decision, and if the leading digits didn't even change, because the decision was very likely and both sides of the split start with the same digits, it only needs to shift in *one more digit* to keep making progress. A byte of input is consumed only once about eight bits of interval precision have been spent, and at 99.6% per decision, eight bits of precision buy you roughly 1,400 decisions. One byte serves a thousand questions not because data was created from nothing, but because the *model* already knew the answers; the stream only had to record the occasional surprise.

Nothing is magic, and nothing is lost: the information was never in those 4 bytes to begin with. It was in the probabilities the encoder and decoder *both* recompute on the fly, and the bytes only settle the cases the model couldn't predict.

## The same thing, in integers

The real decoder in the format does exactly this, just with 32-bit integers so there is no floating point and every split lands on an exact boundary. Instead of `[low, high)` it keeps two numbers:

- `range`, the width of the current interval (its precision budget),
- `code`, where the encoder's number sits, relative to the interval.

A probability `p` is a 12-bit integer: the chance out of 4096 that the answer is 0.

```text
bound = (range >> 12) × p          # the slice reserved for answer 0
if code < bound:  bit = 0;  range = bound
else:            bit = 1;  code = code − bound;  range = range − bound

while range < 2^24:                 # precision spent: slide the window
    range = range × 256
    code = code × 256 + stream[pos];  pos = pos + 1
```

That `bound` line is the 90/10 split from the example; the two branches are the high/low threshold update; and the `while` loop is the "shift in one more digit" step, done eight bits at a time. `range` below 2²⁴ means fewer than 8 bits of useful precision are left, so the decoder slides its window along the long fraction by one byte.

The encoder is the same algorithm run forwards, tracking `low` and `range` and emitting a byte every time the top bits of `low` are settled. Two details of it deserve their own mention, because every real implementation has to deal with them and my earlier posts skipped them:

- **The carry.** A series of unlikely answers can push `low` up and over a boundary that was already emitted, rippling a carry into bytes written long ago. LZMA-style coders solve this by holding back a "cache" byte and a counter of pending `0xFF` bytes, and releasing them only when the carry is known.
- **The flush.** At the end, the encoder writes enough bytes to pin down a number inside the final interval, five bytes of register-dumping. On the tiny 16-record example in the previous post, 5 of the 9 bytes were exactly this overhead. That is also why the decoder always starts at byte 5: the first byte of every stream is a guaranteed 0, a placeholder the encoder's bookkeeping emits before anything is known.

## The part I keep coming back to

The range coder itself gives you nothing. On its own it is a fair but unbeatable exchange rate between probabilities and digits, a currency converter, not a source of money. Everything I gained in version 2 came from knowing the data: the quadtree's split flags, the west and south neighbours, the move-to-front list, the contexts. The range coder's job is only to let me spend that knowledge at its true price, down to the fraction of a bit, without paying [Huffman's](https://en.wikipedia.org/wiki/Huffman_coding) whole-bit markup.

And once the chunk is *one number with a lot of decimals*, the picture is hard to unsee: every question nudges a threshold, every good prediction barely dents the interval, and the file on disk is just the shortest fraction that lands inside it.
