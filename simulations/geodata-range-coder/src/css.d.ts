declare module "*.css" {
	/** esbuild's text loader: the stylesheet as a string. */
	const css: string;
	export default css;
}

declare module "*.bin" {
	/** esbuild's binary loader: the file's bytes. */
	const bytes: Uint8Array;
	export default bytes;
}
