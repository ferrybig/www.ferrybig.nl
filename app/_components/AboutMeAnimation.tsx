'use client';
import { useEffect, useReducer } from 'react';

const roles = [
	['a ', 'full-stack', ' developer!'],
	['a ', 'full-stack', ' creator!'],
	['a ', 'full-stack', ' programmer!'],
	['a ', 'full-stack', ' expert!'],
	['an ', 'all-round', ' developer!'],
	['an ', 'all-round', ' programmer!'],
	['a ', '3D model', ' designer!'],
	['a ', 'white-hat', ' hacker!'],
	['a ', 'programming', ' geek!'],
	['a ', 'programming', ' nerd!'],
	['an ', 'awesome', ' person!'],
	['an ', 'great', ' person!'],
	['I\'m ', 'the best', ' developer!'],
	['I\'m ', 'the best', '.'],
	['$ a ', 'shell', ' geek!'],
	['a ', 'Linux', ' expert!'],
	['an ', 'IPv6', ' expert!'],
	['an ', 'IPv4', ' expert!'],
	['a ', 'NGINX', ' expert!'],
	['a ', 'Devops', ' engineer!'],
	['a ', 'Devops', ' expert!'],
	['a ', 'React', ' programmer!'],
	['a ', 'React', ' teacher!'],
	['a ', 'React', ' expert!'],
	['a ', 'NextJS', ' programmer!'],
	['a ', 'NextJS', ' teacher!'],
	['a ', 'NextJS', ' expert!'],
	['a ', 'Redux', ' programmer!'],
	['a ', 'Redux', ' teacher!'],
	['a ', 'Redux', ' expert!'],
	['an ', 'electronics', ' expert!'],
	['an ', 'electronics', ' engineer!'],
	['a ', 'TypeScript', ' programmer!'],
	['a ', 'TypeScript', ' hacker!'],
	['a ', 'TypeScript', ' expert!'],
	['a ', 'JavaScript', ' programmer!'],
	['a ', 'JavaScript', ' hacker!'],
	['a ', 'JavaScript', ' expert!'],
	['a ', 'Java', ' programmer!'],
	['a ', 'Java', ' hacker!'],
	['a ', 'Java', ' expert!'],
	['an ', 'CSS animation', ' expert!'],
	['an ', 'CSS animation', ' programmer!'],
	['a ', 'HTML5', ' programmer!'],
	['a ', 'HTML5', ' expert!'],
	['a ', 'Webpack', ' hacker!'],
	['a ', 'MDN', ' contributor!'],
	['a ', 'StackOverflow', ' contributor!'],
	['a ', 'StackOverflow', ' hacker!'],
	['a ', 'coding', ' teacher!'],
	['an ', 'open source', ' believer!'],
	['an ', 'open source', ' hacker!'],
	['an ', 'open source', ' creator!'],
	['an ', 'open source', ' builder!'],
	['a ', 'Web designer', '!'],
	['a ', 'Web developer', ' !'],
	['an ', 'experienced', ' Developer!'],
];
interface State {
	textParts: string[];
	index: number;
}
type Action = { type: 'next'; random: number } | { type: 'tick' };

function reducer(state: State, action: Action) {
	switch (action.type) {
	case 'next': {
		return {
			textParts: roles[Math.floor(action.random * roles.length)],
			index: 0,
		};
	}
	case 'tick': {
		const newIndex = state.index + 1;
		return {
			...state,
			index: newIndex,
		};
	}
	}
}
const initialState: State = {
	textParts: roles[0],
	index: roles[0].reduce((a, b) => a + b.length, 0),
};

interface AboutMeAnimation {
	linkClassName: string;
}
function AboutMeAnimation({ linkClassName }: AboutMeAnimation) {
	const [state, dispatch] = useReducer(reducer, initialState);
	const playing = state.index < state.textParts.reduce((a, b) => a + b.length, 0);
	useEffect(() => {
		if (playing) {
			const interval = setInterval(() => {
				dispatch({ type: 'tick' });
			}, 100);
			return () => clearInterval(interval);
		}
	}, [playing]);
	const next = () => {
		dispatch({ type: 'next', random: Math.random() });
	};
	const children = [];
	let remainingIndex = state.index;
	for (let i = 0; i < state.textParts.length; i++) {
		const part = state.textParts[i];
		const text = part.slice(0, remainingIndex);
		if (i == 1) {
			children.push(
				<span
					key={i}
					className={linkClassName}
					role="button"
					tabIndex={-1}
					onClick={next}
				>
					{text}
				</span>,
			);
		} else {
			children.push(text);
		}
		remainingIndex = Math.max(0, remainingIndex - part.length);
	}
	if (state.index === 0) {
		children.push('\xa0');
	}
	return children;
}
export default AboutMeAnimation;
