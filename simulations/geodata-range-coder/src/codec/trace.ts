import { TracingDecoder, TracingEncoder } from "./coder.ts";
import type { Chunk, Step, Trace } from "./types.ts";
import { walk } from "./walk.ts";

/** Range codes a chunk's records, keeping a step for every decision. */
export function encodeTrace(chunk: Chunk): Trace {
	const coder = new TracingEncoder();
	const { steps, records } = walk({
		maxDepth: chunk.maxDepth,
		paletteCount: chunk.paletteCount,
		recordCount: chunk.depths.length,
		coder,
		truth: chunk,
	});
	const flush = coder.finish();
	return {
		mode: "encode",
		chunk,
		steps: [...steps, flush],
		stream: Uint8Array.from(coder.out),
		records,
	};
}

/**
 * Decodes a stream back into records. It is given the chunk header's
 * numbers (`maxDepth`, `paletteCount`, `recordCount`) and the bytes, and
 * nothing about the records: those come out of the walk.
 */
export function decodeTrace(
	header: { maxDepth: number; paletteCount: number; recordCount: number },
	stream: Uint8Array,
	expected: Chunk,
): Trace {
	const coder = new TracingDecoder(stream);
	const { steps, records } = walk({ ...header, coder });
	if (coder.pos !== stream.length) {
		throw new RangeError(`${stream.length - coder.pos} trailing bytes after the stream`);
	}
	return {
		mode: "decode",
		chunk: expected,
		steps: steps as Step[],
		stream,
		records,
	};
}
