import type { StaticImageData } from 'next/image';
export type {StaticImageData} from 'next/image';

interface ImageLoader {
	src: StaticImageData;
	decoding?: 'sync' | 'async' | 'auto' | undefined;
    alt: string;
    width?: number | `${number}` | undefined;
    height?: number | `${number}` | undefined;
    loading?: 'eager' | 'lazy' | undefined;
	fetchPriority?: 'auto' | 'low' | 'high' | undefined;
	className?: string | undefined;
	id?: string | undefined;
	title?: string | undefined;
	blur?: boolean | undefined;
	hidden?: boolean | undefined;
}
function ImageLoader({
	src,
	decoding = 'async',
	alt,
	width,
	height,
	loading,
	fetchPriority,
	className,
	id,
	hidden,
	title = alt,
	blur = loading === 'lazy',
}: ImageLoader) {
	if (typeof src !== 'object') throw new Error('src must be a StaticImageData');
	return (
		<picture>
			{process.env.NODE_ENV !== 'development' && (src.src.endsWith('.png') || src.src.endsWith('.jpg')) && (
				<source
					srcSet={src.src.substring(0, src.src.length - 4) + '.avif'}
					type="image/avif"
				/>
			)}
			{/* eslint-disable-next-line react/forbid-elements */}
			<img
				src={src.src}
				style={blur && src.blurDataURL ? {background: `url('${src.blurDataURL}') 50% 50% / cover`} : undefined}
				decoding={decoding}
				alt={alt}
				width={width ?? (height ? Number.parseInt(`${height}`) / src.height * src.width : undefined) ?? src.width}
				height={height ?? (width ? Number.parseInt(`${width}`) / src.width * src.height : undefined) ?? src.height}
				loading={loading === 'eager' ? undefined : loading}
				fetchPriority={(fetchPriority === 'auto' ? undefined : fetchPriority) as NonNullable<typeof fetchPriority>}
				referrerPolicy="same-origin"
				className={className}
				id={id}
				title={title === '' ? undefined : title}
				hidden={hidden}
			/>
		</picture>
	);
}

export default ImageLoader;
