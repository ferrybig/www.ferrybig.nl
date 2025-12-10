import './globals.css';
import type { Metadata, Viewport } from 'next/types';
import { Noto_Sans } from 'next/font/google';
import classNames from 'clsx';
import { Analytics } from './_components/Analytics';
import Nav from './_components/Nav';
import favicon409x409 from '@assets/face.png';
import favicon16x16 from '@assets/favicon-16x16.png';
import favicon32x32 from '@assets/favicon-32x32.png';
import favicon150x150 from '@assets/mstile-150x150.png';
import favicon192x192 from '@assets/android-chrome-192x192.png';
import favicon384x384 from '@assets/android-chrome-384x384.png';
import appleTouch from '@assets/apple-touch-icon.png';
import classes from './layout.module.css';

const font = Noto_Sans({ weight: ['400', '600', '700'], subsets: ['latin'] });

export const viewport: Viewport = {
	themeColor: '#990000',
	colorScheme: 'dark light',
};

export const metadata: Metadata = {
	metadataBase: new URL('https://ferrybig.nl'),
	title: 'ferrybig.nl',
	authors: [
		{
			name: 'Fernando',
			url: 'https://ferrybig.nl',
		},
	],
	formatDetection:{
		address: false,
		date: false,
		email: false,
		telephone: false,
		url: false,
	},
	icons: {
		icon: [
			...process.env.NODE_ENV === 'production' ? [{
				url: favicon409x409.src.replace(/\.png$/, '.avif'),
				sizes: '409x409',
				type: 'image/avif',
			},
			{
				url: favicon384x384.src.replace(/\.png$/, '.avif'),
				sizes: '384x384',
				type: 'image/avif',
			},
			{
				url: favicon192x192.src.replace(/\.png$/, '.avif'),
				sizes: '192x192',
				type: 'image/avif',
			},
			{
				url: favicon150x150.src.replace(/\.png$/, '.avif'),
				sizes: '150x150',
				type: 'image/avif',
			},
			{
				url: favicon32x32.src.replace(/\.png$/, '.avif'),
				sizes: '32x32',
				type: 'image/avif',
			},
			{
				url: favicon16x16.src.replace(/\.png$/, '.avif'),
				sizes: '16x16',
				type: 'image/avif',
			}] : [],
			{
				url: favicon409x409.src,
				sizes: '409x409',
				type: 'image/png',
			},
			{
				url: favicon384x384.src,
				sizes: '384x384',
				type: 'image/png',
			},
			{
				url: favicon192x192.src,
				sizes: '192x192',
				type: 'image/png',
			},
			{
				url: favicon150x150.src,
				sizes: '150x150',
				type: 'image/png',
			},
			{
				url: favicon32x32.src,
				sizes: '32x32',
				type: 'image/png',
			},
			{
				url: favicon16x16.src,
				sizes: '16x16',
				type: 'image/png',
			},
			{
				url: '/favicon.ico',
				sizes: '48x48',
			},
		],
		apple: {
			url: appleTouch.src,
			sizes: '180x180',
		},
	},
	manifest: '/site.webmanifest',
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body className={classNames(font.className, classes.body)}>
				<Analytics/>
				<div className={classes.skipToContent}>
					Skip to <a href="#main">the article</a>
				</div>
				<header className={classes.barTop}>
					<Nav/>
				</header>
				{children}
				<footer id="footer" className={classes.barBottom}>
					<div className={classes.footer}>
					</div>
				</footer>
			</body>
		</html>
	);
}
