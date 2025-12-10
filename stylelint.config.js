

/* global module */
module.exports = {
	'extends': [
		'stylelint-config-recommended',
		'stylelint-config-css-modules',
	],
	'rules': {
		'indentation': ['tab'],
		'no-descending-specificity': null,
		'selector-type-no-unknown': [
			true,
			{ ignoreTypes: ['code-preview']},
		],
	},
};
