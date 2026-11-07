import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { tilesCovering } from "../src/ui/streetMap.ts";

test("the OpenStreetMap tiles behind chunk 207623", () => {
	const meta = JSON.parse(readFileSync(new URL("../src/real/chunk-207623.json", import.meta.url), "utf8")) as {
		boundingBox: { minLon: number; maxLon: number; minLat: number; maxLat: number };
	};
	// The tiles a map of this box (Leaflet, at zoom 10) loads.
	assert.deepEqual(
		tilesCovering(meta.boundingBox).map((t) => t.url),
		[334, 335, 336].flatMap((y) =>
			[526, 527].map((x) => `https://tile.openstreetmap.org/10/${x}/${y}.png`),
		),
	);
});
