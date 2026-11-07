import type { Example } from "../codec/examples.ts";
import type { ViewState } from "../codec/state.ts";
import type { LeafResult, Trace } from "../codec/types.ts";
import { useTweened } from "./tween.ts";

const VIEW = 400;

interface Props {
	trace: Trace;
	state: ViewState;
	example: Example;
	/** Seconds one animation takes. */
	stage: number;
}

/** The place classes in style.css: p0 is "no place", p1 and up are places. */
export const placeClass = (index: number) => `p${Math.min(index, 5)}`;

export function MapView({ trace, state, example, stage }: Props) {
	const D = trace.chunk.maxDepth;
	const N = 2 ** D;
	const S = VIEW / N;
	const encode = trace.mode === "encode";

	/** Pixel box of a node, north up: [left, top, side]. */
	const box = (x: number, y: number, depth: number): [number, number, number] => {
		const size = 2 ** (D - depth);
		return [x * S, (N - y - size) * S, size * S];
	};
	const recordBox = (r: LeafResult) => box(r.x, r.y, r.depth);

	const step = state.step?.kind === "decision" ? state.step : null;
	const nodeBox = step ? box(step.node.x, step.node.y, step.node.d) : box(0, 0, 0);

	// A neighbour that is absent shrinks into the node and fades out, so the
	// highlight appears to come out of the node when there is one.
	const neighbourBox = (n: { record: number } | null) => {
		const r = n ? state.records[n.record] : undefined;
		return r ? recordBox(r) : nodeBox;
	};
	const active = useTweened(nodeBox, stage);
	const west = useTweened(neighbourBox(step?.west ?? null), stage);
	const south = useTweened(neighbourBox(step?.south ?? null), stage);

	const ghosts = encode ? trace.records.slice(state.records.length) : [];
	const last = state.step?.kind === "decision" ? state.step.result : undefined;

	const centre = (r: LeafResult) => {
		const [px, py, side] = recordBox(r);
		return [px + side / 2, py + side / 2] as const;
	};
	const path = state.records.map(centre);

	return (
		<div class="map">
			<svg
				viewBox={`0 0 ${VIEW} ${VIEW}`}
				role="img"
				aria-label={`The chunk as a ${N} by ${N} grid of cells. ${state.records.length} of ${trace.chunk.depths.length} records have been ${encode ? "encoded" : "decoded"}.`}
			>
				<defs>
					<pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
						<line x1="0" y1="0" x2="0" y2="8" class="hatch-line" />
					</pattern>
				</defs>
				<rect class="map-void" x="0" y="0" width={VIEW} height={VIEW} />

				{ghosts.map((r) => {
					const [px, py, side] = recordBox(r);
					return (
						<rect
							key={`ghost${r.record}`}
							class={`ghost ${placeClass(r.index)}`}
							x={px}
							y={py}
							width={side}
							height={side}
						/>
					);
				})}

				{state.records.map((r) => {
					const [px, py, side] = recordBox(r);
					const fresh = last?.record === r.record;
					return (
						<g key={`rec${r.record}`} class={`record ${fresh ? "fresh" : ""}`}>
							<title>{`Record ${r.code}: ${example.places[r.index] ?? r.index}, depth ${r.depth}`}</title>
							<rect
								class={`cell ${placeClass(r.index)}`}
								x={px}
								y={py}
								width={side}
								height={side}
							/>
							{r.index === 0 && <rect class="nothing" x={px} y={py} width={side} height={side} />}
							<text class="code" x={px + 4} y={py + 11}>
								{r.code}
							</text>
							<text class="name" x={px + side / 2} y={py + side / 2 + 5} text-anchor="middle">
								{example.short[r.index] ?? r.index}
							</text>
						</g>
					);
				})}

				{state.flags
					.filter((f) => f.bit === 1)
					.map((f) => {
						const [px, py, side] = box(f.node.x, f.node.y, f.node.d);
						return (
							<path
								key={`split${f.n}`}
								class="split-line"
								d={`M${px + side / 2} ${py} V${py + side} M${px} ${py + side / 2} H${px + side}`}
							/>
						);
					})}

				{path.length > 1 && (
					<polyline class="z-path" points={path.map(([x, y]) => `${x},${y}`).join(" ")} />
				)}

				<rect
					class={`neighbour ${step?.west ? "" : "hidden"}`}
					x={west[0]! + 2}
					y={west[1]! + 2}
					width={Math.max(0, west[2]! - 4)}
					height={Math.max(0, west[2]! - 4)}
				/>
				<rect
					class={`neighbour ${step?.south ? "" : "hidden"}`}
					x={south[0]! + 2}
					y={south[1]! + 2}
					width={Math.max(0, south[2]! - 4)}
					height={Math.max(0, south[2]! - 4)}
				/>
				{step?.west && (
					<text class="badge" x={west[0]! + west[2]! - 8} y={west[1]! + 14} text-anchor="end">
						W
					</text>
				)}
				{step?.south && (
					<text class="badge" x={south[0]! + south[2]! - 8} y={south[1]! + 14} text-anchor="end">
						S
					</text>
				)}

				<rect
					class={`active ${step ? "" : "hidden"}`}
					x={active[0]! + 1.5}
					y={active[1]! + 1.5}
					width={Math.max(0, active[2]! - 3)}
					height={Math.max(0, active[2]! - 3)}
				/>
			</svg>
			<ul class="legend">
				{example.places.map((name, i) => (
					<li key={name}>
						<span class={`swatch ${placeClass(i)} ${i === 0 ? "nothing-swatch" : ""}`} />
						{name}
					</li>
				))}
				<li>
					<span class="swatch active-swatch" /> current cell
				</li>
				<li>
					<span class="swatch neighbour-swatch" /> west (W) and south (S) neighbours
				</li>
			</ul>
		</div>
	);
}
