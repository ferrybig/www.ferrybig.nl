// Extracts one chunk of a version 2 CGEODATA file into src/real/, for the real chunk view:
//
//   node scripts/extract-chunk.mts <world.bin> <chunk index>
//
// It needs the reader of the loc-to-city checkout (LOC_TO_CITY, default
// ~/Dev/Private/loc-to-city), which parses the file and so also gives the records
// to make a checksum of. The checksum lets test/lite.test.ts check a decode of the
// stream without the 76 MB world file.
//
// Writes chunk-<index>.bin (the range coded stream: the chunk without its palette
// and record count) and chunk-<index>.json (what the view needs to know about it).
// src/real/chunk.ts names the chunk the view shows.
import { closeSync, openSync, readSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const root = process.env.LOC_TO_CITY ?? `${homedir()}/Dev/Private/loc-to-city`;
const { openFile } = await import(`${root}/reader/src/node.ts`);
const { readDeltaVarintList, readVarint } = await import(`${root}/reader/src/varint.ts`);

const [file, indexArgument] = process.argv.slice(2);
if (!file || indexArgument === undefined) {
	console.error("usage: node scripts/extract-chunk.mts <world.bin> <chunk index>");
	process.exit(2);
}
const index = Number(indexArgument);
const out = fileURLToPath(new URL("../src/real/", import.meta.url));

const reader = await openFile(file);
const offset: number = reader.directory.chunkOffsets[index];
const length: number = reader.directory.chunkLengths[index];
const block = new Uint8Array(length);
const fd = openSync(file, "r");
readSync(fd, block, 0, length, offset);
closeSync(fd);

// A version 2 chunk: the palette (a count, then delta coded place ids), the record
// count, and then the stream.
let at = 0;
const paletteCount = readVarint(block, at);
at += paletteCount.bytesRead;
const palette = readDeltaVarintList(block, at, paletteCount.value);
at += palette.bytesRead;
const recordCount = readVarint(block, at);
at += recordCount.bytesRead;
const stream = block.subarray(at);

const records = await reader.chunk(index);
const places: string[] = ["no place"];
for (const id of records.palette) {
	const place = await reader.place(id);
	places.push(place.internationalName || place.localName);
}
// Over every depth as one byte, then every palette index as one byte.
const hash = createHash("sha256");
hash.update(records.depths);
hash.update(Uint8Array.from(records.paletteIndices));

writeFileSync(`${out}chunk-${index}.bin`, stream);
writeFileSync(
	`${out}chunk-${index}.json`,
	JSON.stringify({
		source: file.split("/").pop(),
		chunk: index,
		maxDepth: reader.header.maxDepth,
		paletteCount: paletteCount.value,
		recordCount: recordCount.value,
		bytes: stream.length,
		boundingBox: reader.chunkBoundingBox(index),
		places,
		recordsSha256: hash.digest("hex"),
	}) + "\n",
);
console.log(`chunk ${index}: ${stream.length} stream bytes of ${length}, ${recordCount.value} records`);
await reader.close();
