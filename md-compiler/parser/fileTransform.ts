import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path/posix';
import { unified } from 'unified';
import { toString as nodeToText } from 'mdast-util-to-string';
import matter from 'gray-matter';
import remarkParse from 'remark-parse';
import type { Root } from 'mdast';
import type { CompileResults, CompileResultsArticle, CompileResultsSubTasks, RunningConfig } from '../types.js';
import z from 'zod';
import tableOfContents from './tableOfContents.js';
import { compileMdx } from './compileMdx.js';
import generateStaticFiles from './staticFiles.js';
import makeMissingTags from './makeMissingTags.js';
import makeContent from './makeContent.js';
import makeGeneratedPage from './makeGeneratedPage.js';
import makeFeeds from './makeFeeds.js';

const ARTICLE_DATA = z.object({
	excludeFromAll: z.optional(z.boolean()).default(false),
	excludeFromChildren: z.optional(z.boolean()).default(false),
	deprecated: z.optional(z.boolean()).default(false),
	commentStatus: z.optional(z.enum(['open', 'closed', 'disabled'])),
	children: z.optional(z.enum(['auto', 'root', 'content'])).default('auto'),
	linkTitle: z.optional(z.string()),
	date: z.optional(z.string()),
	color: z.optional(z.string()),
	icon: z.optional(z.string()),
	thumbnail: z.optional(z.object({
		image: z.string(),
		link: z.optional(z.string()),
		alt: z.optional(z.string()),
		height: z.optional(z.number()),
		width: z.optional(z.number()),
		embed: z.optional(z.string()),
	}).or(z.string())),
	tags: z.optional(z.array(z.string())).default([]),
	childrenLayout: z.optional(z.enum(['card', 'list'])),
	topicIndex: z.optional(z.number()),
}).strict();

const MAX_SUMMARY_LENGTH = 400;

function readSummary(tree: Root) {
	let text = '';
	for (let i = 0; i < tree.children.length && text.length < MAX_SUMMARY_LENGTH; i++) {
		if (tree.children[i].type === 'heading' && text.length === 0) continue;
		if (tree.children[i].type !== 'paragraph' && tree.children[i].type !== 'text') break;
		text += nodeToText(tree.children[i]) + ' ';
	}
	if (!text) {
		return null;
	}
	const shouldCut = text.length > MAX_SUMMARY_LENGTH;
	if (shouldCut) {
		const lastSpaceIndex = text.lastIndexOf(' ', MAX_SUMMARY_LENGTH);
		text = text.substring(0, lastSpaceIndex === -1 ? MAX_SUMMARY_LENGTH : lastSpaceIndex);
		text = text[text.length - 1] === '.' ? text.substring(0, text.length - 1) : text;
		text += '…';
	}
	return text;
}

const cacheKeyTimestamps = Symbol('cache-timestamps');
const cacheKey = Symbol('cache');

