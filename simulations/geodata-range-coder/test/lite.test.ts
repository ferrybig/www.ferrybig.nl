import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
	decodeLite,
	nextRecordEnd,
	previousRecordEnd,
	Probabilities,
	recordsDoneAt,
	slotName,
	slotOf,
} from "../src/codec/lite.ts";
import { EXAMPLES } from "../src/codec/examples.ts";
import { decodeTrace, encodeTrace } from "../src/codec/trace.ts";
import type { DecisionStep } from "../src/codec/types.ts";

const header = (chunk: { maxDepth: number; paletteCount: number; depths: number[] }) => ({
	maxDepth: chunk.maxDepth,
	paletteCount: chunk.paletteCount,
	recordCount: chunk.depths.length,
});

test("the lite decode is the detailed decode, decision for decision", () => {
	for (const { chunk } of EXAMPLES) {
		const { stream } = encodeTrace(chunk);
		const detailed = decodeTrace(header(chunk), stream, chunk);
		const lite = decodeLite(header(chunk), stream);
		const decisions = detailed.steps.filter((s): s is DecisionStep => s.kind === "decision");

		assert.equal(lite.decisions, decisions.length);
		decisions.forEach((d, n) => {
			assert.equal(lite.slot[n], slotOf(d.table, d.ctx));
			assert.equal(lite.bit[n], d.bit);
			assert.equal(lite.pAfter[n], d.pAfter);
			assert.equal(lite.nodeX[n], d.node.x);
			assert.equal(lite.nodeY[n], d.node.y);
			assert.equal(lite.nodeDepth[n], d.node.d);
			assert.equal(lite.pos[n + 1], d.coder.kind === "decode" ? d.coder.pos : -1);
		});
		detailed.records.forEach((r, j) => {
			assert.deepEqual(
				[lite.recX[j], lite.recY[j], lite.recDepth[j], lite.recIndex[j]],
				[r.x, r.y, r.depth, r.index],
			);
		});
	}
});

test("the probabilities at any step are what the coder had learned", () => {
	// Enough decisions to pass several checkpoints: a whole depth 8 chunk of two places.
	const all = 4 ** 8;
	const chunk = { maxDepth: 8, paletteCount: 2, depths: Array(all).fill(8), indices: Array.from({ length: all }, (_, i) => (i % 7 < 5 ? 1 : 2)) };
	const { stream } = encodeTrace(chunk);
	const lite = decodeLite(header(chunk), stream);
	assert.ok(lite.decisions > 8192, "the chunk is big enough to have checkpoints");

	const reference = new Probabilities(lite);
	const jumpy = new Probabilities(lite);
	for (const k of [0, 1, 4095, 4096, 4097, 9000, lite.decisions, 5, 5000, 20000]) {
		const wanted = Math.min(k, lite.decisions);
		// from scratch, one step at a time
		const scratch = new Probabilities(lite);
		for (let i = 1; i <= wanted; i++) scratch.at(i);
		assert.deepEqual(jumpy.at(wanted).p, scratch.p, `p at ${wanted}`);
		assert.deepEqual(jumpy.seen, scratch.seen, `seen at ${wanted}`);
	}
	assert.equal(reference.at(0).used, 0);
	assert.ok(reference.at(100).used > 0);
	assert.equal(slotName(slotOf("sameWest", 7)), "sameWest[7]");
});

test("record boundaries", () => {
	const { chunk } = EXAMPLES[0]!;
	const lite = decodeLite(header(chunk), encodeTrace(chunk).stream);
	assert.equal(recordsDoneAt(lite, 0), 0);
	assert.equal(recordsDoneAt(lite, lite.decisions), chunk.depths.length);
	assert.equal(previousRecordEnd(lite, 0), 0);
	assert.equal(nextRecordEnd(lite, lite.decisions), lite.decisions);
	let k = 0;
	for (let j = 1; j <= chunk.depths.length; j++) {
		k = nextRecordEnd(lite, k);
		assert.equal(recordsDoneAt(lite, k), j);
	}
	assert.equal(previousRecordEnd(lite, k), lite.recEnd[chunk.depths.length - 2]);
});

test("chunk 207623 of the world file decodes to its records", () => {
	const meta = JSON.parse(readFileSync(new URL("../src/real/chunk-207623.json", import.meta.url), "utf8")) as {
		maxDepth: number;
		paletteCount: number;
		recordCount: number;
		bytes: number;
		recordsSha256: string;
		places: string[];
	};
	const stream = new Uint8Array(readFileSync(new URL("../src/real/chunk-207623.bin", import.meta.url)));
	assert.equal(stream.length, meta.bytes);
	assert.equal(meta.places.length, meta.paletteCount + 1);

	const lite = decodeLite(meta, stream);
	assert.equal(lite.recX.length, meta.recordCount);
	assert.equal(lite.pos[lite.decisions], stream.length);

	// The checksum is over the records as the reader loc-to-city gives them:
	// every depth as one byte, then every palette index as one byte.
	const hash = createHash("sha256");
	hash.update(lite.recDepth);
	hash.update(Uint8Array.from(lite.recIndex));
	assert.equal(hash.digest("hex"), meta.recordsSha256);
});
