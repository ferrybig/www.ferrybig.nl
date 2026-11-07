import {
	PROB_BITS,
	TOP,
	type DecoderCoderStep,
	type EncoderCoderStep,
	type FlushStep,
} from "./types.ts";

/**
 * The binary range coder of binary-format.md Section 8.7.1 (LZMA's), with
 * one change: every call reports what it did to its registers. The
 * arithmetic is the reference's, line for line, so the bytes are the same.
 *
 * `code()` takes the probability of a 0 and, when encoding, a function that
 * yields the bit to write. Decoding never calls it, so the shared walker in
 * walk.ts can pass the encoder's knowledge without the decoder seeing it.
 */
export interface BitCoder<S extends EncoderCoderStep | DecoderCoderStep> {
	code(p: number, truth: () => 0 | 1): S;
}

const TWO_POW_32 = 2 ** 32;

export class TracingEncoder implements BitCoder<EncoderCoderStep> {
	private low = 0;
	private range = 0xffffffff;
	private cache = 0;
	private cacheSize = 1;
	readonly out: number[] = [];

	code(p: number, truth: () => 0 | 1): EncoderCoderStep {
		const bit = truth();
		const rangeBefore = this.range;
		const lowBefore = this.low;
		const bound = (this.range >>> PROB_BITS) * p;
		if (bit === 0) {
			this.range = bound;
		} else {
			this.low += bound;
			this.range -= bound;
		}
		const rangeMid = this.range;
		const lowMid = this.low;
		const emittedFrom = this.out.length;
		let shifts = 0;
		while (this.range < TOP) {
			this.range *= 256;
			this.shiftLow();
			shifts++;
		}
		return {
			kind: "encode",
			p,
			bit,
			rangeBefore,
			bound,
			rangeMid,
			rangeAfter: this.range,
			shifts,
			lowBefore,
			lowMid,
			lowAfter: this.low,
			emitted: this.out.slice(emittedFrom),
			pending: this.pending(),
		};
	}

	/** Emits the top byte of `low`, holding back runs of 0xff until a carry
	 * out of them is ruled out. */
	private shiftLow(): void {
		if (this.low < 0xff000000 || this.low >= TWO_POW_32) {
			const carry = this.low >= TWO_POW_32 ? 1 : 0;
			let c = this.cache;
			do {
				this.out.push((c + carry) & 0xff);
				c = 0xff;
			} while (--this.cacheSize !== 0);
			this.cache = Math.floor(this.low / 0x1000000) & 0xff;
		}
		this.cacheSize++;
		this.low = (this.low % 0x1000000) * 256;
	}

	private pending(): number[] {
		return [this.cache, ...new Array<number>(this.cacheSize - 1).fill(0xff)];
	}

	finish(): FlushStep {
		const lowBefore = this.low;
		const emittedFrom = this.out.length;
		for (let i = 0; i < 5; i++) this.shiftLow();
		return { kind: "flush", lowBefore, emitted: this.out.slice(emittedFrom) };
	}
}

export class TracingDecoder implements BitCoder<DecoderCoderStep> {
	private range = 0xffffffff;
	private code_ = 0;
	pos = 5;
	private readonly stream: Uint8Array;

	constructor(stream: Uint8Array) {
		this.stream = stream;
		if (stream.length < 5) throw new RangeError("the stream is shorter than 5 bytes");
		if (stream[0] !== 0) throw new RangeError("the stream does not start with a 0 byte");
		let code = 0;
		for (let i = 1; i <= 4; i++) code = code * 256 + stream[i]!;
		if (code === 0xffffffff) throw new RangeError("the stream starts with code 0xffffffff");
		this.code_ = code;
	}

	get state(): { range: number; code: number } {
		return { range: this.range, code: this.code_ };
	}

	code(p: number): DecoderCoderStep {
		const rangeBefore = this.range;
		const codeBefore = this.code_;
		const bound = (this.range >>> PROB_BITS) * p;
		let bit: 0 | 1;
		if (this.code_ < bound) {
			this.range = bound;
			bit = 0;
		} else {
			this.code_ -= bound;
			this.range -= bound;
			bit = 1;
		}
		const rangeMid = this.range;
		const codeMid = this.code_;
		const consumed: number[] = [];
		let shifts = 0;
		while (this.range < TOP) {
			if (this.pos >= this.stream.length) {
				throw new RangeError("the stream runs past its end");
			}
			const byte = this.stream[this.pos++]!;
			this.range *= 256;
			this.code_ = this.code_ * 256 + byte;
			consumed.push(byte);
			shifts++;
		}
		return {
			kind: "decode",
			p,
			bit,
			rangeBefore,
			bound,
			rangeMid,
			rangeAfter: this.range,
			shifts,
			codeBefore,
			codeMid,
			codeAfter: this.code_,
			consumed,
			pos: this.pos,
		};
	}
}
