const cspHeader = `
default-src 'self';
connect-src 'self' analytics.ferrybig.nl;
script-src 'self' 'unsafe-eval' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' blob: data: https://tile.openstreetmap.org;
font-src 'self';
object-src 'none';
base-uri 'self';
frame-src 'self' projects.ferrybig.nl giscus.app;
form-action 'self';
frame-ancestors 'none';
block-all-mixed-content;
`;

/**
 * Next minifies every emitted `.js` file, including scripts that a post imports as
 * an asset (`<script src="...">`). Those are bundled and minified already, and
 * should reach the reader byte for byte as they were tested, so they are marked as
 * minified. Only files that came from asset modules have a `sourceFilename`.
 */
class KeepImportedScriptsAsTheyAre {
	/** @param {import('webpack').Compiler} compiler */
	apply(compiler) {
		const { Compilation } = compiler.webpack;
		compiler.hooks.thisCompilation.tap('KeepImportedScriptsAsTheyAre', (compilation) => {
			compilation.hooks.processAssets.tap(
				{ name: 'KeepImportedScriptsAsTheyAre', stage: Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE },
				() => {
					for (const { name, info } of compilation.getAssets()) {
						if (info.sourceFilename && /\.[cm]?js$/.test(name)) {
							compilation.updateAsset(name, (source) => source, { minimized: true });
						}
					}
				},
			);
		});
	}
}

const importedAsset = /rehype-asset/;

/** Whether a rule's `test` condition (a regex, or `{ or: [...] }` as Next writes it) matches `x.js`. */
function matchesScripts(test) {
	if (test instanceof RegExp) return test.test('x.js');
	return Array.isArray(test?.or) && test.or.some(matchesScripts);
}

/**
 * Files imported with `?rehype-asset` are copied as they are, so none of Next's loaders
 * (SWC, the React compiler) may touch them either.
 * @param {import('webpack').RuleSetRule[]} rules
 */
function skipImportedAssets(rules) {
	for (const rule of rules) {
		if (!rule || typeof rule !== 'object') continue;
		if (rule.oneOf) skipImportedAssets(rule.oneOf);
		if (rule.rules) skipImportedAssets(rule.rules);
		// Only the rules for scripts.
		if (!matchesScripts(rule.test)) continue;
		if (!rule.use && !rule.loader) continue;
		const skip = { not: importedAsset };
		rule.resourceQuery = rule.resourceQuery ? { and: [rule.resourceQuery, skip] } : skip;
	}
}

/** @type {import('next').NextConfig} */
const nextConfig = {
	output: 'export',
	reactStrictMode: true,
	images: {
		unoptimized: true,
	},
	productionBrowserSourceMaps: true,
	typescript: {
		ignoreBuildErrors: process.env.IGNORE_ERRORS === 'true',
	},
	reactCompiler: true,
	experimental: {
		gzipSize: true,
	},
	eslint: {
		dirs: ['.'], //or ['pages', 'hooks']
	},
	async headers() {
		return [
			{
				source: '/(.*)',
				headers: [
					{
						key: 'Content-Security-Policy',
						value: cspHeader.replace(/\n/g, ''),
					},
				],
			},
			{
				source: '/giscus.css',
				headers: [
					{ key: 'Access-Control-Allow-Origin', value: 'https://giscus.app' },
				],
			},
		];
	},

	webpack: (
		config,
		{ dev },
	) => {
		config.plugins.push(new KeepImportedScriptsAsTheyAre());
		skipImportedAssets(config.module.rules);
		// Important: return the modified config
		config.module.rules.push({
			resourceQuery: /rehype-asset/,
			type: 'asset/resource',

			generator: {
				filename: 'static/[path][name].[hash][ext]',
				//publicPath: '/.next',
				outputPath: dev ? '..' : '../..',
			},
		});
		return config;
	},
};

export default nextConfig;
