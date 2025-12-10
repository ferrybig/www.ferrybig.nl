const cspHeader = `
default-src 'self';
connect-src 'self' analytics.ferrybig.nl;
script-src 'self' 'unsafe-eval' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' blob: data:;
font-src 'self';
object-src 'none';
base-uri 'self';
frame-src 'self' projects.ferrybig.nl giscus.app;
form-action 'self';
frame-ancestors 'none';
block-all-mixed-content;
`;

/** @type {import('next').NextConfig} */
const nextConfig = {
	output: 'export',
	reactStrictMode: true,
	images: {
		unoptimized: true,
	},
	productionBrowserSourceMaps: true,
	eslint: {
		ignoreDuringBuilds: process.env.IGNORE_ERRORS === 'true',
	},
	typescript: {
		ignoreBuildErrors: process.env.IGNORE_ERRORS === 'true',
	},
	experimental: {
		reactCompiler: true,
		gzipSize: false,
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
		{ buildId, dev, isServer, defaultLoaders, nextRuntime, webpack }
	) => {
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
