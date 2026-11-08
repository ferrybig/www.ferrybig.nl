import { dirname } from 'node:path/posix';
import { compile } from '@mdx-js/mdx';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypePrettyCode from 'rehype-pretty-code';
import remarkSmartypants from 'remark-smartypants';
import rehypeSlug from 'rehype-slug';
import { rehypeAccessibleEmojis } from 'rehype-accessible-emojis';
import setImageSize from '../rehype/rehypeImageSize.js';
import { remarkMdxEvalCodeBlock } from '../rehype/remarkMdxEvalCodeBlock.js';
import section from '@hbsnow/rehype-sectionize';
import rehypeMinifyWhitespace from 'rehype-minify-whitespace';
import rehypeMdxAssets from '../rehype/rehypeMdxAssets.js';

export async function compileMdx(inputFileName: string, outputFileName: string, content: string): Promise<string> {

	const vFile = await compile(
		content,
		{
			remarkPlugins: [
				[remarkMdxEvalCodeBlock],
				[remarkGfm],
				[remarkMath],
				[remarkSmartypants as any],
			],
			rehypePlugins: [
				[setImageSize, { dir: dirname(inputFileName) }],
				[rehypeMdxAssets, { inputFileName, outputFileName}],
				// MathML only: rendered by the browser, so no KaTeX css or fonts to ship
				[rehypeKatex, { output: 'mathml' }],
				[rehypePrettyCode as any, { theme: {
					dark: 'material-theme-darker',
					light: 'material-theme-lighter',
				}}],
				[rehypeSlug],
				[section as any, { properties: { className: undefined } }],
				[rehypeAccessibleEmojis],
				[rehypeMinifyWhitespace],
			//[rehypeTruncate, { maxChars: 200, disable: !truncated }],
			],
		},
	);
	const generatedCodeWithDefaultExport = String(vFile);
	const needle = 'export default function MDXContent';
	const exportDefaultIndex = generatedCodeWithDefaultExport.lastIndexOf(needle);
	if (exportDefaultIndex < 0) throw new Error('Trouble with file generation');
	const generatedCode = generatedCodeWithDefaultExport.substring(0, exportDefaultIndex).trimEnd();
	return generatedCode;
}
