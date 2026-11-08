import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { decodeTrace, encodeTrace } from "../src/codec/trace.ts";
import { EXAMPLES, SPEC_EXAMPLE } from "../src/codec/examples.ts";
import type { Chunk, DecisionStep, Step } from "../src/codec/types.ts";

const hex = (bytes: ArrayLike<number>) =>
	Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

const decisions = (steps: Step[]) =>
	steps.filter((s): s is DecisionStep => s.kind === "decision");

const label = (s: DecisionStep) => `${s.table}[${s.ctx}]=${s.bit}`;

function roundTrip(chunk: Chunk) {
	const encoded = encodeTrace(chunk);
	const decoded = decodeTrace(
		{
			maxDepth: chunk.maxDepth,
			paletteCount: chunk.paletteCount,
			recordCount: chunk.depths.length,
		},
		encoded.stream,
		chunk,
	);
	return { encoded, decoded };
}

test("Appendix A.6 of the spec: the stream, byte for byte", () => {
	const { encoded } = roundTrip(SPEC_EXAMPLE.chunk);
	assert.equal(hex(encoded.stream), "00a51164ba0000");
});

test("Appendix A.6 of the spec: the decisions, in order", () => {
	// Copied from the table in A.6, in the spec's own order.
	const expected = [
		"split[0]=1",
		"split[16]=0",
		"rankLength[0]=1",
		"rankLength[1]=0",
		"rankBits[32]=0",
		"split[20]=1",
		"sameWest[73]=0",
		"rankLength[32]=1",
		"rankLength[33]=0",
		"rankBits[32]=0",
		"sameWest[73]=0",
		"rankLength[32]=1",
		"rankLength[33]=0",
		"rankBits[32]=0",
		"sameWest[65]=0",
		"sameSouth[65]=0",
		"rankLength[96]=0",
		"sameWest[93]=1",
		"split[17]=0",
		"sameSouth[32]=1",
		"split[22]=1",
		"sameWest[73]=0",
		"sameSouth[73]=0",
		"rankLength[96]=0",
	];
	const { encoded, decoded } = roundTrip(SPEC_EXAMPLE.chunk);
	assert.deepEqual(decisions(encoded.steps).map(label), expected);
	assert.deepEqual(decisions(decoded.steps).map(label), expected);
});

for (const example of EXAMPLES) {
	test(`${example.id}: decoding gives the records back`, () => {
		const { encoded, decoded } = roundTrip(example.chunk);
		assert.deepEqual(
			decoded.records.map((r) => r.depth),
			example.chunk.depths,
		);
		assert.deepEqual(
			decoded.records.map((r) => r.index),
			example.chunk.indices,
		);
		assert.deepEqual(decoded.records, encoded.records);
	});

	test(`${example.id}: encoder and decoder agree on every decision`, () => {
		const { encoded, decoded } = roundTrip(example.chunk);
		const e = decisions(encoded.steps);
		const d = decisions(decoded.steps);
		assert.equal(e.length, d.length);
		for (let i = 0; i < e.length; i++) {
			assert.equal(label(e[i]!), label(d[i]!), `decision ${i}`);
			assert.equal(e[i]!.pBefore, d[i]!.pBefore, `decision ${i}`);
			assert.equal(e[i]!.coder.bound, d[i]!.coder.bound, `decision ${i}`);
			assert.equal(e[i]!.coder.rangeAfter, d[i]!.coder.rangeAfter, `decision ${i}`);
		}
	});
}

test("the blog example has the 13 split flags the post counts", () => {
	const { encoded } = roundTrip(EXAMPLES[0]!.chunk);
	const flags = decisions(encoded.steps).filter((s) => s.table === "split");
	assert.equal(flags.length, 13);
	assert.equal(flags.map((s) => s.bit).join(""), "1011000011000");
});

test("the registers stay in range and the bytes add up", () => {
	for (const example of EXAMPLES) {
		const { encoded, decoded } = roundTrip(example.chunk);
		for (const s of decisions(encoded.steps)) {
			assert.ok(s.coder.rangeAfter >= 2 ** 24 && s.coder.rangeAfter <= 0xffffffff);
		}
		const emitted = encoded.steps.flatMap((s) =>
			s.kind === "decision" && s.coder.kind === "encode"
				? s.coder.emitted
				: s.kind === "flush"
					? s.emitted
					: [],
		);
		assert.equal(hex(emitted), hex(encoded.stream));
		const consumed = decisions(decoded.steps).flatMap((s) =>
			s.coder.kind === "decode" ? s.coder.consumed : [],
		);
		assert.equal(hex([...encoded.stream.slice(0, 5), ...consumed]), hex(encoded.stream));
	}
});

/** A small deterministic generator, so a failure can be replayed. */
function rng(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
}

function randomChunk(seed: number): Chunk {
	const rand = rng(seed);
	const maxDepth = 1 + Math.floor(rand() * 5);
	const paletteCount = Math.floor(rand() * 9);
	const depths: number[] = [];
	const indices: number[] = [];
	let last = 0;
	const build = (d: number) => {
		if (d === maxDepth || rand() < 0.45) {
			// Mostly the same place as the record before, as real data is.
			if (rand() > 0.6) last = Math.floor(rand() * (paletteCount + 1));
			depths.push(d);
			indices.push(last);
			return;
		}
		for (let i = 0; i < 4; i++) build(d + 1);
	};
	build(0);
	// Records may end before the chunk does.
	const keep = rand() < 0.3 ? 1 + Math.floor(rand() * depths.length) : depths.length;
	return {
		maxDepth,
		paletteCount,
		depths: depths.slice(0, keep),
		indices: indices.slice(0, keep),
	};
}

test("2000 random chunks survive a round trip", () => {
	for (let seed = 1; seed <= 2000; seed++) {
		const chunk = randomChunk(seed);
		const { decoded } = roundTrip(chunk);
		assert.deepEqual(
			decoded.records.map((r) => [r.depth, r.index]),
			chunk.depths.map((d, i) => [d, chunk.indices[i]]),
			`seed ${seed}`,
		);
	}
});

// The reference implementation lives in the loc-to-city repository. When it
// is checked out next to this one, the bytes have to be the same as its.
const REFERENCE =
	process.env.LOC_TO_CITY_RANGE_CHUNK ??
	"/home/fernando/Dev/Private/loc-to-city/reader/src/rangeChunk.ts";

test("same bytes as loc-to-city's encoder", { skip: !existsSync(REFERENCE) }, async () => {
	const reference = (await import(REFERENCE)) as {
		encodeRangeCodedRecords(
			depths: number[],
			indices: number[],
			paletteCount: number,
			maxDepth: number,
		): Uint8Array;
	};
	const chunks = [...EXAMPLES.map((e) => e.chunk)];
	for (let seed = 1; seed <= 500; seed++) chunks.push(randomChunk(seed));
	for (const chunk of chunks) {
		const mine = encodeTrace(chunk).stream;
		const theirs = reference.encodeRangeCodedRecords(
			chunk.depths,
			chunk.indices,
			chunk.paletteCount,
			chunk.maxDepth,
		);
		assert.equal(hex(mine), hex(theirs));
	}
});
