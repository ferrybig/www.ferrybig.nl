import { bitsText, hex32, hex8, percent } from "../codec/describe.ts";
import { probKey, type ViewState } from "../codec/state.ts";
import type { DecisionStep, Trace } from "../codec/types.ts";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Stable } from "./Stable.tsx";
import { useReplay } from "./tween.ts";

interface Props {
	trace: Trace;
	state: ViewState;
	/** Seconds one animation takes. */
	stage: number;
}

const X0 = 20;
const ROW1 = 46;
const ROW2 = 118;
const BAR_H = 30;

/** The width of an element in CSS pixels, kept up to date. */
function useWidth(initial: number) {
	const ref = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(initial);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const update = () => setWidth(Math.max(240, Math.round(el.clientWidth)));
		update();
		const observer = new ResizeObserver(update);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);
	return [width, ref] as const;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * The interval being cut. Row one is the interval before the decision,
 * split where the probability says. The part for the answer is kept and
 * zoomed to full width in row two, which is the interval the next
 * decision starts from. A decoder also has a marker: the number it is
 * decoding, which decides which part is kept.
 */
function IntervalBars({
	step,
	state,
	decode,
	width,
	stage,
}: {
	step: DecisionStep | null;
	state: ViewState;
	decode: boolean;
	width: number;
	stage: number;
}) {
	const W = width - 2 * X0;
	const t = useReplay(state.k, stage);
	const c = step?.coder;
	if (!c) {
		return (
			<svg viewBox={`0 0 ${width} ${decode ? 200 : 186}`} class="interval" role="img" aria-label="The whole interval, before any decision">
				<text x={X0} y={ROW1 - 28} class="svg-note">
					before the first decision: the whole interval, range = {hex32(state.range)}
				</text>
				<rect class="part whole" x={X0} y={ROW1} width={W} height={BAR_H} />
				{decode && <Marker ratio={state.code / state.range} y={ROW1} width={W} />}
			</svg>
		);
	}
	const f = c.bound / c.rangeBefore;
	const bit = c.bit;
	// The divider starts at the edge, so the part that is kept starts out as the
	// whole bar, just like the zoomed row of the decision before.
	const divider = bit === 0 ? 1 + (f - 1) * t : f * t;
	const lowerW = divider * W;
	const upperW = (1 - divider) * W;
	const keptFrom = bit === 0 ? 0 : divider;
	const keptTo = bit === 0 ? divider : 1;
	const fade = clamp01((t - 0.5) * 2);
	const label = (text: string, x: number, width: number, kept: boolean) =>
		width > 70 ? (
			<text class={`part-label ${kept ? "" : "dim"}`} x={x + width / 2} y={ROW1 + BAR_H / 2 + 5} text-anchor="middle">
				{text}
			</text>
		) : null;
	const codeBefore = c.kind === "decode" ? c.codeBefore : 0;
	const codeMid = c.kind === "decode" ? c.codeMid : 0;
	return (
		<svg
			viewBox={`0 0 ${width} ${decode ? 200 : 186}`}
			class="interval"
			role="img"
			aria-label={`The interval is cut where the probability of a 0 says. The answer is ${bit}, so the ${bit === 0 ? "lower" : "upper"} part is kept.`}
		>
			<text x={X0} y={ROW1 - 28} class="svg-note">
				interval before: range = {hex32(c.rangeBefore)}
			</text>
			<rect class={`part ${bit === 0 ? "kept bit0" : "other"}`} x={X0} y={ROW1} width={lowerW} height={BAR_H} />
			<rect class={`part ${bit === 1 ? "kept bit1" : "other"}`} x={X0 + lowerW} y={ROW1} width={upperW} height={BAR_H} />
			{label(`0 · ${percent(f * 4096)}`, X0, lowerW, bit === 0)}
			{label(`1 · ${percent((1 - f) * 4096)}`, X0 + lowerW, upperW, bit === 1)}

			<g style={{ opacity: fade }}>
				<path class="connector" d={`M${X0 + keptFrom * W} ${ROW1 + BAR_H} L${X0} ${ROW2} M${X0 + keptTo * W} ${ROW1 + BAR_H} L${X0 + W} ${ROW2}`} />
				<text x={X0} y={ROW2 + BAR_H + (decode ? 34 : 16)} class="svg-note">
					{`kept part, zoomed: range = ${hex32(c.rangeMid)}`}
				</text>
				<rect class={`part kept bit${bit}`} x={X0} y={ROW2} width={W} height={BAR_H} />
				<text class="part-label" x={X0 + W / 2} y={ROW2 + BAR_H / 2 + 5} text-anchor="middle">
					{`answer ${bit}`}
				</text>
			</g>

			{decode && c.kind === "decode" && (
				<>
					<Marker ratio={codeBefore / c.rangeBefore} y={ROW1} width={W} />
					<g style={{ opacity: fade }}>
						<Marker ratio={codeMid / c.rangeMid} y={ROW2} width={W} />
					</g>
				</>
			)}
		</svg>
	);
}

