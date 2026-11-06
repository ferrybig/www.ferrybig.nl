import type { BitCoder } from "./coder.ts";
import {
	ADAPT_SHIFT,
	PROB_INIT,
	PROB_ONE,
	TABLE_SIZES,
	type Category,
	type Chunk,
	type CoderStep,
	type DecisionStep,
	type LeafContext,
	type LeafResult,
	type Neighbour,
	type NodeRef,
	type Table,
} from "./types.ts";

/**
 * The traversal of binary-format.md Section 8.7.2 to 8.7.4, written once
 * for both directions: the encoder passes what it knows through `truth`,
 * the decoder passes nothing, and `coder.code` hands back the bit either
 * way. rangeChunk.ts in loc-to-city has the same walk twice, once to read
 * and once to write; sharing it here means a view can never show the
 * encoder doing something the decoder would not.
 */
export interface WalkOptions {
	maxDepth: number;
	paletteCount: number;
	recordCount: number;
	coder: BitCoder<CoderStep>;
	/** The records to write. Absent when decoding. */
	truth?: Chunk;
}

export interface WalkResult {
	steps: DecisionStep[];
	records: LeafResult[];
}

function category(n: Neighbour | null, d: number): Category {
	if (n === null) return 0;
	return n.depth <= d ? 1 : n.depth === d + 1 ? 2 : 3;
}

