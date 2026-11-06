declare module "*.css" {
	/** esbuild's text loader: the stylesheet as a string. */
	const css: string;
	export default css;
}
