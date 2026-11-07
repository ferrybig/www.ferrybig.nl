import type { ViewState } from "./state.ts";
import type {
	Category,
	DecisionStep,
	LeafResult,
	Neighbour,
	NodeRef,
	Step,
	Trace,
} from "./types.ts";

/** The words next to the step, written for someone who has not seen the format. */
export interface Description {
	/** The question the coder is asking, or what the step is. */
	title: string;
	/** What the question depends on: the context, as short facts. */
	facts: string[];
	/** What the answer was and what follows from it. */
	answer: string;
}

export interface Env {
	trace: Trace;
	places: string[];
}

const QUADRANTS = ["south-west", "south-east", "north-west", "north-east"];

/** `root`, or the quadrants to follow from it: `south-east › north-west`. */
export function nodePath(node: NodeRef, maxDepth: number): string {
	if (node.d === 0) return "the whole chunk";
	const names: string[] = [];
	for (let i = 1; i <= node.d; i++) {
		const bit = maxDepth - i;
		names.push(QUADRANTS[(((node.y >> bit) & 1) << 1) | ((node.x >> bit) & 1)]!);
	}
	return names.join(" › ");
}

/** A short form of the path for tight spaces: `SE.NW`. */
export function shortPath(node: NodeRef, maxDepth: number): string {
	if (node.d === 0) return "root";
	const names: string[] = [];
	for (let i = 1; i <= node.d; i++) {
		const bit = maxDepth - i;
		names.push(["SW", "SE", "NW", "NE"][(((node.y >> bit) & 1) << 1) | ((node.x >> bit) & 1)]!);
	}
	return names.join(".");
}

const CATEGORY_TEXT: Record<Category, string> = {
	0: "none",
	1: "as big or bigger",
	2: "one level deeper",
	3: "deeper",
};

function recordLabel(n: Neighbour, records: LeafResult[]): string {
	return `record ${records[n.record]?.code ?? "?"}`;
}

export function percent(p: number): string {
	const pct = (p / 4096) * 100;
	return `${pct < 10 || pct > 90 ? pct.toFixed(1) : pct.toFixed(0)}%`;
}

export function bitsText(cost: number): string {
	return cost < 0.01 ? "<0.01 bits" : `${cost.toFixed(cost < 1 ? 2 : 1)} bits`;
}

function describeDecision(step: DecisionStep, env: Env): Description {
	const { trace, places } = env;
	const D = trace.chunk.maxDepth;
	const decode = trace.mode === "decode";
	const place = (i: number) => places[i] ?? `place ${i}`;
	const size = 2 ** (D - step.node.d);
	const where = nodePath(step.node, D);
	const west = step.west;
	const south = step.south;
	const wLabel = west ? `${place(west.index)} (${recordLabel(west, trace.records)})` : "";
	const sLabel = south ? `${place(south.index)} (${recordLabel(south, trace.records)})` : "";
	const isLastOfRecord = step.result !== undefined;
	const finished = step.result
		? ` That finishes record ${step.result.code}: ${place(step.result.index)}.`
		: "";

	switch (step.table) {
		case "split": {
			const facts = [
				`depth ${step.node.d}`,
				`west neighbour: ${CATEGORY_TEXT[step.westCategory]}`,
				`south neighbour: ${CATEGORY_TEXT[step.southCategory]}`,
			];
			const answer =
				step.bit === 1
					? `Yes: ${decode ? "the code says so, so" : "the records below it are not one cell, so"} it is cut into four children, visited south-west first.`
					: `No: it is a leaf, one record of ${size} × ${size} cell${size === 1 ? "" : "s"}.`;
			return {
				title: `Does ${where} split into four?`,
				facts,
				answer: answer + (step.node.d === 0 && step.bit === 1 ? " Every chunk starts here." : ""),
			};
		}
		case "sameWest":
		case "sameSouth": {
			const isWest = step.table === "sameWest";
			const neighbour = isWest ? west! : south!;
			const nLabel = isWest ? wLabel : sLabel;
			const ctx = step.leafContext!;
			const facts = [
				`depth ${ctx.d}`,
				ctx.westEqualsSouth ? "west and south agree" : "west and south differ",
				ctx.prevEqualsWest ? "previous record = west" : "previous record ≠ west",
				ctx.prevEqualsSouth ? "previous record = south" : "previous record ≠ south",
				`west neighbour: ${CATEGORY_TEXT[ctx.westCategory]}`,
			];
			let answer: string;
			if (step.bit === 1) {
				answer = `Yes: ${place(neighbour.index)}. No other decision is needed.${finished}`;
			} else if (isWest) {
				const southNext = south !== null && south.index !== west!.index;
				answer = `No. ${
					southNext
						? "The south neighbour is guessed next."
						: south
							? "The south neighbour is the same place, so there is nothing else to guess: the rank follows."
							: "There is no south neighbour, so the rank follows."
				}`;
			} else {
				answer = "No. Both guesses are wrong, so the rank follows.";
			}
			return {
				title: `Is it the same place as its ${isWest ? "west" : "south"} neighbour, ${nLabel}?`,
				facts,
				answer: isLastOfRecord && step.bit === 0 ? answer + finished : answer,
			};
		}
		case "rankLength": {
			const n = (step.rankBits ?? []).length;
			const facts = [
				west ? `west is ${place(west.index)}` : "no west neighbour",
				south ? `south is ${place(south.index)}` : "no south neighbour",
				`unary part, decision ${n}`,
			];
			const rank = step.result?.rank;
			return {
				title:
					n === 1
						? "Neither neighbour matches: which place is it? Write its rank."
						: "Does the rank number have more bits?",
				facts,
				answer:
					step.bit === 1
						? "1: yes, one more bit follows in the number. (The rank is written as an Elias gamma code: a run of 1s, a 0, then the bits.)"
						: `0: that was the last bit-count digit.${
								isLastOfRecord
									? ` The rank is ${rank}: the place at position ${rank} of the list, skipping the neighbours' places.${finished}`
									: " The bits of the number follow."
							}`,
			};
		}
		case "rankBits": {
			const bits = step.rankBits ?? [];
			const rank = step.result?.rank;
			return {
				title: "Which bits does the rank number have?",
				facts: [`bit ${step.ctx % 32} of rank + 1`, `code so far: ${bits.join(" ")}`],
				answer: isLastOfRecord
					? `${step.bit}. That completes the number: the rank is ${rank}, which is the place at that position of the list, skipping the neighbours' places.${finished}`
					: `${step.bit}.`,
			};
		}
	}
}