export function walk(options: WalkOptions): WalkResult {
	const { maxDepth: D, paletteCount, recordCount, coder, truth } = options;
	const N = 2 ** D;

	const probs = {} as Record<Table, Uint16Array>;
	const seen = {} as Record<Table, Uint32Array>;
	for (const table of Object.keys(TABLE_SIZES) as Table[]) {
		probs[table] = new Uint16Array(TABLE_SIZES[table]).fill(PROB_INIT);
		seen[table] = new Uint32Array(TABLE_SIZES[table]);
	}
	// row[y] / col[x]: the last record decoded in that row / column.
	// In Morton order that is the west / south neighbour of the next node.
	const row: (Neighbour | null)[] = new Array(N).fill(null);
	const col: (Neighbour | null)[] = new Array(N).fill(null);
	const mtf = Array.from({ length: paletteCount + 1 }, (_, k) => k);

	const steps: DecisionStep[] = [];
	const records: LeafResult[] = [];

	const stack: NodeRef[] = [{ d: 0, x: 0, y: 0 }];
	let j = 0;
	let prev = -1;
	let code = 0;

	/** One decision: look up the probability, code the bit, learn from it. */
	function decide(
		table: Table,
		ctx: number,
		truthBit: () => 0 | 1,
		at: Pick<
			DecisionStep,
			"node" | "west" | "south" | "westCategory" | "southCategory"
		>,
	): DecisionStep {
		const p = probs[table][ctx]!;
		const step = coder.code(p, truthBit);
		const bit = step.bit;
		const pAfter =
			bit === 0 ? p + ((PROB_ONE - p) >> ADAPT_SHIFT) : p - (p >> ADAPT_SHIFT);
		probs[table][ctx] = pAfter;
		const timesSeen = seen[table][ctx]!;
		seen[table][ctx] = timesSeen + 1;
		const result: DecisionStep = {
			kind: "decision",
			n: steps.length,
			table,
			ctx,
			bit,
			pBefore: p,
			pAfter,
			cost: -Math.log2(bit === 0 ? p / PROB_ONE : 1 - p / PROB_ONE),
			seen: timesSeen,
			...at,
			record: j,
			code,
			mtf: mtf.slice(),
			coder: step,
		};
		steps.push(result);
		return result;
	}

	while (j < recordCount) {
		const node = stack.pop();
		if (node === undefined) {
			throw new RangeError(
				`record_count ${recordCount} is more than the ${j} records the quadtree has`,
			);
		}
		const { d, x, y } = node;
		const west = x > 0 ? row[y]! : null;
		const south = y > 0 ? col[x]! : null;
		const westCategory = category(west, d);
		const southCategory = category(south, d);
		const at = { node, west, south, westCategory, southCategory };

		if (truth) {
			const depth = truth.depths[j]!;
			if (depth < d || depth > D) {
				throw new RangeError(`record ${j} at depth ${depth} does not tile the chunk`);
			}
		}

		if (d < D) {
			const split = decide(
				"split",
				d * 16 + westCategory * 4 + southCategory,
				() => (truth!.depths[j]! > d ? 1 : 0),
				at,
			);
			if (split.bit === 1) {
				const h = 2 ** (D - d - 1);
				// Pushed in reverse, so that the south-west child pops first.
				stack.push({ d: d + 1, x: x + h, y: y + h });
				stack.push({ d: d + 1, x, y: y + h });
				stack.push({ d: d + 1, x: x + h, y });
				stack.push({ d: d + 1, x, y });
				continue;
			}
		}

		// A leaf: which place is it?
		const wv = west ? west.index : -1;
		const sv = south ? south.index : -1;
		const leafContext: LeafContext = {
			d,
			westEqualsSouth: wv === sv,
			prevEqualsWest: prev === wv,
			prevEqualsSouth: prev === sv,
			westCategory,
		};
		const c =
			(d * 8 +
				(leafContext.westEqualsSouth ? 4 : 0) +
				(leafContext.prevEqualsWest ? 2 : 0) +
				(leafContext.prevEqualsSouth ? 1 : 0)) *
				4 +
			westCategory;
		const mtfBefore = mtf.slice();
		const trueIndex = () => truth!.indices[j]!;
		const truthBit =
			(is: number) =>
			(): 0 | 1 =>
				trueIndex() === is ? 1 : 0;

		let v = -1;
		let how: LeafResult["how"] = "rank";
		let rank: number | undefined;
		let last: DecisionStep | undefined;

		if (wv >= 0) {
			last = decide("sameWest", c, truthBit(wv), at);
			last.leafContext = leafContext;
			if (last.bit === 1) {
				v = wv;
				how = "west";
			}
		}
		if (v < 0 && sv >= 0 && sv !== wv) {
			last = decide("sameSouth", c, truthBit(sv), at);
			last.leafContext = leafContext;
			if (last.bit === 1) {
				v = sv;
				how = "south";
			}
		}
		if (v < 0) {
			// Neither neighbour: the position in the move-to-front list,
			// without the neighbours' own entries, as an Elias gamma code.
			const trueRank = () => {
				const target = trueIndex();
				let r = 0;
				for (const t of mtf) {
					if (t === target) break;
					if (t !== wv && t !== sv) r++;
				}
				return r;
			};
			const trueLength = () => 31 - Math.clz32(trueRank() + 1);
			const cc = (wv >= 0 ? 32 : 0) + (sv >= 0 ? 64 : 0);
			const gamma: (0 | 1)[] = [];
			let nb = 0;
			for (;;) {
				const length: number = nb;
				last = decide("rankLength", cc + nb, () => (length < trueLength() ? 1 : 0), at);
				gamma.push(last.bit);
				last.rankBits = gamma.slice();
				if (last.bit === 0) break;
				if (++nb === 32) throw new RangeError(`record ${j}'s palette rank is 2^32 or more`);
			}
			let value = 1;
			for (let k = nb - 1; k >= 0; k--) {
				last = decide("rankBits", nb * 32 + k, () => (((trueRank() + 1) >>> k) & 1) as 0 | 1, at);
				value = value * 2 + last.bit;
				gamma.push(last.bit);
				last.rankBits = gamma.slice();
			}
			rank = value - 1;
			let left = rank;
			let p = 0;
			for (; ; p++) {
				if (p > paletteCount) {
					throw new RangeError(`record ${j}'s palette rank ${rank} is past the palette`);
				}
				const t = mtf[p]!;
				if (t === wv || t === sv) continue;
				if (left === 0) break;
				left--;
			}
			v = mtf[p]!;
		}
		if (truth && v !== trueIndex()) {
			throw new Error(`record ${j} decoded as ${v}, expected ${trueIndex()}`);
		}

		const at0 = mtf.indexOf(v);
		mtf.splice(at0, 1);
		mtf.unshift(v);

		const size = 2 ** (D - d);
		const result: LeafResult = {
			record: j,
			code,
			depth: d,
			x,
			y,
			index: v,
			how,
			...(rank === undefined ? {} : { rank }),
			mtfBefore,
			mtfAfter: mtf.slice(),
		};
		last!.result = result;
		records.push(result);

		const neighbour: Neighbour = { record: j, index: v, depth: d };
		row.fill(neighbour, y, y + size);
		col.fill(neighbour, x, x + size);
		code += size * size;
		prev = v;
		j++;
	}

	return { steps, records };
}
