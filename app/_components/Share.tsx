'use client';
import Link from 'next/link';
import { type MouseEvent, type ReactNode, useState } from 'react';
import { createPortal } from 'react-dom';
import ShareDialog from './ShareDialog';

interface Share {
	slug: string;
}
function Share({ slug }: Share) {
	const [jsx, setJsx] = useState<ReactNode>(undefined);
	function sharePage(e: MouseEvent) {
		e.preventDefault();
		const shareUrl = new URL('/' + slug, document.location.href);
		shareUrl.searchParams.set('utm_medium', 'share');
		setJsx(
			<ShareDialog
				href={shareUrl.href}
				title={document.title}
				onClose={() => setJsx(undefined)}
			/>,
		);
	}
	return (
		<>
			<Link
				href={'/' + slug + '?utm_source=share-btn&utm_medium=share'}
				onClick={sharePage}
			>
				share
			</Link>
			{jsx && createPortal(jsx, document.body)}
		</>
	);
}
export default Share;
