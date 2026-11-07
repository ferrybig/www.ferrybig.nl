import meta from "./chunk-207623.json";
import stream from "./chunk-207623.bin";

/**
 * Chunk 207623 of the world file (cfbea5e_world_super_res.bin), the one around
 * Almere, Lelystad and Amsterdam's northern edge: the range coded stream as it
 * is in the file, after the chunk's palette, and what the file's header says
 * about it. The records are not stored here, the view decodes them.
 * `chunk-207623.json` is written by extracting the chunk from the file.
 */
export const REAL_CHUNK = {
	header: { maxDepth: meta.maxDepth, paletteCount: meta.paletteCount, recordCount: meta.recordCount },
	stream,
	/** Name of palette index 0, 1, 2, ... */
	places: meta.places,
	chunk: meta.chunk,
	source: meta.source,
	boundingBox: meta.boundingBox,
};
