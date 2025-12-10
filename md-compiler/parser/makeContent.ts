import type {
	CompileResults,
	CompileResultsArticle,
	CompileResultsFile,
	CompileResultsSubTasks,
	RunningConfig,
} from '../types.js';
import assertNever from '../utils/assertNever.js';

const typeofPriority: Record<'string' | 'number' | 'bigint' | 'boolean' | 'symbol' | 'undefined' | 'object' | 'function', number> = {
	string: 0,
	number: 1,
	boolean: 2,
	object: 3,
	bigint: 4,
	function: 5,
	symbol: 6,
	undefined: 7,
};
interface Comparator<T> {
	(a: T, b: T): 1 | -1 | 0;
}
function genericCompare(aValue: unknown, bValue: unknown): 1 | -1 | 0 {
	const aType = typeof aValue;
	const bType = typeof bValue;
	const aPriority = typeofPriority[aType];
	const bPriority = typeofPriority[bType];
	if (aPriority < bPriority) return -1;
	if (aPriority > bPriority) return 1;

	switch (aType) {
	case 'string':
	case 'number':
	case 'bigint':
	case 'boolean':
		if (aValue as any < (bValue as any)) return -1;
		if (aValue as any > (bValue as any)) return 1;
		return 0;
	default:
		if (aValue !== bValue) {
			throw new Error(`Cannot compare ${aType} values`);
		}
		return 0;
	}
}
function comparing<T>(getter: (value: T) => unknown): Comparator<T> {
	return (a: T, b: T) => genericCompare(getter(a), getter(b));
}
function comparingDesc<T>(getter: (value: T) => unknown): Comparator<T> {
	return (a: T, b: T) => -genericCompare(getter(a), getter(b)) as 1 | -1 | 0;
}
function comparingChain<T>(...comparators: Comparator<T>[]): Comparator<T> {
	return (a: T, b: T) => {
		for (const comparator of comparators) {
			const result = comparator(a, b);
			if (result !== 0) return result;
		}
		return 0;
	};

}
function arrayMappedSort<T>(items: T[], comparator: Comparator<T>): Comparator<number> {
	return (a: number, b: number) => {
		return comparator(items[a], items[b]);
	};
}