function Marker({ ratio, y, width }: { ratio: number; y: number; width: number }) {
	const x = X0 + clamp01(ratio) * width;
	return (
		<g class="marker">
			<path d={`M${x} ${y - 2} V${y + BAR_H + 4}`} />
			<path d={`M${x - 5} ${y + BAR_H + 10} L${x} ${y + BAR_H + 3} L${x + 5} ${y + BAR_H + 10} Z`} class="marker-head" />
			<text x={x} y={y - 8} text-anchor="middle" class="svg-note marker-label">
				code
			</text>
		</g>
	);
}

function Arithmetic({ step }: { step: DecisionStep }) {
	const c = step.coder;
	const rows: [string, string][] = [
		["probability", `p = ${step.pBefore} / 4096 = ${percent(step.pBefore)} for a 0, learned from ${step.seen} earlier use${step.seen === 1 ? "" : "s"} of ${step.table}[${step.ctx}]`],
		["bound", `(range >> 12) × p = ${hex32(c.rangeBefore >>> 12)} × ${step.pBefore} = ${hex32(c.bound)}`],
	];
	if (c.kind === "encode") {
		rows.push(
			["answer", c.bit === 0 ? "0: keep the lower part. range = bound" : "1: keep the upper part. low += bound, range −= bound"],
			["low", `${hex32(c.lowBefore)} → ${hex32(c.lowMid)}`],
			["range", `${hex32(c.rangeBefore)} → ${hex32(c.rangeMid)}`],
		);
	} else {
		rows.push(
			["compare", `code ${hex32(c.codeBefore)} ${c.codeBefore < c.bound ? "<" : "≥"} bound ${hex32(c.bound)}`],
			["answer", c.bit === 0 ? "0: it is in the lower part. range = bound" : "1: it is in the upper part. code −= bound, range −= bound"],
			["code", `${hex32(c.codeBefore)} → ${hex32(c.codeMid)}`],
			["range", `${hex32(c.rangeBefore)} → ${hex32(c.rangeMid)}`],
		);
	}
	rows.push([
		"learn",
		`p ${step.pBefore} → ${step.pAfter}: a ${step.bit} moves it a sixteenth of the way ${step.bit === 0 ? "up" : "down"}`,
	]);
	if (c.shifts === 0) {
		rows.push(["normalise", `range ≥ 2²⁴, so no byte moves`]);
	} else if (c.kind === "encode") {
		rows.push([
			"normalise",
			`range < 2²⁴, so ×256 and push out the top byte of low${c.shifts > 1 ? ` (${c.shifts}×)` : ""}: ${
				c.emitted.length ? c.emitted.map(hex8).join(" ") : "held back until no carry can change it"
			}`,
		]);
	} else {
		rows.push([
			"normalise",
			`range < 2²⁴, so ×256 and read ${c.shifts} more byte${c.shifts > 1 ? "s" : ""} into code: ${c.consumed.map(hex8).join(" ")}`,
		]);
	}
	return (
		<dl class="arith">
			{rows.map(([k, v]) => (
				<div key={k}>
					<dt>{k}</dt>
					<dd>{v}</dd>
				</div>
			))}
		</dl>
	);
}

function Bytes({ trace, state }: { trace: Trace; state: ViewState }) {
	const decode = trace.mode === "decode";
	const step = state.step;
	if (!decode) {
		const fresh =
			step?.kind === "flush"
				? step.emitted.length
				: step?.coder.kind === "encode"
					? step.coder.emitted.length
					: 0;
		const total = state.out.length;
		return (
			<div class="bytes" aria-label="Bytes written so far">
				{state.out.map((b, i) => (
					<span key={i} class={`byte ${i >= total - fresh ? "fresh" : ""}`}>
						{hex8(b)}
					</span>
				))}
				{state.pending.map((b, i) => (
					<span key={`p${i}`} class="byte pending" title="held back: a carry could still change it">
						{hex8(b)}
					</span>
				))}
				{total === 0 && state.pending.length === 0 && <span class="faint">nothing yet</span>}
			</div>
		);
	}
	const consumed = step?.kind === "decision" && step.coder.kind === "decode" ? step.coder.consumed.length : 0;
	return (
		<div class="bytes" aria-label="The stream, with the bytes read so far marked">
			{Array.from(trace.stream, (b, i) => {
				const read = i < state.pos;
				const inCode = i >= state.pos - 4 && i < state.pos && i >= 1;
				return (
					<span
						key={i}
						class={`byte ${read ? "read" : "unread"} ${inCode ? "in-code" : ""} ${i >= state.pos - consumed && read && i >= 5 ? "fresh" : ""}`}
						title={i === 0 ? "always 0" : inCode ? "part of code right now" : undefined}
					>
						{hex8(b)}
					</span>
				);
			})}
		</div>
	);
}

