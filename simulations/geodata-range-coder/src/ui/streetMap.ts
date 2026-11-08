export interface BoundingBox {
	minLon: number;
	maxLon: number;
	minLat: number;
	maxLat: number;
}

/** The zoom level of the tiles: a chunk of the world file is two tiles wide there. */
const ZOOM = 10;
const TILE = 256;
const WORLD = TILE * 2 ** ZOOM;

const lonToX = (lon: number) => ((lon + 180) / 360) * WORLD;
/** Web Mercator, which is what the tiles are drawn in. */
const latToY = (lat: number) => {
	const phi = (lat * Math.PI) / 180;
	return ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * WORLD;
};

/** The tiles that cover a box, as the OpenStreetMap server names them. */
export function tilesCovering(box: BoundingBox) {
	const x0 = Math.floor(lonToX(box.minLon) / TILE);
	const x1 = Math.ceil(lonToX(box.maxLon) / TILE) - 1;
	const y0 = Math.floor(latToY(box.maxLat) / TILE);
	const y1 = Math.ceil(latToY(box.minLat) / TILE) - 1;
	const tiles: { x: number; y: number; url: string }[] = [];
	for (let y = y0; y <= y1; y++) {
		for (let x = x0; x <= x1; x++) {
			tiles.push({ x, y, url: `https://tile.openstreetmap.org/${ZOOM}/${x}/${y}.png` });
		}
	}
	return tiles;
}

/**
 * Draws OpenStreetMap into `canvas` so that it lines up with the chunk's own
 * grid. The chunk is `canvas.width` cells square, linear in latitude and in
 * longitude, while the tiles are in Web Mercator. Along the longitude the two
 * agree. Along the latitude every row of the canvas is cut from the tile
 * row where that latitude is. Tiles are drawn as they arrive. Returns what
 * cancels the loading.
 */
export function paintStreetMap(canvas: HTMLCanvasElement, box: BoundingBox): () => void {
	const context = canvas.getContext("2d");
	if (!context) return () => {};
	const tiles = tilesCovering(box);
	const left = Math.min(...tiles.map((t) => t.x)) * TILE;
	const top = Math.min(...tiles.map((t) => t.y)) * TILE;
	const width = (Math.max(...tiles.map((t) => t.x)) + 1) * TILE - left;
	const height = (Math.max(...tiles.map((t) => t.y)) + 1) * TILE - top;

	// The tiles as one picture in Mercator, drawn to the grid whenever one more arrives.
	const mosaic = document.createElement("canvas");
	mosaic.width = width;
	mosaic.height = height;
	const mosaicContext = mosaic.getContext("2d");
	if (!mosaicContext) return () => {};

	const cells = canvas.width;
	const sourceX = lonToX(box.minLon) - left;
	const sourceWidth = lonToX(box.maxLon) - lonToX(box.minLon);
	const redraw = () => {
		for (let row = 0; row < cells; row++) {
			const north = box.maxLat - (row / cells) * (box.maxLat - box.minLat);
			const south = box.maxLat - ((row + 1) / cells) * (box.maxLat - box.minLat);
			const y = latToY(north) - top;
			context.drawImage(mosaic, sourceX, y, sourceWidth, latToY(south) - top - y, 0, row, cells, 1);
		}
	};

	let cancelled = false;
	const images = tiles.map((tile) => {
		const image = new Image();
		image.crossOrigin = "anonymous";
		image.onload = () => {
			if (cancelled) return;
			mosaicContext.drawImage(image, tile.x * TILE - left, tile.y * TILE - top);
			redraw();
		};
		image.src = tile.url;
		return image;
	});
	return () => {
		cancelled = true;
		for (const image of images) image.src = "";
	};
}
