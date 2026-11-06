// Bundles src/element.ts into dist/geodata-range-coder.js, a single ES module
// that registers the <geodata-range-coder> element and carries its own CSS.
//
//   node build.mjs dev     serve index.html with live reload on :5173
//   node build.mjs build   minified bundle for embedding
import * as esbuild from "esbuild";

const mode = process.argv[2] ?? "build";
const dev = mode === "dev";

/** @type {import("esbuild").BuildOptions} */
const options = {
	entryPoints: { "geodata-range-coder": "src/element.ts" },
	bundle: true,
	format: "esm",
	target: "es2022",
	outdir: "dist",
	jsx: "automatic",
	jsxImportSource: "preact",
	// The stylesheet goes into the element's shadow root as text.
	loader: { ".css": "text" },
	minify: !dev,
	sourcemap: dev,
	legalComments: "none",
	logLevel: "info",
};

if (dev) {
	const context = await esbuild.context(options);
	await context.watch();
	const { hosts, port } = await context.serve({ servedir: ".", port: 5173 });
	console.log(`Serving http://${hosts[0]}:${port}/`);
} else {
	await esbuild.build(options);
}
