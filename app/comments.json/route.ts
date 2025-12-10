import { getAllPosts } from '../content';

export function GET() {
	return new Response (
		JSON.stringify(getAllPosts()
			//.filter(({ commentStatus }) => commentStatus !== 'disabled')
			.map(({ slug, commentStatus, title }) => ({ url: slug, status: commentStatus, title })),
		),
		{headers: {'Content-Type': 'application/json'}},
	);
}
export const dynamic = 'force-static';