async function processFile(paths: string[], config: RunningConfig): Promise<CompileResultsArticle> {
	const file = join(config.inputDir, ...paths);
	try {
		console.log(file);
		const timestamps = await config.cache.memo(async () => {
			const t: Record<string, number> = {};
			try {
				const timestampData = await readFile('../timestamps.txt', { encoding: 'utf8' });
				if (timestampData.length === 0) throw new Error('Timestamp file is empty');
				for (const row of timestampData.split('\0')) {
					const [value, key] = row.split('\t', 2);
					t['../' + key] = parseInt(value, 10) * 1000;
				}
			} catch (e) {
				if (!(e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT')) throw e;
			}
			return t;
		}, cacheKeyTimestamps, []);
		const modificationTime = timestamps[file] ?? (await stat(file)).mtimeMs;

		return await config.cache.memo(async () => {
			const raw: string = await readFile(file, { encoding: 'utf8' });

			const {
				content,
				data: rawData,
			} = matter(raw);

			const data = ARTICLE_DATA.parse(rawData);

			const tree = unified()
				.use(remarkParse as any) // todo fix this
				.parse(content) as Root;
			const tableOfContent = tableOfContents(tree, Infinity);
			// Note, the following is buggy as it does not account for the fact that some HTML elements add newlines between them.
			// An article with lots of automatic newlines will have a lower word count
			const wordCount = nodeToText(tree).split(/\s+/g).length;

			const originalPath = paths.join('/');
			const withoutLast = dirname(originalPath);
			const last = originalPath.substring(withoutLast.length + 1);
			const lastWithoutExtension = last.substring(0, last.length - 3);
			const path = originalPath === 'index.md' ? 'page.js' : (withoutLast + '/' + (lastWithoutExtension === 'index' ? 'page.js' : lastWithoutExtension + '/page.js'));

			const slug = path.split('/').slice(0, -1).join('/');

			const thumbnail =
				typeof data.thumbnail === 'string' ? { image: data.thumbnail } :
				typeof data.thumbnail === 'object' ? data.thumbnail :
				undefined;
			const contents = makeGeneratedPage(
				content.trim().length === 0 ? null : await compileMdx(file, join(config.outputDir, path), content),
				tableOfContent,
				slug,
				file,
				config,
			);
			const tags = [...data.tags];
			const parentTag = path.split('/').slice(0, -2).join('/');
			if (parentTag) {
				const index = tags.indexOf(parentTag);
				if (index < 0) {
					if (index > 0) tags.splice(index, 1);
					tags.unshift(parentTag);
				}
			}
			if (new Set(tags).size != tags.length) {
				throw new Error('Duplicate tag detected');
			}

			return {
				type: 'article',
				file: path,
				contents: contents,
				needsFeeds: false,
				metadata: {
					slug,
					date: data.date ?? null,
					deprecated: data.deprecated,
					commentStatus: data.commentStatus ?? config.defaultCommentStatus,
					children: data.children,
					tags,
					readingTimeMax: Math.max(Math.ceil(wordCount / 200), 1),
					readingTimeMin: Math.max(Math.floor(wordCount / 228), 1),
					thumbnail: thumbnail ? {
						image: join(dirname(file), thumbnail.image),
						alt: thumbnail?.alt ?? null,
						height: thumbnail?.height ?? null,
						width: thumbnail?.width ?? null,
						embed: thumbnail?.embed ?? null,
						link: thumbnail?.link ? thumbnail.link : null,
					} : null,
					excludeFromAll: data.excludeFromAll,
					excludeFromChildren: data.excludeFromChildren,
					title: tableOfContent[0]?.title ?? path.split('/').slice(0, -1).join('/'),
					linkTitle: data.linkTitle ?? tableOfContent[0]?.title ?? path.split('/').slice(0, -1).join('/'),
					updatedAt: new Date(modificationTime).toISOString(),
					summary: readSummary(tree),
					childrenLayout: data.childrenLayout ?? null,
					topicIndex: data.topicIndex ?? null,
					color: data.color ?? null,
					icon: data.icon ? join(dirname(file), data.icon) : null,
				},
			};
		}, cacheKey, [{file, modificationTime}]);

	} catch (e) {
		throw new Error('Unable to parse file `' + file + '`: ' + e, {cause: e});
	}
}

async function processDir(paths: string[], config: RunningConfig): Promise<CompileResultsSubTasks> {
	const promises: Promise<CompileResults>[] = [];
	const contents = await readdir(join(config.inputDir, ...paths), { withFileTypes: true });
	for (const entry of contents) {
		if (entry.isDirectory()) {
			promises.push(processDir([...paths, entry.name], config));
		} else if (entry.isFile() && entry.name.endsWith('.md')) {
			promises.push(processFile([...paths, entry.name], config));
		}
	}
	return {type: 'sub-tasks', children: promises};
}

async function transformFiles(config: RunningConfig): Promise<Exclude<CompileResults, CompileResultsSubTasks>[]> {
	const promises: (CompileResults | Promise<CompileResults>)[] = [];

	promises.push(processDir([], config));
	promises.push(generateStaticFiles());

	let promise: Promise<CompileResults> | CompileResults | undefined;
	let results: Exclude<CompileResults, CompileResultsSubTasks>[] = [];
	// eslint-disable-next-line no-cond-assign
	while (promise = promises.pop()) {
		const result = await promise;
		if (result.type === 'sub-tasks') {
			promises.push(...result.children);
			continue;
		}
		results.push(result);
	}
	results.push(...makeMissingTags(results, config));
	results = makeContent(results, config);
	results.push(...makeFeeds(results, config));
	return results;
}
export default transformFiles;
