/**
 * The shapes shared by the codec and the views.
 *
 * The codec follows binary-format.md Section 8.7 of loc-to-city, and every
 * constant is the one in that section. The codec exists to be watched, so
 * unlike the real one it writes down everything it does: each binary
 * decision becomes a `DecisionStep` that the views replay.
 */

export const PROB_BITS = 12;
export const PROB_ONE = 1 << PROB_BITS;
export const PROB_INIT = PROB_ONE / 2;
export const ADAPT_SHIFT = 4;
/** The coder shifts in or out a byte whenever `range` drops below this. */
export const TOP = 2 ** 24;

export type Table = "split" | "sameWest" | "sameSouth" | "rankLength" | "rankBits";

export const TABLE_SIZES: Record<Table, number> = {
	split: 256,
	sameWest: 544,
	sameSouth: 544,
	rankLength: 128,
	rankBits: 1024,
};

/** The records of one chunk, as version 1 stored them. */
export interface Chunk {
	/** `D`: the quadtree is `2^D` cells wide. */
	maxDepth: number;
	/** `P`: palette indices run from 0 (no place) to `P`. */
	paletteCount: number;
	/** Depth of each record, in Morton order. */
	depths: number[];
	/** Palette index of each record, in Morton order. */
	indices: number[];
}

export interface NodeRef {
	d: number;
	/** South-west corner, in full-precision cells. */
	x: number;
	y: number;
}

/** A record that was already decoded when a node asked about it. */
export interface Neighbour {
	/** Position in the record list. */
	record: number;
	index: number;
	depth: number;
}

/** 0: none, 1: as big or bigger, 2: one level deeper, 3: more than that. */
export type Category = 0 | 1 | 2 | 3;

/** What went into the context of a `sameWest` or `sameSouth` decision. */
export interface LeafContext {
	d: number;
	westEqualsSouth: boolean;
	prevEqualsWest: boolean;
	prevEqualsSouth: boolean;
	westCategory: Category;
}

/** Everything the decoder will know about a record once it is done. */
export interface LeafResult {
	record: number;
	/** Where the record starts (its stored Morton code). */
	code: number;
	depth: number;
	x: number;
	y: number;
	index: number;
	how: "west" | "south" | "rank";
	/** The position in the move-to-front list, when `how` is `rank`. */
	rank?: number;
	mtfBefore: number[];
	mtfAfter: number[];
}

interface CoderStepBase {
	p: number;
	bit: 0 | 1;
	rangeBefore: number;
	/** `(range >> 12) * p`: the size of the part for a 0. */
	bound: number;
	/** The range once the decision is made, before any byte shifts. */
	rangeMid: number;
	rangeAfter: number;
	/** How often the loop that restores `range >= 2^24` ran. */
	shifts: number;
}

export interface EncoderCoderStep extends CoderStepBase {
	kind: "encode";
	lowBefore: number;
	lowMid: number;
	lowAfter: number;
	/** Bytes that left the encoder during this step. */
	emitted: number[];
	/** Bytes held back in case a carry still changes them. */
	pending: number[];
}

export interface DecoderCoderStep extends CoderStepBase {
	kind: "decode";
	codeBefore: number;
	codeMid: number;
	codeAfter: number;
	/** Bytes that were shifted into `code` during this step. */
	consumed: number[];
	/** Position in the stream after this step. */
	pos: number;
}

export type CoderStep = EncoderCoderStep | DecoderCoderStep;

export interface DecisionStep {
	kind: "decision";
	/** Number of the decision, from 0. */
	n: number;
	table: Table;
	ctx: number;
	bit: 0 | 1;
	pBefore: number;
	pAfter: number;
	/** `-log2` of the chance the coder gave to the answer it saw. */
	cost: number;
	/** How many decisions used this context before this one. */
	seen: number;
	node: NodeRef;
	west: Neighbour | null;
	south: Neighbour | null;
	westCategory: Category;
	southCategory: Category;
	/** The record this node is, or the next one to be decoded below it. */
	record: number;
	/** Where that record would start. */
	code: number;
	leafContext?: LeafContext;
	/** All bits of this leaf's rank code so far, this decision included. */
	rankBits?: (0 | 1)[];
	/** The move-to-front list the leaf is looked up in. */
	mtf: number[];
	/** Set on the decision that finishes a record. */
	result?: LeafResult;
	coder: CoderStep;
}

/** The last step of an encoder run: write out what is left in `low`. */
export interface FlushStep {
	kind: "flush";
	emitted: number[];
	lowBefore: number;
}

export type Step = DecisionStep | FlushStep;

export interface Trace {
	mode: "encode" | "decode";
	chunk: Chunk;
	steps: Step[];
	/** The range coded stream, as the encoder wrote it. */
	stream: Uint8Array;
	records: LeafResult[];
}
