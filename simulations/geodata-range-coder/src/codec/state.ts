import type {
	DecisionStep,
	LeafResult,
	NodeRef,
	Step,
	Table,
	Trace,
} from "./types.ts";

/** A split decision that was made, kept for the row of flags. */
export interface FlagInfo {
	n: number;
	node: NodeRef;
	bit: 0 | 1;
}

/** A probability the coder has used, with what it has learned so far. */
export interface ProbInfo {
	key: string;
	table: Table;
	ctx: number;
	p: number;
	seen: number;
}

/**
 * Everything the views draw after `k` steps. The views know nothing about
 * the codec: they are given one of these. States are built once for the
 * whole trace, so stepping backwards is just asking for an earlier one.
 */
export interface ViewState {
	k: number;
	/** The step that was just taken, or null before the first. */
	step: Step | null;
	records: LeafResult[];
	flags: FlagInfo[];
	/** The leaf being coded when the last step did not finish it. */
	leaf: NodeRef | null;
	/** Its palette answers so far. */
	answers: DecisionStep[];
	mtf: number[];
	probs: ProbInfo[];
	/** Information coded so far, in bits. */
	bits: number;
	decisions: number;
	range: number;
	/** Encoder: the bytes written so far. */
	out: number[];
	/** Encoder: bytes held back until no carry can reach them. */
	pending: number[];
	/** Encoder: the lower end of the interval. */
	low: number;
	/** Decoder: how far into the stream the decoder has read. */
	pos: number;
	/** Decoder: the number being decoded, relative to the interval. */
	code: number;
}

export const probKey = (table: Table, ctx: number) => `${table}[${ctx}]`;

export function buildStates(trace: Trace): ViewState[] {
	const { steps, chunk, stream } = trace;
	const encode = trace.mode === "encode";
	let code = 0;
	for (let i = 1; i <= 4; i++) code = code * 256 + stream[i]!;

	let state: ViewState = {
		k: 0,
		step: null,
		records: [],
		flags: [],
		leaf: null,
		answers: [],
		mtf: Array.from({ length: chunk.paletteCount + 1 }, (_, i) => i),
		probs: [],
		bits: 0,
		decisions: 0,
		range: 0xffffffff,
		out: [],
		pending: encode ? [0] : [],
		low: 0,
		pos: encode ? 0 : 5,
		code: encode ? 0 : code,
	};
	const states = [state];

	for (let k = 1; k <= steps.length; k++) {
		const step: Step = steps[k - 1]!;
		if (step.kind === "flush") {
			state = {
				...state,
				k,
				step,
				out: [...state.out, ...step.emitted],
				pending: [],
				low: 0,
			};
		} else {
			const probs = state.probs.slice();
			const key = probKey(step.table, step.ctx);
			const at = probs.findIndex((p) => p.key === key);
			const info: ProbInfo = {
				key,
				table: step.table,
				ctx: step.ctx,
				p: step.pAfter,
				seen: step.seen + 1,
			};
			if (at < 0) probs.push(info);
			else probs[at] = info;

			const done = step.result !== undefined;
			const isLeafStep = step.table !== "split";
			const startsLeaf = step.table === "split" && step.bit === 0;
			const c = step.coder;
			state = {
				...state,
				k,
				step,
				records: done ? [...state.records, step.result!] : state.records,
				flags:
					step.table === "split"
						? [...state.flags, { n: step.n, node: step.node, bit: step.bit }]
						: state.flags,
				leaf: done ? null : isLeafStep || startsLeaf ? step.node : null,
				answers: done ? [] : isLeafStep ? [...state.answers, step] : [],
				mtf: done ? step.result!.mtfAfter : step.mtf,
				probs,
				bits: state.bits + step.cost,
				decisions: state.decisions + 1,
				range: c.rangeAfter,
				out: c.kind === "encode" ? [...state.out, ...c.emitted] : state.out,
				pending: c.kind === "encode" ? c.pending : state.pending,
				low: c.kind === "encode" ? c.lowAfter : state.low,
				pos: c.kind === "decode" ? c.pos : state.pos,
				code: c.kind === "decode" ? c.codeAfter : state.code,
			};
		}
		states.push(state);
	}
	return states;
}

/**
 * The state numbers at which a record has just been finished, plus the
 * ends. "Next record" and "previous record" jump between these.
 */
export function recordBoundaries(trace: Trace): number[] {
	const marks = [0];
	trace.steps.forEach((s, i) => {
		if (s.kind === "flush" || s.result !== undefined) marks.push(i + 1);
	});
	if (marks[marks.length - 1] !== trace.steps.length) marks.push(trace.steps.length);
	return marks;
}