export function describeStep(step: Step, env: Env): Description {
	if (step.kind === "flush") {
		return {
			title: "No decisions left: flush",
			facts: [`low = ${hex32(step.lowBefore)}`],
			answer: `The encoder pushes out what is still in low, five bytes' worth, so that the decoder can read back the whole number: ${step.emitted
				.map(hex8)
				.join(" ")}.`,
		};
	}
	return describeDecision(step, env);
}

export function describeIntro(trace: Trace, places: string[]): Description {
	const { chunk } = trace;
	if (trace.mode === "encode") {
		return {
			title: "From records to bytes",
			facts: [
				`${chunk.depths.length} records`,
				`${chunk.paletteCount} places`,
				"every probability starts at 50%",
			],
			answer:
				"The encoder walks the quadtree from the root, and for every cell it asks a yes/no question. Each answer narrows an interval. Press ▶ or step through it.",
		};
	}
	return {
		title: "From bytes to records",
		facts: [
			`${trace.stream.length} bytes`,
			`${chunk.depths.length} records`,
			`${places.length - 1} places`,
		],
		answer:
			"The decoder knows the bytes, how many records to expect and how many places there are. It asks the same questions in the same order, but now the bytes give the answers. It starts by loading the first bytes into code.",
	};
}

export function describeEnd(trace: Trace, state: ViewState): Description {
	const { chunk, stream } = trace;
	const records = chunk.depths.length;
	// What version 1 wrote before zlib: a byte per depth, a byte per palette index.
	const before = records * 2;
	const flush = trace.steps.find((s) => s.kind === "flush");
	const flushBytes = flush?.kind === "flush" ? flush.emitted.length : 0;
	return {
		title: trace.mode === "encode" ? "Done" : "Done: every record is back",
		facts: [
			`${state.decisions} decisions`,
			`${state.bits.toFixed(1)} bits of information`,
			`${stream.length} bytes`,
		],
		answer:
			trace.mode === "encode"
				? `${records} records took ${stream.length} bytes (${((stream.length * 8) / records).toFixed(1)} bits per record, and ${flushBytes} of the bytes only come from the flush). Version 1 stored ${before} bytes for the same records, before zlib.`
				: `The decoder rebuilt all ${records} records, and read exactly ${stream.length} bytes: ${((stream.length * 8) / records).toFixed(1)} bits per record. The result is the same as what the encoder started from.`,
	};
}

export function hex8(b: number): string {
	return b.toString(16).padStart(2, "0");
}

export function hex32(n: number): string {
	// `low` can carry into a 33rd bit.
	return `0x${n.toString(16).padStart(8, "0")}`;
}
