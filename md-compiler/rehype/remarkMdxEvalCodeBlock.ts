import jsx from 'acorn-jsx';
import { Parser } from 'acorn';
import { visit } from 'unist-util-visit';
import type { Plugin } from 'unified';

const parser = Parser.extend(jsx());

const javascriptLanguages = new Set(['js', 'jsx', 'javascript']);

export function remarkMdxEvalCodeBlock(): Plugin<[any], any, any> {
	return (tree) => {
		//console.log(JSON.stringify(tree, null, 4));
		visit(tree, 'code', (node, index, parent) => {
			const meta: string | undefined = node.meta;
			if (meta && (meta === 'eval' || meta.startsWith('eval ') || meta.endsWith(' eval') || meta.includes(' meta '))) {
				if (javascriptLanguages.has(node.lang)) {
					const program = parser.parse(node.value, {
						ecmaVersion: 2020,
						sourceType: 'module',
					});
					const output = {
						type: 'mdxFlowExpression',
						value: '',
						data: {
							estree: {
								type: 'Program',
								body: [
									{
										type: 'ExpressionStatement',
										expression: {
											type: 'CallExpression',
											callee: {
												type: 'ArrowFunctionExpression',
												id: null,
												expression: false,
												generator: false,
												async: false,
												params: [],
												body: {
													type: 'BlockStatement',
													body: [
														...program.body.slice(
															0,
															-1,
														),
														{
															type: 'ReturnStatement',
															argument:
															program.body.at(-1),
														},
													],
												},
											},
											arguments: [],
											optional: false,
										},
									},
								],
							},
						},
					};
					parent.children.splice(index, 1, output);
				} else if (node.lang === 'html') {
					const output = {
						type: 'mdxJsxFlowElement',
						name: 'HtmlPreview',
						attributes: [
							{
								'type': 'mdxJsxAttribute',
								'name': 'html',
								'value': node.value,
							},
						],
						'children': [],
					};
					parent.children.splice(index!+1, 0, output);
				}
			}
		});
	};
}
