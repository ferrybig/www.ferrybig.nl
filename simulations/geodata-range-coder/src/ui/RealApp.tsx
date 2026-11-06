import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { percent } from "../codec/describe.ts";
import {
	decodeLite,
	nextRecordEnd,
	previousRecordEnd,
	Probabilities,
	recordsDoneAt,
	slotName,
	SLOTS,
	type LiteTrace,
} from "../codec/lite.ts";
import { REAL_CHUNK } from "../real/chunk.ts";
import { placeColour, RealMap } from "./RealMap.tsx";
import { Tape } from "./Tape.tsx";

/** Decisions per second. A real chunk has tens of thousands of them. */
const SPEEDS = [
	{ label: "slow", perSecond: 100 },
	{ label: "normal", perSecond: 1000 },
	{ label: "fast", perSecond: 10000 },
];

/** How many of the busiest probabilities are listed. */
const LISTED = 12;
/** How many places the legend names. */
const LEGEND = 8;

const number = (n: number) => n.toLocaleString("en");

/**
 * Chunk 207623 of the world file, decoded from its own bytes. The decode
 * takes a moment, so it starts after the first paint, and the box is as big
 * as the finished view will be, so the page below it does not move.
 */
export function RealApp() {
	const [trace, setTrace] = useState<LiteTrace | null>(null);
	useEffect(() => {
		const id = setTimeout(() => setTrace(decodeLite(REAL_CHUNK.header, REAL_CHUNK.stream)), 0);
		return () => clearTimeout(id);
	}, []);
	if (!trace) {
		return (
			<div class="sim real placeholder" aria-busy="true">
				Decoding {number(REAL_CHUNK.header.recordCount)} records…
			</div>
		);
	}
	return <RealChunk trace={trace} />;
}

