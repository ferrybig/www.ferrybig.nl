import { useEffect, useRef } from "preact/hooks";
import { hex8 } from "../codec/describe.ts";

/** Width of one byte on the tape, in pixels. */
const CELL = 30;
/** How many bytes are drawn behind and ahead of the read head. */
const BEHIND = 30;
const AHEAD = 70;

/**
 * The stream as a tape that slides past a fixed read head: everything to the
 * left of the head has been read, and the four bytes just before it are the
 * ones the decoder holds in `code`. Only the bytes near the head are drawn,
 * however long the stream is.
 */
export function Tape({ stream, pos }: { stream: Uint8Array; pos: number }) {
	const before = useRef(pos);
	// A step of a few bytes slides, a jump across the stream does not.
	const smooth = Math.abs(pos - before.current) <= 8;
	useEffect(() => {
		before.current = pos;
	});

	const from = Math.max(0, pos - BEHIND);
	const to = Math.min(stream.length, pos + AHEAD);
	const cells = [];
	for (let i = from; i < to; i++) {
		const read = i < pos;
		const inCode = read && i >= pos - 4 && i >= 1;
		cells.push(
			<span
				key={i}
				class={`byte ${read ? "read" : "unread"} ${inCode ? "in-code" : ""}`}
				style={{ left: `${i * CELL}px` }}
				title={`byte ${i}${i === 0 ? ", always 0" : inCode ? ", part of code right now" : ""}`}
			>
				{hex8(stream[i]!)}
			</span>,
		);
	}

	return (
		<div class="tape-box">
			<div class="tape" role="img" aria-label={`The stream: ${pos} of ${stream.length} bytes read.`}>
				<div class={`tape-track ${smooth ? "smooth" : ""}`} style={{ transform: `translateX(${-pos * CELL}px)` }}>
					{cells}
				</div>
				<div class="tape-head" />
			</div>
			<div class="tape-progress" aria-hidden="true">
				<span style={{ width: `${(pos / stream.length) * 100}%` }} />
			</div>
		</div>
	);
}
