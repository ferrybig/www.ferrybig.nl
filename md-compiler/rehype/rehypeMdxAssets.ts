import type {  ImportDeclaration } from 'estree';
import type {  Root, RootContent, Element } from 'hast';
import type {  MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx';
import { basename, dirname, join } from 'node:path/posix';
import type {  Plugin } from 'unified';
import { visit } from 'unist-util-visit';
import importRelative from '../parser/importRelative.js';

const urlPattern = /^(https?:)?\//;

interface Options {
	inputFileName: string,
	outputFileName: string,
}

interface State {
	imported: Map<string, string>,
	imports: ImportDeclaration[],
	relativePath: string,
}

function getVariableNameForUrl({ imported, imports}: State, url: string) {
	const existingName = imported.get(url);
	if (existingName) return existingName;
	const name = `__${imported.size}_${url.replaceAll(/\W/g, '_')}__`;

	imports.push({
		type: 'ImportDeclaration',
		source: { type: 'Literal', value: url.endsWith('png') || url.endsWith('jpg') || url.endsWith('svg') ? url : `${url}?rehype-asset` },
		specifiers: [
			{
				type: 'ImportDefaultSpecifier',
				local: { type: 'Identifier', name },
			},
		],
	});
	imported.set(url, name);
	return name;
}
function transformNode(state: State, input: Element, urlAttribute: string): RootContent {
	let url = input.properties[urlAttribute];
	if (typeof url !== 'string') return input;

	url = decodeURIComponent(`${url}`);
	if (urlPattern.test(url)) return input;

	url = join(state.relativePath, url);
	if (!url.startsWith('../')) url = `./${url}`;

	const name = getVariableNameForUrl(state, url);
	const newElement: MdxJsxTextElement = {
		type: 'mdxJsxTextElement',
		name: input.tagName,
		children: input.children as any,
		attributes: [
			{
				type: 'mdxJsxAttribute',
				name: urlAttribute,
				value: {
					type: 'mdxJsxAttributeValueExpression',
					value: name,
					data: {
						estree: {
							type: 'Program',
							sourceType: 'module',
							comments: [],
							body: [
								{
									type: 'ExpressionStatement',
									expression: {
										type: 'Identifier',
										name,
									},
								},
							],
						},
					},
				},
			},
		],
	};
	for (const [key, value] of Object.entries(input.properties)) {
		if (key === urlAttribute) continue;
		newElement.attributes.push({
			type: 'mdxJsxAttribute',
			name: key,
			value: value === null ? null : `${value}`,
		});
	}
	if (input.tagName === 'a') {
		newElement.attributes.push({
			type: 'mdxJsxAttribute',
			name: 'download',
			value: basename(input.properties[urlAttribute] as string),
		});
	}
	return newElement as any;
}

/**
 * A `<script src="relative/path.js">` written in a post is an MDX JSX element, not a
 * hast element, so it is rewritten here: the file becomes an imported asset with a
 * content hash in its name, like the images, and the tag gets the resulting URL.
 */
function transformScript(state: State, node: MdxJsxFlowElement): void {
	const attribute = node.attributes.find((a) => a.type === 'mdxJsxAttribute' && a.name === 'src');
	if (!attribute || typeof attribute.value !== 'string') return;
	if (urlPattern.test(attribute.value)) return;

	let url = join(state.relativePath, attribute.value);
	if (!url.startsWith('../')) url = `./${url}`;
	const name = getVariableNameForUrl(state, url);
	attribute.value = {
		type: 'mdxJsxAttributeValueExpression',
		value: name,
		data: {
			estree: {
				type: 'Program',
				sourceType: 'module',
				comments: [],
				body: [{ type: 'ExpressionStatement', expression: { type: 'Identifier', name } }],
			},
		},
	};
}

const rehypeMdxAssets: Plugin<[Options], Root> =
	({inputFileName, outputFileName}) =>
		(ast) => {

			const relativePath = importRelative(dirname(outputFileName), dirname(inputFileName));
			const imports: ImportDeclaration[] = [];
			const imported = new Map<string, string>();


			const state = { imported, imports, relativePath };
			visit(ast as any, ['mdxJsxFlowElement', 'mdxJsxTextElement'], (node: MdxJsxFlowElement) => {
				if (node.name === 'script') transformScript(state, node);
			});

			visit(ast, 'element', (node, index, parent) => {
				if (node.tagName === 'img') {
					parent!.children.splice(index!, 1, transformNode({ imported, imports, relativePath }, node, 'src'));
				} else if (node.tagName === 'a') {
					parent!.children.splice(index!, 1, transformNode({ imported, imports, relativePath }, node, 'href'));
				} else if (node.tagName === 'source') {
					parent!.children.splice(index!, 1, transformNode({ imported, imports, relativePath }, node, 'src'));
				}
			});


			if (imports.length) {
				ast.children.unshift({
					type: 'mdxjsEsm',
					value: '',
					data: {
						estree: {
							type: 'Program',
							sourceType: 'module',
							body: imports,
						},
					},
				});
			}
		};

export default rehypeMdxAssets;