function Costs({ trace, state }: { trace: Trace; state: ViewState }) {
	const decisions = trace.steps.filter((s): s is DecisionStep => s.kind === "decision");
	return (
		<div class="costs" role="img" aria-label="The cost in bits of every decision so far">
			{decisions.map((d) => {
				const shown = d.n < state.decisions;
				return (
					<span
						key={d.n}
						class={`cost ${d.table} ${shown ? "" : "unseen"} ${d.n === state.decisions - 1 ? "current" : ""}`}
						style={{ height: `${shown ? Math.max(2, (Math.min(d.cost, 6) / 6) * 100) : 2}%` }}
						title={shown ? `${d.table}[${d.ctx}] = ${d.bit}: ${bitsText(d.cost)}` : undefined}
					/>
				);
			})}
		</div>
	);
}

function DecisionHead({ step, total, decode }: { step: DecisionStep | null; total: number; decode: boolean }) {
	if (!step) {
		return (
			<p class="decision-head">
				<b>{decode ? "the stream is loaded" : "nothing coded yet"}</b>
			</p>
		);
	}
	return (
		<p class="decision-head">
			<b>
				decision {step.n + 1} of {total}
			</b>
			<code>
				{step.table}[{step.ctx}]
			</code>
			<span>
				answer <b>{step.bit}</b>
			</span>
			<span>costs {bitsText(step.cost)}</span>
		</p>
	);
}

export function RangeView({ trace, state, stage }: Props) {
	const decode = trace.mode === "decode";
	const [width, widthRef] = useWidth(600);
	const step = state.step?.kind === "decision" ? state.step : null;
	const total = trace.steps.filter((s) => s.kind === "decision").length;
	const current = step ? probKey(step.table, step.ctx) : "";
	const heads = useMemo(
		() =>
			trace.steps
				.filter((s): s is DecisionStep => s.kind === "decision")
				.map((s) => <DecisionHead key={s.n} step={s} total={total} decode={decode} />),
		[trace, total, decode],
	);
	// Every step's table, so the box is as tall as the longest and nothing below it moves.
	const arithmetic = useMemo(
		() =>
			trace.steps
				.filter((s): s is DecisionStep => s.kind === "decision")
				.map((s) => <Arithmetic key={s.n} step={s} />),
		[trace],
	);

	return (
		<div class="range" ref={widthRef}>
			<Stable
				current={<DecisionHead step={step} total={total} decode={decode} />}
				all={heads}
			/>

			<IntervalBars step={step} state={state} decode={decode} width={width} stage={stage} />
			<p class="hint">
				{decode
					? "The decoder holds one number, code. The probability cuts the interval in two, and code lies in one of the parts. That part is the answer, and it is zoomed to become the next interval."
					: "The probability cuts the interval in two: the lower part is a 0, the upper part is a 1, each as wide as the chance of that answer. The part for the real answer is kept and zoomed to become the next interval."}
			</p>

			<Stable current={step && <Arithmetic step={step} />} all={arithmetic} />

			<h4>{decode ? "The stream (bytes read so far are filled)" : "Bytes written so far"}</h4>
			<Stable
				current={<Bytes trace={trace} state={state} />}
				all={[
					// The strip at its longest (the whole stream, and a held-back byte), so it never grows a line.
					<div class="bytes" key="all">
						{Array.from({ length: trace.stream.length + 1 }, (_, i) => (
							<span key={i} class="byte">
								00
							</span>
						))}
					</div>,
				]}
			/>
			<p class="hint">
				{decode
					? "The first byte is always 0. The next four are loaded into code, and a new byte is shifted in every time range gets small."
					: "A byte is only final once no carry can reach it, so the newest one may stay dashed for a while. The first byte is always 0."}
			</p>

			<h4>Where the bits go: {state.bits.toFixed(1)} bits so far</h4>
			<Costs trace={trace} state={state} />
			<p class="hint">
				One bar per decision, tall for a surprise (capped at 6 bits). Grey: split flags, blue: same as west, teal: same as
				south, purple: ranks. Most of a chunk is cheap guesses.
			</p>

			<h4>What the probabilities have learned</h4>
			<ul class="probs">
				{state.probs.map((p) => (
					<li key={p.key} class={p.key === current ? "current" : ""}>
						<code>{p.key}</code>
						<meter min={0} max={4096} value={p.p} aria-label={`chance of a 0: ${percent(p.p)}`} />
						<span>{percent(p.p)}</span>
						<small>×{p.seen}</small>
					</li>
				))}
				{state.probs.length === 0 && <li class="faint">Every probability starts at 50%.</li>}
			</ul>
		</div>
	);
}
