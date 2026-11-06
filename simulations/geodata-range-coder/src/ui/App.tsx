import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { describeEnd, describeIntro, describeStep, type Description } from "../codec/describe.ts";
import { EXAMPLES, type Example } from "../codec/examples.ts";
import { buildStates, recordBoundaries } from "../codec/state.ts";
import { decodeTrace, encodeTrace } from "../codec/trace.ts";
import { ArrayView } from "./ArrayView.tsx";
import { MapView } from "./MapView.tsx";
import { RangeView } from "./RangeView.tsx";
import { Stable } from "./Stable.tsx";
import { prefersReducedMotion } from "./tween.ts";

type Mode = "encode" | "decode";

export interface AppProps {
	/** Fixes the direction and hides the switch. */
	mode?: Mode;
	/** Fixes the example and hides the picker. */
	example?: string;
}

const SPEEDS = [
	{ label: "slow", ms: 2000 },
	{ label: "normal", ms: 1200 },
	{ label: "fast", ms: 500 },
];

/** How long each section's animation takes, in seconds. */
const STAGE = 0.3;

/**
 * The order in which the sections (0: records, 1: flags and guesses,
 * 2: range coder) are brought up to date by a step. The encoder works from
 * the records down to the bytes, and the decoder the other way round. A step
 * backwards undoes them in the opposite order.
 */
const ORDER: Record<Mode, number[]> = {
	encode: [0, 1, 2],
	decode: [2, 1, 0],
};

function CaptionText({ description, summary }: { description: Description; summary: Description | undefined }) {
	return (
		<>
			<h3>{description.title}</h3>
			{description.facts.length > 0 && (
				<ul class="facts">
					{description.facts.map((f) => (
						<li key={f}>{f}</li>
					))}
				</ul>
			)}
			<p>{description.answer}</p>
			{summary && (
				<p class="summary">
					<b>{summary.title}.</b> {summary.answer}
				</p>
			)}
		</>
	);
}

