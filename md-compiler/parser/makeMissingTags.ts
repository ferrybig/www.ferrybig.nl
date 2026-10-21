import { join } from 'node:path/posix';
import type { CompileResults, CompileResultsArticle, CompileResultsSubTasks, RunningConfig } from '../types.js';
import makeGeneratedPage from './makeGeneratedPage.js';

function titleCase(str: string): string {
	return str[0].toUpperCase() + str.slice(1);
}

export default function makeMissingTags(results: Exclude<CompileResults, CompileResultsSubTasks>[], config: RunningConfig): CompileResultsArticle[] {
	const newTags = new Map<string, CompileResultsArticle | null>();
	for (const result of results) {
		if (result.type !== 'article') continue;
		newTags.set(result.metadata.slug, null);
		for (const tag of result.metadata.tags) {
			if (!newTags.has(tag)) {
				const outputPath = join(tag, 'page.js');
				const parent = tag.split('/').slice(0, -1).join('/');
				newTags.set(tag, {
					type: 'article',
					contents: makeGeneratedPage(null, [], tag, `${tag}/index.md`, config),
					metadata: {
						slug: tag,
						date: null,
						color: null,
						icon: null,
						deprecated: false,
						commentStatus: config.defaultCommentStatus,
						tags: parent ? [parent] : [],
						readingTimeMax: 0,
						readingTimeMin: 0,
						thumbnail: null,
						excludeFromAll: false,
						excludeFromChildren: false,
						childrenLayout: 'list',
						summary: null,
						coAuthors: [],
						title: titleCase(tag),
						linkTitle: titleCase(tag),
						children: 'auto',
						updatedAt: result.metadata.updatedAt,
						topicIndex: null,
					},
					file: outputPath,
					needsFeeds: false,
				});
			}
		}
	}
	return [...newTags.values()].filter((x): x is CompileResultsArticle => x !== null);
}
