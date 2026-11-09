import type { ComponentType, ReactElement } from 'react';

export interface TableOfContentsEntry {
	readonly title: string,
	readonly slug: string,
	readonly lvl: number,
}

export interface MetaData {
	readonly slug: string,
	readonly date: string | null,
	readonly color: string | null,
	readonly icon: string | null,
	readonly updatedAt: string,
	readonly topicIndex: number | null,
	readonly tags: string[],
	readonly title: string,
	readonly childrenLayout: 'card' | 'list' | null,
	readonly deprecated: boolean,
	readonly commentStatus: 'open' | 'closed' | 'disabled',
	readonly excludeFromAll: boolean,
	readonly excludeFromChildren: boolean,
	readonly readingTimeMin: number,
	readonly readingTimeMax: number,
	readonly children: 'auto' | 'root' | 'content',
	readonly linkTitle: string,
	readonly summary: string | null,
	readonly authors: {
		readonly name: string,
		readonly url: string | null,
		readonly role: string | null,
	}[],
	readonly thumbnail: {
		readonly alt: string | null,
		readonly link: string | null,
		readonly width: number | null,
		readonly height: number | null,
		readonly image: string,
		readonly embed: string | null,
	} | null,
}
export interface ArticleWrapperProps {
	slug: string,
	id: number,
	metadata: MetaData,
	children: MetaData[],
	feeds: boolean,
	toc: TableOfContentsEntry[],
	originalFile: string | null
	factory: null | ((props: { components: Record<string, ComponentType<any>> }) => ReactElement),
}
