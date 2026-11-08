#!/usr/bin/env python3
"""
chunk-to-svg.py -- draw a CGEODATA v2 chunk as its decimal digits.

A version 2 chunk's range-coded stream is one number in [0, 1): the bytes
after the placeholder zero byte are that number's binary digits
(binary-format.md, Section 8.7.1). This script computes the exact decimal
expansion of that number with big-integer arithmetic (no rounding) and
renders it as an SVG thumbnail, pi-poster style, fading out at the bottom.

Usage:
    python3 chunk-to-svg.py chunk-207623-xxd.txt thumbnail.svg

The input is detected by extension: ".txt" is `xxd -p` hex dump text,
anything else is read as raw chunk bytes.
"""

import sys

# ---- tweak me ----
WIDTH, HEIGHT = 600, 400
MARGIN = 16
FONT_SIZE = 11.5            # monospace font size
LINE_HEIGHT = 13.2
DIGITS = None               # None: draw as many digits as fill whole rows
                            # (flush edges); a number: draw exactly that many
ACCENT = "#fbbf24"          # colour of the "0."
INK = "#93c5fd"             # digit colour
BG = "#0b1120"              # background
LABEL = "cgeodata v2 · chunk 207623"
FONT = "Menlo, 'DejaVu Sans Mono', Consolas, monospace"
SKIP_FIRST_BYTE = True      # stream[0] is the encoder's placeholder zero


def load_bytes(path):
    if path.endswith(".txt"):
        with open(path) as f:
            return bytes.fromhex("".join(f.read().split()))
    with open(path, "rb") as f:
        return f.read()


def decimal_digits(data, n):
    """First n decimal digits of 0.<data read as a binary fraction>."""
    if SKIP_FIRST_BYTE:
        data = data[1:]
    num = int.from_bytes(data, "big")
    bits = len(data) * 8
    # floor(num / 2**bits * 10**n), exact thanks to big integers
    return str(num * 10**n >> bits).rjust(n, "0")


def decimal_places(data):
    """How many decimals the number actually has.

    The number is num / 2**bits; its decimal expansion terminates after
    bits - v2(num) places. An odd numerator (the usual case) uses all of
    them; the digits after that are zeros forever.
    """
    if SKIP_FIRST_BYTE:
        data = data[1:]
    num = int.from_bytes(data, "big")
    bits = len(data) * 8
    if num == 0:
        return 0
    return bits - ((num & -num).bit_length() - 1)


def row_capacity():
    """Digit count that fills whole rows: the first row shares its line
    with the "0.", every further row is full width."""
    per_row = int((WIDTH - 2 * MARGIN) / (FONT_SIZE * 0.6))   # chars per line
    rows = int((HEIGHT - 8 - 36) // LINE_HEIGHT) + 1          # rows that fit
    return (per_row - 2) + per_row * (rows - 1)


def render(digits, places=None):
    label = LABEL if places is None else (
        f"{LABEL} &#183; {len(digits):,} of {places:,} decimals shown")
    adv = FONT_SIZE * 0.6                          # monospace advance width
    per_row = int((WIDTH - 2 * MARGIN) / adv)      # characters per line
    rows, y, pos, first = [], 36.0, 0, True
    while pos < len(digits) and y < HEIGHT - 8:
        if first:
            line = f'<tspan fill="{ACCENT}">0.</tspan>{digits[pos:pos + per_row - 2]}'
            pos += per_row - 2
            first = False
        else:
            line = digits[pos:pos + per_row]
            pos += per_row
        rows.append(f'  <text x="{MARGIN}" y="{y:.1f}" fill="url(#fade)" '
                    f'xml:space="preserve">{line}</text>')
        y += LINE_HEIGHT
    body = "\n".join(rows)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}">
  <rect width="{WIDTH}" height="{HEIGHT}" fill="{BG}"/>
  <defs>
    <linearGradient id="fade" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="{HEIGHT}">
      <stop offset="0" stop-color="{INK}" stop-opacity="1"/>
      <stop offset="0.55" stop-color="{INK}" stop-opacity="1"/>
      <stop offset="1" stop-color="{INK}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <g font-family="{FONT}" font-size="{FONT_SIZE}" letter-spacing="0">
{body}
  </g>
  <text x="{WIDTH - MARGIN}" y="20" text-anchor="end" font-family="{FONT}" font-size="10" fill="#64748b">{label}</text>
</svg>
'''


def main():
    if len(sys.argv) != 3:
        sys.exit("usage: chunk-to-svg.py <chunk.xxd.txt | chunk.bin> <out.svg>")
    data = load_bytes(sys.argv[1])
    n = DIGITS if DIGITS is not None else row_capacity()
    digits = decimal_digits(data, n)
    places = decimal_places(data)
    with open(sys.argv[2], "w") as f:
        f.write(render(digits, places))
    print(f"{len(data)} bytes -> 0.{digits[:12]}... ({len(digits)} digits drawn)")
    print(f"wrote {sys.argv[2]}")


if __name__ == "__main__":
    main()