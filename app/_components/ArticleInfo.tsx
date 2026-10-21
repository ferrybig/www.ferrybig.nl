import type { MetaData } from '@/content';
import classes from './ArticleInfo.module.css';
import Date from './Date';
import Share from './Share';
import TagList from './TagList';
import { CONTENT_FOLDER, GIT_BRANCH } from '@/metadata';

interface ArticleInfo {
	slug: string,
	date: string | null,
	tags: string[],
	readingTimeMin: number,
	readingTimeMax: number,
	updatedAt: string | null,
	originalFile: string | null,
	feeds: boolean,
	coAuthors: MetaData['coAuthors'],
}
function ArticleInfo({
	date,
	tags,
	slug,
	readingTimeMin,
	readingTimeMax,
	updatedAt,
	originalFile,
	feeds,
	coAuthors,
}: ArticleInfo) {
	return (
		<div className={classes.root}>
			<h2 className={classes.title}>Article information</h2>
			{date && <p className={classes.listItem}>
				<strong>Published on:</strong>
				{' '}
				<Date timestamp={date}/>
			</p>}
			{updatedAt && <p className={classes.listItem}>
				<strong>Last update:</strong>
				{' '}
				<Date timestamp={updatedAt}/>
			</p>}
			{coAuthors.length > 0 && <p className={classes.listItem}>
				<strong>Co-author{coAuthors.length === 1 ? '' : 's'}:</strong>
				{' '}
				{coAuthors.map((coAuthor, index) => (
					<span key={coAuthor.name}>
						{index === 0 ? '' : ', '}
						{coAuthor.url
							? <a href={coAuthor.url}>{coAuthor.name}</a>
							: coAuthor.name}
					</span>
				))}
			</p>}
			<p className={classes.listItem}>
				<strong>Reading time:</strong>
				{' '}
				{readingTimeMin}{readingTimeMin !== readingTimeMax ? ` - ${readingTimeMax}` : ''}
				{' '}
				minute
				{readingTimeMax !== 1 ? 's' : ''}
			</p>
			<p className={classes.listItem}>
				<strong>Tools:</strong>
				{' '}
				<a href={`https://github.com/ferrybig/www.ferrybig.nl/commits/${GIT_BRANCH}${CONTENT_FOLDER}${originalFile}`}>View source</a>
				{' '}
				<a href={`https://github.com/ferrybig/www.ferrybig.nl/edit/${GIT_BRANCH}${CONTENT_FOLDER}${originalFile}`}>Suggest edit</a>
			</p>
			<p className={classes.listItem}>
				<Share slug={slug}/>
				{feeds && <>
					{' '}
					<a href={'feed.rss.xml'}>Subscribe</a>
				</>}
			</p>
			<TagList tags={tags}/>
		</div>
	);
}
export default ArticleInfo;
