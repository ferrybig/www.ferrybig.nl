import { ReactNode, JSX } from 'react';
import classes from './Heading.module.css';
import classNames from 'clsx';

interface Heading {
	level: 1 | 2 | 3 | 4 | 5 | 6;
	className?: string;
	id: string;
	title?: string;
	hidden?: boolean;
	padded?: boolean;
	children: ReactNode;
}
function Heading({ level, className, id, title, hidden, children, padded }: Heading) {
	const Tag = `h${level}` as keyof JSX.IntrinsicElements;
	return (
		<Tag
			className={classNames(className, id ? classes.withLink : classes.root, padded && classes.padded)}
			id={id}
			title={title}
			hidden={hidden}
		>
			{id && <a href={`#${id}`} aria-hidden tabIndex={-1}></a>}
			{children}
		</Tag>
	);
}
export default Heading;
export const Heading1 = (props: Omit<Heading, 'level'>) => <Heading level={1} {...props} />;
export const Heading2 = (props: Omit<Heading, 'level'>) => <Heading level={2} {...props} />;
export const Heading3 = (props: Omit<Heading, 'level'>) => <Heading level={3} {...props} />;
export const Heading4 = (props: Omit<Heading, 'level'>) => <Heading level={4} {...props} />;
export const Heading5 = (props: Omit<Heading, 'level'>) => <Heading level={5} {...props} />;
export const Heading6 = (props: Omit<Heading, 'level'>) => <Heading level={6} {...props} />;
