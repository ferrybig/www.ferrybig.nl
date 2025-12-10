import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import reactPlugin from 'eslint-plugin-react';
import reactCompilerPlugin from 'eslint-plugin-react-compiler';
import nextPlugin from '@next/eslint-plugin-next';

export default [
	eslint.configs.recommended,
	{
		ignores: ['out/**', 'app/*.js', 'md-compiler/out/**', '.next/**'],
	},
	{
		files: ['**/*.{js,jsx,ts,tsx,mjs}'],
		languageOptions: {
			parser: tsparser,
			parserOptions: {
				ecmaVersion: 'latest',
				sourceType: 'module',
				ecmaFeatures: {
					jsx: true,
				},
			},
			globals: {
				console: 'readonly',
				process: 'readonly',
				URLSearchParams: 'readonly',
				URL: 'readonly',
				Buffer: 'readonly',
				__dirname: 'readonly',
				__filename: 'readonly',
				module: 'readonly',
				require: 'readonly',
				exports: 'readonly',
				global: 'readonly',
				window: 'readonly',
				document: 'readonly',
				navigator: 'readonly',
				fetch: 'readonly',
				setInterval: 'readonly',
				clearInterval: 'readonly',
				setTimeout: 'readonly',
				clearTimeout: 'readonly',
				sessionStorage: 'readonly',
				localStorage: 'readonly',
				location: 'readonly',
				addEventListener: 'readonly',
				removeEventListener: 'readonly',
				IntersectionObserver: 'readonly',
				Element: 'readonly',
				HTMLDivElement: 'readonly',
				ShadowRoot: 'readonly',
				Response: 'readonly',
				React: 'readonly',
				JSX: 'readonly',
			},
		},
		plugins: {
			'@typescript-eslint': tseslint,
			'react': reactPlugin,
			'react-compiler': reactCompilerPlugin,
			'@next/next': nextPlugin,
		},
		settings: {
			react: {
				pragma: 'React',
				version: '17.0',
			},
		},
		rules: {
			...reactPlugin.configs.recommended.rules,
			...reactPlugin.configs['jsx-runtime'].rules,
			...nextPlugin.configs.recommended.rules,
			...nextPlugin.configs['core-web-vitals'].rules,
			...tseslint.configs.recommended.rules,

			'no-redeclare': 'off',
			'react-compiler/react-compiler': 'error',
			'no-shadow': 'off',
			'@typescript-eslint/no-shadow': 'error',
			'no-use-before-define': 'off',
			'@typescript-eslint/no-use-before-define': 'error',
			'react/jsx-filename-extension': ['warn', { extensions: ['.tsx'] }],
			'react/jsx-key': 'off',
			'quotes': ['warn', 'single'],
			'indent': ['warn', 'tab', { flatTernaryExpressions: true }],
			'react/forbid-component-props': ['error', { forbid: ['key'] }],
			'@typescript-eslint/no-explicit-any': 'off',
			'semi': ['warn', 'always'],
			'no-trailing-spaces': 'warn',
			'comma-dangle': ['warn', 'always-multiline'],
			'space-before-blocks': ['warn', 'always'],
			'keyword-spacing': ['warn', { before: true, after: true }],
			'jsx-quotes': ['warn', 'prefer-double'],
			'@next/next/no-img-element': 'off',
			'react/forbid-elements': ['error', { forbid: ['img'] }],
			'@typescript-eslint/no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: 'next/image',
							message: 'Please change the import to `@/_components/Image`',
							allowTypeImports: true,
						},
					],
				},
			],
		},
	},
];
