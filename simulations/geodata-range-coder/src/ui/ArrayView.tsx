import { shortPath } from "../codec/describe.ts";
import type { Example } from "../codec/examples.ts";
import type { ViewState } from "../codec/state.ts";
import type { DecisionStep, LeafResult, Trace } from "../codec/types.ts";
import { placeClass } from "./MapView.tsx";
import { Stable } from "./Stable.tsx";

interface Props {
	trace: Trace;
	state: ViewState;
	example: Example;
}

function PlaceChip({ index, example, ghost }: { index: number; example: Example; ghost?: boolean }) {
	return (
		<span class={`chip place ${placeClass(index)} ${ghost ? "ghost-chip" : ""}`} title={example.places[index]}>
			{example.short[index] ?? index}
		</span>
	);
}

/** How a finished record was guessed: W, S, or R plus its rank. */
function Guess({ r }: { r: LeafResult }) {
	if (r.how === "west") return <span class="chip guess west" title="same place as its west neighbour">W</span>;
	if (r.how === "south") return <span class="chip guess south" title="same place as its south neighbour">S</span>;
	return (
		<span class="chip guess rank" title={`not a neighbour: position ${r.rank} of the move-to-front list`}>
			R{r.rank}
		</span>
	);
}

/**
 * The guess being worked on, while the record is unfinished: the last
 * question that was asked. One chip, so that the column does not widen.
 * Earlier misses follow from it: an `R` means both neighbours were wrong.
 */
function Answers({ answers }: { answers: DecisionStep[] }) {
	const last = answers[answers.length - 1];
	if (!last) return null;
	if (last.table === "sameWest") return <span class="chip guess west miss">W</span>;
	if (last.table === "sameSouth") return <span class="chip guess south miss">S</span>;
	return <span class="chip guess rank pending">R…</span>;
}

export function ArrayView({ trace, state, example }: Props) {
	const D = trace.chunk.maxDepth;
	const M = trace.chunk.depths.length;
	const encode = trace.mode === "encode";
	const step = state.step?.kind === "decision" ? state.step : null;

	// Split flags: those coded so far, then (when encoding) the ones still to come.
	const allSplits = trace.steps.filter((s): s is DecisionStep => s.kind === "decision" && s.table === "split");
	const allFlags = encode ? allSplits : [];
	const todo = allFlags.slice(state.flags.length);
	const lastFlag = state.step?.kind === "decision" && state.step.table === "split" ? state.step.n : -1;

	const current = state.records.length;
	const justDone = step?.result?.record ?? -1;
	const columns = Array.from({ length: M }, (_, j) => j);

	// The move-to-front list: where each place sits in it.
	const skipped = new Set<number>();
	if (state.leaf && step) {
		if (step.west) skipped.add(step.west.index);
		if (step.south) skipped.add(step.south.index);
	}
	const rankTarget = step?.result?.how === "rank" ? step.result.index : -1;
	const itemWidth = 88;

	return (
		<div class="arrays">
			<h4>Quadtree: one split flag per cell</h4>
			<Stable
				current={
					<div class="flags" role="list" aria-label="Split flags in the order they are coded">
						{state.flags.map((f) => (
							<div
								role="listitem"
								key={f.n}
								class={`flag bit${f.bit} ${f.n === lastFlag ? "latest" : ""}`}
								title={`${shortPath(f.node, D)}: ${f.bit ? "split" : "leaf"}`}
							>
								<b>{f.bit}</b>
								<small>{shortPath(f.node, D)}</small>
							</div>
						))}
						{todo.map((s) => (
							<div role="listitem" key={s.n} class="flag ghost-flag">
								<b>{s.bit}</b>
								<small>{shortPath(s.node, D)}</small>
							</div>
						))}
						{!encode && state.records.length < M && (
							<div role="listitem" class="flag ghost-flag">
								<b>…</b>
							</div>
						)}
					</div>
				}
				all={[
					// Every flag there will be, plus the dots a decoder shows while it does not know the end.
					<div class="flags" key="all">
						{allSplits.map((s) => (
							<div key={s.n} class="flag">
								<b>0</b>
								<small>{shortPath(s.node, D)}</small>
							</div>
						))}
						<div class="flag">
							<b>…</b>
						</div>
					</div>,
				]}
			/>
			<p class="hint">
				A cell at the deepest level cannot split, so it gets no flag.
				<span class={encode && state.records.length < M ? "" : "keep-space"}> Faint cells are still to come.</span>
			</p>

			<h4>Records: depth, place, and how the place was guessed</h4>
			<div class="scroll">
				<table class="records">
					<thead>
						<tr>
							<th scope="row">code</th>
							{columns.map((j) => (
								<td key={j} class={j === current ? "now" : ""}>
									{state.records[j]?.code ?? (encode ? <span class="faint">{trace.records[j]?.code}</span> : "·")}
								</td>
							))}
						</tr>
					</thead>
					<tbody>
						<tr>
							<th scope="row">depth</th>
							{columns.map((j) => {
								const done = state.records[j];
								const known = j === current && state.leaf ? state.leaf.d : undefined;
								return (
									<td key={j} class={j === current ? "now" : ""}>
										{done ? done.depth : known !== undefined ? known : encode ? <span class="faint">{trace.chunk.depths[j]}</span> : "·"}
									</td>
								);
							})}
						</tr>
						<tr>
							<th scope="row">place</th>
							{columns.map((j) => {
								const done = state.records[j];
								return (
									<td key={j} class={`${j === current ? "now" : ""} ${j === justDone ? "fresh" : ""}`}>
										{done ? (
											<PlaceChip index={done.index} example={example} />
										) : encode ? (
											<PlaceChip index={trace.chunk.indices[j]!} example={example} ghost />
										) : (
											"·"
										)}
									</td>
								);
							})}
						</tr>
						<tr>
							<th scope="row">guess</th>
							{columns.map((j) => {
								const done = state.records[j];
								return (
									<td key={j} class={`${j === current ? "now" : ""} ${j === justDone ? "fresh" : ""}`}>
										{done ? <Guess r={done} /> : j === current ? <Answers answers={state.answers} /> : "·"}
									</td>
								);
							})}
						</tr>
					</tbody>
				</table>
			</div>
			<p class="hint">
				<span class="chip guess west">W</span> same as west neighbour, <span class="chip guess south">S</span> same as
				south neighbour, <span class="chip guess rank">R2</span> neither: position 2 in the list below. A crossed out
				guess <span class="chip guess west miss">W</span> was asked and was wrong.
			</p>

			<h4>Recently used places (move-to-front list)</h4>
			<div class="mtf" style={{ width: `${(trace.chunk.paletteCount + 1) * itemWidth}px` }}>
				{Array.from({ length: trace.chunk.paletteCount + 1 }, (_, index) => {
					const position = state.mtf.indexOf(index);
					const tag = skipped.has(index)
						? step?.west?.index === index
							? "W"
							: "S"
						: undefined;
					return (
						<div
							key={index}
							class={`mtf-item ${placeClass(index)} ${tag ? "skipped" : ""} ${index === rankTarget ? "target" : ""}`}
							style={{ transform: `translateX(${position * itemWidth}px)` }}
						>
							<span>{example.places[index]}</span>
							{tag && <small>skipped: {tag}</small>}
							{index === rankTarget && <small>rank {step?.result?.rank}</small>}
						</div>
					);
				})}
			</div>
			<p class="hint">
				A rank counts positions in this list without the neighbours' places. A place that was just used moves to the front,
				so a place that keeps coming back stays cheap.
			</p>
		</div>
	);
}
