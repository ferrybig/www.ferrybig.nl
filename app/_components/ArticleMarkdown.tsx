import Link from 'next/link';
import { type ComponentType, useMemo } from 'react';
import Image from '@/_components/Image';
import type { MetaData } from '@/content';
import classes from './ArticleMarkdown.module.css';
import Heading from './Heading';
import HtmlPreview from './HtmlPreview';

function isRelative(href: string): boolean {
	return !/^(?:[a-z]+:)?\/\//i.test(href);
}

type Components = Record<string, ComponentType<any>>;
type NeededMetadata = Pick<MetaData, 'thumbnail'>;
function makeComponents({ thumbnail }: NeededMetadata): Components {
	const components: Components = new Proxy(
		{},
		{
			get(target, prop) {
				return prop in target ? (target as any)[prop] : prop;
			},
		},
	);
	function define(name: string, factory: ComponentType<any>) {
		components[name] = factory;
	}
	function compose(
		name: string,
		factory: (Base: ComponentType<any>) => ComponentType<any>,
	) {
		components[name] = factory(components[name]);
	}

	define('img', function ImageComponent(props) {
		return (
			<Image
				{...props}
				alt={props.alt ?? ''}
				width={props.width ? Number(props.width) : undefined}
				height={props.height ? Number(props.height) : undefined}
				loading="lazy"
			/>
		);
	});
	define('a', function LinkComponent(props) {
		return props.href && isRelative(props.href) ? (
			<Link {...props} href={props.href ?? ''} />
		) : (
			<a {...props} />
		);
	});
	define('h1', function H1Component(props) {
		return <Heading level={1} {...props} />;
	});
	define('h2', function H2Component(props) {
		return <Heading level={2} {...props} />;
	});
	define('h3', function H3Component(props) {
		return <Heading level={3} {...props} />;
	});
	define('h4', function H4Component(props) {
		return <Heading level={4} {...props} />;
	});
	define('h5', function H5Component(props) {
		return <Heading level={5} {...props} />;
	});
	define('h6', function H6Component(props) {
		return <Heading level={6} {...props} />;
	});
	define('HtmlPreview', HtmlPreview);

	compose(
		'h1',
		(Base) =>
			function H1WithThumbnail(props) {
				return (
					<>
						{thumbnail ? (
							thumbnail.link ? (
								<a
									href={thumbnail.link}
									className={classes.hero}
									style={{
										backgroundImage: `url('${thumbnail.image.blurDataURL}`,
									}}
								>
									<Image
										src={thumbnail.image}
										width={939}
										height={528}
										alt={thumbnail.alt ?? ''}
										decoding="sync"
										fetchPriority="high"
									/>
									{thumbnail.caption && (
										<span className={classes.caption}>{thumbnail.caption}</span>
									)}
								</a>
							) : (
								<div
									className={classes.hero}
									style={{
										backgroundImage: `url('${thumbnail.image.blurDataURL}')`,
									}}
								>
									<Image
										src={thumbnail.image}
										width={939}
										height={528}
										alt={thumbnail.alt ?? ''}
										decoding="sync"
										fetchPriority="high"
									/>
								</div>
							)
						) : null}
						<Base {...props} />
					</>
				);
			},
	);
	return components;
}

interface ArticleMarkdown {
	factory: (props: { components: Components }) => any;
	metadata: NeededMetadata;
}

function ArticleMarkdown({
	factory,
	metadata: { thumbnail },
}: ArticleMarkdown) {
	const components = useMemo(() => makeComponents({ thumbnail }), [thumbnail]);
	return factory({ components });
}

export default ArticleMarkdown;