function RealChunk({ trace }: { trace: LiteTrace }) {
	const total = trace.decisions;
	const records = trace.recX.length;
	const { places, stream } = REAL_CHUNK;

	const [k, setK] = useState(0);
	const [playing, setPlaying] = useState(false);
	const [speed, setSpeed] = useState(1);
	const kRef = useRef(0);

	const go = (n: number) => {
		const to = Math.max(0, Math.min(total, Math.round(n)));
		kRef.current = to;
		setK(to);
	};
	/** A step, a jump or the scrubber: whoever pressed it wants to stop the playing. */
	const jump = (n: number) => {
		setPlaying(false);
		go(n);
	};
	const reset = () => jump(0);
	const togglePlay = () => {
		if (playing) return setPlaying(false);
		if (kRef.current >= total) go(0);
		setPlaying(true);
	};

	useEffect(() => {
		if (!playing) return;
		let at = kRef.current;
		let last = performance.now();
		let frame = 0;
		const tick = (now: number) => {
			at = Math.min(total, at + ((now - last) / 1000) * SPEEDS[speed]!.perSecond);
			last = now;
			go(Math.floor(at));
			if (at >= total) setPlaying(false);
			else frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [playing, speed, total]);

	const onKeyDown = (e: KeyboardEvent) => {
		const target = e.target as HTMLElement;
		if (target.tagName === "SELECT" || target.tagName === "INPUT") return;
		const now = kRef.current;
		if (e.key === "ArrowRight") jump(e.shiftKey ? nextRecordEnd(trace, now) : now + 1);
		else if (e.key === "ArrowLeft") jump(e.shiftKey ? previousRecordEnd(trace, now) : now - 1);
		else if (e.key === " " && target.tagName !== "BUTTON") togglePlay();
		else if (e.key === "Home") reset();
		else return;
		e.preventDefault();
	};

	const done = recordsDoneAt(trace, k);
	const pos = trace.pos[k]!;
	const finished = k >= total;

	// The places that cover the most of the chunk, for the legend.
	const legend = useMemo(() => {
		const area = new Float64Array(REAL_CHUNK.header.paletteCount + 1);
		for (let r = 0; r < records; r++) {
			area[trace.recIndex[r]!]! += 4 ** (trace.header.maxDepth - trace.recDepth[r]!);
		}
		const order = Array.from(area.keys()).sort((a, b) => area[b]! - area[a]!);
		return { top: order.slice(0, LEGEND), more: order.filter((i) => area[i]! > 0).length - LEGEND };
	}, [trace, records]);

	const probabilities = useMemo(() => new Probabilities(trace), [trace]);
	probabilities.at(k);
	const busiest = probabilities.busiest(LISTED);
	const now = k > 0 ? trace.slot[k - 1]! : -1;
	const row = (slot: number, current: boolean) => (
		<li key={slot} class={current ? "current" : ""}>
			<code>{slotName(slot)}</code>
			<meter min={0} max={4096} value={probabilities.p[slot]!} aria-label={`chance of a 0: ${percent(probabilities.p[slot]!)}`} />
			<span>{percent(probabilities.p[slot]!)}</span>
			<small>×{number(probabilities.seen[slot]!)}</small>
		</li>
	);

	return (
		<div
			class="sim real"
			tabIndex={0}
			onKeyDown={onKeyDown}
			aria-label="Decoding a real chunk. Left and right arrows step, shift moves by record, space plays."
		>
			<div class="controls" role="toolbar" aria-label="Playback">
				<button onClick={reset} title="Reset (Home)" aria-label="Reset" disabled={k === 0 && !playing}>
					⟲
				</button>
				<button onClick={() => jump(previousRecordEnd(trace, k))} title="Previous record (Shift+←)" aria-label="Previous record" disabled={k === 0}>
					⏮
				</button>
				<button onClick={() => jump(k - 1)} title="Previous step (←)" aria-label="Previous step" disabled={k === 0}>
					◀
				</button>
				<button class="play" onClick={togglePlay} title="Play or pause (Space)" aria-label={playing ? "Pause" : "Play"}>
					{playing ? "⏸" : "▶"}
				</button>
				<button onClick={() => jump(k + 1)} title="Next step (→)" aria-label="Next step" disabled={finished}>
					▶|
				</button>
				<button onClick={() => jump(nextRecordEnd(trace, k))} title="Next record (Shift+→)" aria-label="Next record" disabled={finished}>
					⏭
				</button>
				<input
					type="range"
					min={0}
					max={total}
					value={k}
					aria-label="Step"
					onInput={(e) => jump(Number((e.target as HTMLInputElement).value))}
				/>
				<label class="speed">
					<span class="sr">Speed</span>
					<select value={speed} onChange={(e) => setSpeed(Number((e.target as HTMLSelectElement).value))}>
						{SPEEDS.map((s, i) => (
							<option key={s.label} value={i}>
								{s.label} ({number(s.perSecond)}/s)
							</option>
						))}
					</select>
				</label>
			</div>
			<p class="status" aria-live="off">
				<span>
					decision {number(k)} of {number(total)}
				</span>
				<span>
					record {number(done)} of {number(records)} decoded
				</span>
				<span>
					byte {number(pos)} of {number(stream.length)} read
				</span>
			</p>

			<div class="panels real-panels">
				<section class="panel">
					<h3>
						<span class="num">1</span> The records
					</h3>
					<RealMap trace={trace} done={done} k={k} />
					<ul class="legend">
						{legend.top.map((index) => (
							<li key={index}>
								<span class="swatch" style={{ background: placeColour(index), borderColor: placeColour(index) }} />
								{places[index]}
							</li>
						))}
						{legend.more > 0 && <li>and {legend.more} more</li>}
						<li>
							<span class="swatch active-swatch" /> the cell being decided
						</li>
					</ul>
				</section>

				<section class="panel">
					<h3>
						<span class="num">2</span> The range coder
					</h3>
					<h4>The stream (bytes read so far are filled)</h4>
					<Tape stream={stream} pos={pos} />

					<h4>What the probabilities have learned</h4>
					<p class="hint tally">
						{probabilities.used} of {number(SLOTS)} in use, the busiest {LISTED} listed
					</p>
					<ul class="probs">
						{busiest.map((slot) => row(slot, slot === now))}
						{Array.from({ length: LISTED - busiest.length }, (_, i) => (
							<li key={`blank${i}`} class="keep-space">
								<code>—</code>
							</li>
						))}
					</ul>
					<h4>The decision just taken</h4>
					<ul class="probs">
						{now >= 0 ? (
							row(now, true)
						) : (
							<li class="faint">
								<code>none yet</code>
							</li>
						)}
					</ul>
				</section>
			</div>
		</div>
	);
}
