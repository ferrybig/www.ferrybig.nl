import favicon192x192 from '@assets/android-chrome-192x192.png';
import favicon384x384 from '@assets/android-chrome-384x384.png';
import type { WebAppManifest } from 'web-app-manifest';

export function GET() {
	const manifest: WebAppManifest = {
		name: 'ferrybig.nl',
		short_name: 'ferrybig',
		display: 'browser',
		icons: [
			{
				src: favicon192x192.src.replace(/\.png$/, '.avif'),
				sizes: '192x192',
				type: 'image/avif',
			},
			{
				src: favicon384x384.src.replace(/\.png$/, '.avif'),
				sizes: '384x384',
				type: 'image/avif',
			},
			{
				src: favicon192x192.src,
				sizes: '192x192',
				type: 'image/png',
			},
			{
				src: favicon384x384.src,
				sizes: '384x384',
				type: 'image/png',
			},
		],
		theme_color: '#000000',
		background_color: '#990000',
	};
	return new Response(JSON.stringify(manifest), {
		headers: { 'Content-Type': 'application/json' },
	});
}
export const dynamic = 'force-static';