export default function makeContent(
	results: Exclude<CompileResults, CompileResultsSubTasks>[],
	{miniumForFeedGeneration}: RunningConfig,
): Exclude<CompileResults, CompileResultsSubTasks>[] {
	let importId = 0;
	const importMap = new Map<string, string>();
	const articles = results.filter(
		(x): x is CompileResultsArticle => x.type === 'article',
	);
	const children: number[][] = [];
	const topicIndex: number[] = [];
	const slugMap = new Map<string, number>();
	const rootChildren: number[] = [];
	const contentChildren: number[] = [];
	for (let i = 0; i < articles.length; i++) {
		const article = articles[i];
		children.push([]);
		slugMap.set(article.metadata.slug, i);
	}
	for (let i = 0; i < articles.length; i++) {
		const article = articles[i];
		if (article.metadata.topicIndex!== null) {
			topicIndex.push(i);
		}
		if (!article.metadata.excludeFromChildren) {
			for (const tag of article.metadata.tags) {
				const tagIndex = slugMap.get(tag);
				if (tagIndex !== undefined) {
					children[tagIndex].push(i);
				} else {
					throw new Error(`Tag '${tag}' does not exist in slugMap.`);
				}
			}
		}
		if (!article.metadata.excludeFromAll) {
			if (article.metadata.tags.length === 0) {
				rootChildren.push(i);
			}
			if (article.metadata.date !== null) {
				contentChildren.push(i);
			}
		}
	}
	// Update children to follow the type stored in metadata
	for (let i = 0; i < articles.length; i++) {
		const childrenType = articles[i].metadata.children;
		children[i] =
			childrenType === 'root' ? rootChildren.slice() :
			childrenType === 'content' ? contentChildren.slice() :
			childrenType === 'auto' ? children[i]  :
			assertNever(childrenType);
	}
	// Update updatedAt to the latest updatedAt of the children
	const newArticles: typeof articles = [];
	{
		const scanned: boolean[] = [];
		const scan = (index: number) => {
			if (scanned[index]) return newArticles[index];
			if (scanned[index] === false) throw new Error('Circular dependency');
			scanned[index] = false;
			let highestUpdatedAt = articles[index].metadata.updatedAt;
			for (const child of children[index]) {
				const childArticle = scan(child);
				const childUpdatedAt = childArticle.metadata.updatedAt;
				if (childUpdatedAt != null && (highestUpdatedAt == null || childUpdatedAt > highestUpdatedAt)) {
					highestUpdatedAt = childArticle.metadata.updatedAt;
				}
			}
			const newEntry = {
				...articles[index],
				metadata: {
					...articles[index].metadata,
					updatedAt: highestUpdatedAt,
				},
			};
			newArticles[index] = newEntry;
			scanned[index] = true;
			return newEntry;
		};
		for (let i = 0; i < articles.length; i++) {
			scan(i);
		}
	}

	// Sort everything
	const defaultSort = [
		comparingDesc((e: CompileResultsArticle) => e.metadata.date),
		comparing((e: CompileResultsArticle) => e.metadata.title),
		comparing((e: CompileResultsArticle) => e.metadata.slug),
	];
	rootChildren.sort(arrayMappedSort(articles, comparingChain(
		...defaultSort,
	)));
	contentChildren.sort(arrayMappedSort(articles, comparingChain(
		...defaultSort,
	)));
	topicIndex.sort(arrayMappedSort(articles, comparingChain(
		comparing((e: CompileResultsArticle) => e.metadata.topicIndex),
		...defaultSort,
	)));
	for (const list of children) {
		list.sort(arrayMappedSort(articles, comparingChain(
			...defaultSort,
		)));
	}

	let postsContent = 'const posts = [\n';
	for (let i = 0; i < articles.length; i++) {
		const article = articles[i];
		postsContent += '\t';
		postsContent += JSON.stringify(article.metadata, (key, value) => {
			if ((key === 'image' || key === 'icon') && typeof value === 'string') {
				const importName = importMap.get(value);
				if (importName !== undefined) {
					return importName;
				}
				const newImportId = `____IMPORT_${importId++}____`;
				importMap.set(value, newImportId);
				return newImportId;
			}
			return value;
		});
		postsContent += ',\n';
	}
	postsContent += '];\n';

	const rootChildrenContent = `const rootChildren = ${JSON.stringify(rootChildren)}\n`;
	const contentChildrenContent = `const contentChildren = ${JSON.stringify(contentChildren)}\n`;
	const topicIndexContent = `const topicIndex = ${JSON.stringify(topicIndex)}\n`;

	let slugMapContent = 'const slugMap = {\n';
	for (const [key, value] of slugMap.entries()) {
		slugMapContent += `\t${JSON.stringify(key)}: ${value},\n`;
	}
	slugMapContent += '}\n';

	let childrenContent = 'const children = [\n';
	for (const childList of children) {
		childrenContent += `\t${JSON.stringify(childList)},\n`;
	}
	childrenContent += ']\n';

	let importContent = '';
	for (const [key, value] of importMap.entries()) {
		importContent += `import ${value} from ${JSON.stringify(key)};\n`;
		postsContent = postsContent.replaceAll(`"${value}"`, value);
	}

	for (let i = 0; i < newArticles.length; i++) {
		newArticles[i] = {
			...newArticles[i],
			needsFeeds: children[i].length >= miniumForFeedGeneration,
		};
	}

	return [
		...results.filter(
			(x) => x.type !== 'article',
		),
		...newArticles,
		{
			type: 'file',
			contents: `/* eslint-disable */
import 'server-only';
${importContent}
${postsContent}
${childrenContent}
${slugMapContent}
${rootChildrenContent}
${contentChildrenContent}
${topicIndexContent}
const miniumForFeedGeneration = ${miniumForFeedGeneration};
export function getIdBySlug(slug) {
	const id = slugMap[slug];
	if (id === undefined) throw new Error("Slug not found: " + slug);
	return id;
}
export function getMetadata(id) {
	return posts[id];
}
export function getMetadataBySlug(slug) {
	const id = getIdBySlug(slug);
	return getMetadata(id);
}

export function getChildren(id) {
	return children[id].map(i => posts[i]);
}
export function getChildrenBySlug(slug) {
	const id = getIdBySlug(slug);
	return children[id].map(i => posts[i]);
}

export function hasFeeds(id) {
	return children[id].length >= miniumForFeedGeneration;
}
export function hasFeedsBySlug(slug) {
	const id = getIdBySlug(slug);
	return hasFeeds(id);
}

export function getRootChildren() {
	return rootChildren.map(i => posts[i]);
}
export function getContentChildren() {
	return contentChildren.map(i => posts[i]);
}
export function getTopicChildren() {
	return topicIndex.map(i => posts[i]);
}
export function getAllPosts() {
	return posts;
}
`,
			file: 'content.js',
		} satisfies CompileResultsFile,
	];

}