export function App(props: AppProps) {
	const [mode, setMode] = useState<Mode>(props.mode ?? "encode");
	const [exampleId, setExampleId] = useState(props.example ?? EXAMPLES[0]!.id);
	const [k, setK] = useState(0);
	const [playing, setPlaying] = useState(false);
	const [speed, setSpeed] = useState(1);

	const example: Example = EXAMPLES.find((e) => e.id === exampleId) ?? EXAMPLES[0]!;
	const encoded = useMemo(() => encodeTrace(example.chunk), [example]);
	const decoded = useMemo(
		() =>
			decodeTrace(
				{
					maxDepth: example.chunk.maxDepth,
					paletteCount: example.chunk.paletteCount,
					recordCount: example.chunk.depths.length,
				},
				encoded.stream,
				example.chunk,
			),
		[encoded, example],
	);
	const trace = mode === "encode" ? encoded : decoded;
	const states = useMemo(() => buildStates(trace), [trace]);
	const marks = useMemo(() => recordBoundaries(trace), [trace]);
	const last = trace.steps.length;
	const state = states[Math.min(k, last)]!;

	// Each section shows its own step. They catch up with `k` one after the
	// other, so that an animation starts where the one before it ends.
	const [shown, setShown] = useState<number[]>([0, 0, 0]);
	const kRef = useRef(0);
	const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
	const clearTimers = () => {
		for (const t of timers.current) clearTimeout(t);
		timers.current = [];
	};
	useEffect(() => clearTimers, []);

	// Playing fast leaves less time for each section's animation.
	const stage = prefersReducedMotion() ? 0 : playing ? Math.min(STAGE, SPEEDS[speed]!.ms / 3200) : STAGE;

	/** Goes to step `n`, everywhere at once. */
	const jump = (n: number) => {
		const to = Math.max(0, Math.min(last, n));
		clearTimers();
		kRef.current = to;
		setK(to);
		setShown([to, to, to]);
	};
	/** One step, which the sections follow in turn. */
	const step = (delta: 1 | -1) => {
		const from = kRef.current;
		const to = Math.max(0, Math.min(last, from + delta));
		if (to === from) return;
		clearTimers();
		kRef.current = to;
		setK(to);
		if (stage === 0) return setShown([to, to, to]);
		const sequence = delta > 0 ? ORDER[mode] : [...ORDER[mode]].reverse();
		sequence.forEach((section, i) => {
			const apply = () => setShown((now) => now.map((v, s) => (s === section ? to : v)));
			if (i === 0) apply();
			else timers.current.push(setTimeout(apply, i * stage * 1000));
		});
	};
	const stepRef = useRef(step);
	stepRef.current = step;

	const next = () => step(1);
	const prev = () => step(-1);
	const nextRecord = () => jump(marks.find((m) => m > k) ?? last);
	const prevRecord = () => jump([...marks].reverse().find((m) => m < k) ?? 0);
	const reset = () => {
		setPlaying(false);
		jump(0);
	};
	const togglePlay = () => {
		if (playing) return setPlaying(false);
		if (k >= last) jump(0);
		setPlaying(true);
	};

	// Switching direction or example starts over.
	const changeMode = (m: Mode) => {
		setMode(m);
		reset();
	};
	const changeExample = (id: string) => {
		setExampleId(id);
		reset();
	};

	useEffect(() => {
		if (!playing) return;
		const id = setInterval(() => {
			stepRef.current(1);
			if (kRef.current >= last) setPlaying(false);
		}, SPEEDS[speed]!.ms);
		return () => clearInterval(id);
	}, [playing, speed, last]);

	const onKeyDown = (e: KeyboardEvent) => {
		const target = e.target as HTMLElement;
		if (target.tagName === "SELECT" || target.tagName === "INPUT") return;
		if (e.key === "ArrowRight") (e.shiftKey ? nextRecord : next)();
		else if (e.key === "ArrowLeft") (e.shiftKey ? prevRecord : prev)();
		else if (e.key === " " && target.tagName !== "BUTTON") togglePlay();
		else if (e.key === "Home") reset();
		else return;
		e.preventDefault();
	};

	// The caption of every state, so that the caption box can be sized for the longest.
	const captions = useMemo(() => {
		const env = { trace, places: example.places };
		return states.map((st, i) => ({
			description: st.step === null ? describeIntro(trace, example.places) : describeStep(st.step, env),
			summary: i === last ? describeEnd(trace, st) : undefined,
		}));
	}, [trace, states, example, last]);
	const sizers = useMemo(() => captions.map((c, i) => <CaptionText key={i} {...c} />), [captions]);
	const finished = k >= last;
	const recordsDone = state.records.length;
	const total = trace.chunk.depths.length;

	const root = useRef<HTMLDivElement>(null);
	// The flush at the end of an encode only writes bytes, so the records and the
	// arrays stay on the last decision, which is where a decode ends too.
	const lastDecision = trace.steps.filter((s) => s.kind === "decision").length;
	const sectionState = (i: number) => states[Math.min(shown[i]!, i === 2 ? last : lastDecision)]!;

	return (
		<div class="sim" ref={root} style={`--stage: ${stage}s`} tabIndex={0} onKeyDown={onKeyDown} aria-label="Range coder simulation. Left and right arrows step, shift moves by record, space plays.">
			<header class="bar">
				{props.mode === undefined && (
					<div class="tabs" role="tablist" aria-label="Direction">
						<button role="tab" aria-selected={mode === "encode"} onClick={() => changeMode("encode")}>
							Encode <small>records → bytes</small>
						</button>
						<button role="tab" aria-selected={mode === "decode"} onClick={() => changeMode("decode")}>
							Decode <small>bytes → records</small>
						</button>
					</div>
				)}
				{props.example === undefined && (
					<label class="picker">
						Chunk{" "}
						<select value={exampleId} onChange={(e) => changeExample((e.target as HTMLSelectElement).value)}>
							{EXAMPLES.map((e) => (
								<option key={e.id} value={e.id}>
									{e.title}
								</option>
							))}
						</select>
					</label>
				)}
			</header>

			<div class="controls" role="toolbar" aria-label="Playback">
				<button onClick={reset} title="Reset (Home)" aria-label="Reset" disabled={k === 0 && !playing}>
					⟲
				</button>
				<button onClick={prevRecord} title="Previous record (Shift+←)" aria-label="Previous record" disabled={k === 0}>
					⏮
				</button>
				<button onClick={prev} title="Previous step (←)" aria-label="Previous step" disabled={k === 0}>
					◀
				</button>
				<button class="play" onClick={togglePlay} title="Play or pause (Space)" aria-label={playing ? "Pause" : "Play"}>
					{playing ? "⏸" : "▶"}
				</button>
				<button onClick={next} title="Next step (→)" aria-label="Next step" disabled={finished}>
					▶|
				</button>
				<button onClick={nextRecord} title="Next record (Shift+→)" aria-label="Next record" disabled={finished}>
					⏭
				</button>
				<input
					type="range"
					min={0}
					max={last}
					value={k}
					aria-label="Step"
					onInput={(e) => {
						setPlaying(false);
						jump(Number((e.target as HTMLInputElement).value));
					}}
				/>
				<label class="speed">
					<span class="sr">Speed</span>
					<select value={speed} onChange={(e) => setSpeed(Number((e.target as HTMLSelectElement).value))}>
						{SPEEDS.map((s, i) => (
							<option key={s.label} value={i}>
								{s.label}
							</option>
						))}
					</select>
				</label>
			</div>

			<section class="caption" aria-live="polite">
				<p class="progress">
					step {k} of {last} · record {recordsDone} of {total} {trace.mode === "encode" ? "encoded" : "decoded"}
				</p>
				<Stable current={<CaptionText {...captions[Math.min(k, last)]!} />} all={sizers} />
			</section>

			<div class="panels">
				<section class="panel" data-shown={shown[0]}>
					<h3>
						<span class="num">1</span> The records
					</h3>
					<MapView trace={trace} state={sectionState(0)} example={example} stage={stage} />
				</section>
				<section class="panel" data-shown={shown[1]}>
					<h3>
						<span class="num">2</span> Split flags and guesses
					</h3>
					<ArrayView trace={trace} state={sectionState(1)} example={example} />
				</section>
				<section class="panel wide" data-shown={shown[2]}>
					<h3>
						<span class="num">3</span> The range coder
					</h3>
					<RangeView trace={trace} state={sectionState(2)} stage={stage} />
				</section>
			</div>
		</div>
	);
}
