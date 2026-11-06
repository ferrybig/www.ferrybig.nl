import { TracingDecoder } from "./coder.ts";
import { PROB_INIT, TABLE_SIZES, type DecisionStep, type Table } from "./types.ts";
import { walk } from "./walk.ts";

/**
 * A decode of a real chunk, for the view that has no room for a step object
 * per decision: a chunk of 35,000 records is about 100,000 decisions. Each
 * decision is a few numbers in a typed array, and `Probabilities` rebuilds
 * what the coder had learned at any point from checkpoints. It is the same
 * walk and the same decoder as the other demos use, so it cannot disagree
 * with them.
 */
export interface LiteTrace {
	header: { maxDepth: number; paletteCount: number; recordCount: number };
	stream: Uint8Array;
	/** Number of binary decisions in the chunk. */
	decisions: number;

	// One entry per decision, `n` from 0.
	/** Which probability decided it, as a slot (see `slotName`). */
	slot: Uint16Array;
	bit: Uint8Array;
	/** The probability of a 0 after the decision. */
	pAfter: Uint16Array;
	/** The cell the decision was about. */
	nodeDepth: Uint8Array;
	nodeX: Uint16Array;
	nodeY: Uint16Array;

	/** Stream position after `k` decisions, for `k` from 0 to `decisions`. */
	pos: Uint32Array;

	// One entry per record.
	recX: Uint16Array;
	recY: Uint16Array;
	recDepth: Uint8Array;
	recIndex: Uint16Array;
	/** How many decisions were done when the record was finished. */
	recEnd: Uint32Array;

	checkpoints: Checkpoint[];
}

interface Checkpoint {
	p: Uint16Array;
	seen: Uint32Array;
}

/** The probabilities are saved every this many decisions. */
const CHECKPOINT_EVERY = 4096;

export const TABLES = Object.keys(TABLE_SIZES) as Table[];
const BASE = {} as Record<Table, number>;
let total = 0;
for (const table of TABLES) {
	BASE[table] = total;
	total += TABLE_SIZES[table];
}
/** Every probability of the format has a slot: its table's offset plus its context. */
export const SLOTS = total;

export const slotOf = (table: Table, ctx: number) => BASE[table] + ctx;

export function slotName(slot: number): string {
	for (let i = TABLES.length - 1; i >= 0; i--) {
		const table = TABLES[i]!;
		if (slot >= BASE[table]) return `${table}[${slot - BASE[table]}]`;
	}
	throw new RangeError(`no probability has slot ${slot}`);
}

export function decodeLite(header: LiteTrace["header"], stream: Uint8Array): LiteTrace {
	const slot: number[] = [];
	const bit: number[] = [];
	const pAfter: number[] = [];
	const nodeDepth: number[] = [];
	const nodeX: number[] = [];
	const nodeY: number[] = [];
	const pos: number[] = [5];
	const recX: number[] = [];
	const recY: number[] = [];
	const recDepth: number[] = [];
	const recIndex: number[] = [];
	const recEnd: number[] = [];

	// What the coder has learned, copied now and then.
	const p = new Uint16Array(SLOTS).fill(PROB_INIT);
	const seen = new Uint32Array(SLOTS);
	const checkpoints: Checkpoint[] = [{ p: p.slice(), seen: seen.slice() }];

	const decoder = new TracingDecoder(stream);
	walk({
		...header,
		coder: decoder,
		sink: {
			decision(step: DecisionStep) {
				const at = slotOf(step.table, step.ctx);
				slot.push(at);
				bit.push(step.bit);
				pAfter.push(step.pAfter);
				nodeDepth.push(step.node.d);
				nodeX.push(step.node.x);
				nodeY.push(step.node.y);
				pos.push(decoder.pos);
				p[at] = step.pAfter;
				seen[at]!++;
				if (slot.length % CHECKPOINT_EVERY === 0) checkpoints.push({ p: p.slice(), seen: seen.slice() });
			},
			record(r) {
				recX.push(r.x);
				recY.push(r.y);
				recDepth.push(r.depth);
				recIndex.push(r.index);
				recEnd.push(slot.length);
			},
		},
	});
	if (decoder.pos !== stream.length) {
		throw new RangeError(`${stream.length - decoder.pos} trailing bytes after the stream`);
	}
	return {
		header,
		stream,
		decisions: slot.length,
		slot: Uint16Array.from(slot),
		bit: Uint8Array.from(bit),
		pAfter: Uint16Array.from(pAfter),
		nodeDepth: Uint8Array.from(nodeDepth),
		nodeX: Uint16Array.from(nodeX),
		nodeY: Uint16Array.from(nodeY),
		pos: Uint32Array.from(pos),
		recX: Uint16Array.from(recX),
		recY: Uint16Array.from(recY),
		recDepth: Uint8Array.from(recDepth),
		recIndex: Uint16Array.from(recIndex),
		recEnd: Uint32Array.from(recEnd),
		checkpoints,
	};
}

