import type { Chunk } from "./types.ts";

export interface Example {
	id: string;
	title: string;
	blurb: string;
	chunk: Chunk;
	/** Name of palette index 0, 1, 2, ... */
	places: string[];
	/** Short labels for tight spaces, same order. */
	short: string[];
}

/** The chunk of the blog post: a patch of the world with Amsterdam and Diemen. */
export const BLOG_EXAMPLE: Example = {
	id: "blog",
	title: "Amsterdam and Diemen",
	blurb: "The chunk of the blog post: 16 records, 8 × 8 cells.",
	chunk: {
		maxDepth: 3,
		paletteCount: 2,
		depths: [1, 3, 3, 3, 3, 2, 2, 2, 1, 3, 3, 3, 3, 2, 2, 2],
		indices: [1, 1, 2, 1, 2, 2, 1, 2, 1, 1, 2, 1, 2, 2, 2, 2],
	},
	places: ["no place", "Amsterdam", "Diemen"],
	short: ["–", "A", "D"],
};

/**
 * The synthetic chunk of Appendix A.6 of binary-format.md. It is the only
 * chunk whose stream the spec spells out byte for byte
 * (`00 a5 11 64 ba 00 00`), and it has records without a place and a
 * stretch of the chunk without records, which the other example has not.
 */
export const SPEC_EXAMPLE: Example = {
	id: "spec",
	title: "Appendix A.6 of the spec",
	blurb: "The spec's worked example: 7 records, 4 × 4 cells, with gaps and an unfinished corner.",
	chunk: {
		maxDepth: 2,
		paletteCount: 2,
		depths: [1, 2, 2, 2, 2, 1, 2],
		indices: [1, 2, 0, 0, 0, 1, 2],
	},
	places: ["no place", "Noord-Holland", "Zaandam"],
	short: ["–", "N", "Z"],
};

export const EXAMPLES: Example[] = [BLOG_EXAMPLE, SPEC_EXAMPLE];
