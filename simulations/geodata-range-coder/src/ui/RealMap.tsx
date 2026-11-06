import { useLayoutEffect, useRef } from "preact/hooks";
import type { LiteTrace } from "../codec/lite.ts";

/**
 * The colour of a palette index. Place 0 is "no place", the others are spread
 * round the colour wheel, in mid tones that read on a light page and a dark one.
 */
export const placeColour = (index: number) =>
	index === 0 ? "rgb(140 148 163 / 0.55)" : `hsl(${(index * 137.508) % 360} 58% 56%)`;

interface Props {
	trace: LiteTrace;
	/** Records decoded so far. */
	done: number;
	/** Decisions taken so far. */
	k: number;
}

/**
 * The chunk as one pixel per cell of the finest level, painted record by
 * record. Going forward paints only the new records, so playing fast stays
 * cheap, and going back starts the picture again.
 */
export function RealMap({ trace, done, k }: Props) {
	const canvas = useRef<HTMLCanvasElement>(null);
	const painted = useRef(0);
	const D = trace.header.maxDepth;
	const N = 2 ** D;

	useLayoutEffect(() => {
		const context = canvas.current?.getContext("2d");
		if (!context) return;
		if (done < painted.current) {
			context.clearRect(0, 0, N, N);
			painted.current = 0;
		}
		for (let r = painted.current; r < done; r++) {
			const size = 2 ** (D - trace.recDepth[r]!);
			context.fillStyle = placeColour(trace.recIndex[r]!);
			// North is up, and the records count from the south-west corner.
			context.fillRect(trace.recX[r]!, N - trace.recY[r]! - size, size, size);
		}
		painted.current = done;
	}, [trace, done, N, D]);

	// The cell the last decision was about, centred and never smaller than a dot.
	const at = k > 0 ? k - 1 : -1;
	let box: { left: string; top: string; size: string } | null = null;
	if (at >= 0) {
		const size = 2 ** (D - trace.nodeDepth[at]!);
		box = {
			left: `${((trace.nodeX[at]! + size / 2) / N) * 100}%`,
			top: `${((N - trace.nodeY[at]! - size / 2) / N) * 100}%`,
			size: `${(size / N) * 100}%`,
		};
	}

	return (
		<div class="real-map">
			<canvas
				ref={canvas}
				width={N}
				height={N}
				role="img"
				aria-label={`The chunk as a ${N} by ${N} grid of cells. ${done} of ${trace.recX.length} records have been decoded.`}
			/>
			{box && <div class="real-cell" style={{ left: box.left, top: box.top, width: box.size, height: box.size }} />}
		</div>
	);
}