/** How many records are finished after `k` decisions. */
export function recordsDoneAt(trace: LiteTrace, k: number): number {
	return upperBound(trace.recEnd, k);
}

/** The first number of decisions, after `k`, at which a record is finished (or the end). */
export function nextRecordEnd(trace: LiteTrace, k: number): number {
	return trace.recEnd[upperBound(trace.recEnd, k)] ?? trace.decisions;
}

/** The last number of decisions, before `k`, at which a record was finished (or 0). */
export function previousRecordEnd(trace: LiteTrace, k: number): number {
	const before = lowerBound(trace.recEnd, k);
	return before === 0 ? 0 : trace.recEnd[before - 1]!;
}

/** Index of the first element above `value`. */
function upperBound(sorted: Uint32Array, value: number): number {
	let lo = 0;
	let hi = sorted.length;
	while (lo < hi) {
		const mid = (lo + hi) >>> 1;
		if (sorted[mid]! <= value) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

/** Index of the first element that is not below `value`. */
function lowerBound(sorted: Uint32Array, value: number): number {
	let lo = 0;
	let hi = sorted.length;
	while (lo < hi) {
		const mid = (lo + hi) >>> 1;
		if (sorted[mid]! < value) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

/**
 * What the coder had learned after `k` decisions. It keeps the state it
 * last built, so stepping forward costs a few steps, and goes back to the
 * nearest checkpoint when asked for an earlier state.
 */
export class Probabilities {
	/** The chance of a 0 in every slot (4096 is a sure 0). */
	readonly p = new Uint16Array(SLOTS);
	/** How often each slot has decided something. */
	readonly seen = new Uint32Array(SLOTS);
	private k = 0;
	private readonly trace: LiteTrace;

	constructor(trace: LiteTrace) {
		this.trace = trace;
		this.restore(0);
	}

	at(k: number): this {
		const wanted = Math.max(0, Math.min(this.trace.decisions, k));
		if (wanted < this.k || wanted - this.k > CHECKPOINT_EVERY) {
			this.restore(Math.floor(wanted / CHECKPOINT_EVERY));
		}
		const { slot, pAfter } = this.trace;
		while (this.k < wanted) {
			const at = slot[this.k]!;
			this.p[at] = pAfter[this.k]!;
			this.seen[at]!++;
			this.k++;
		}
		return this;
	}

	/** The `count` slots that decided the most so far, the busiest first. */
	busiest(count: number): number[] {
		const used: number[] = [];
		for (let i = 0; i < SLOTS; i++) if (this.seen[i]! > 0) used.push(i);
		return used.sort((a, b) => this.seen[b]! - this.seen[a]! || a - b).slice(0, count);
	}

	/** How many slots have decided something. */
	get used(): number {
		let n = 0;
		for (let i = 0; i < SLOTS; i++) if (this.seen[i]! > 0) n++;
		return n;
	}

	private restore(checkpoint: number) {
		const saved = this.trace.checkpoints[Math.min(checkpoint, this.trace.checkpoints.length - 1)]!;
		this.p.set(saved.p);
		this.seen.set(saved.seen);
		this.k = Math.min(checkpoint, this.trace.checkpoints.length - 1) * CHECKPOINT_EVERY;
	}
}
