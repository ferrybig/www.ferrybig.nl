'use client';
import Giscus from '@giscus/react';
import classes from './Comments.module.css';
import { useEffect, useState } from 'react';

function Comments() {
	const [baseUrl, setBaseUrl] = useState<string | null>(null);
	useEffect(() => {
		setBaseUrl(new URL('/giscus.css', window.location.href).href);
	}, []);
	return (
		<div className={classes.root}>
			{baseUrl && <Giscus
				repo="ferrybig/www.ferrybig.nl"
				repoId="R_kgDOHBif1g="
				category="Announcements"
				categoryId="DIC_kwDOHBif1s4CdpTo"
				mapping="pathname"
				strict="1"
				reactionsEnabled="1"
				inputPosition="bottom"
				theme={baseUrl}
				lang="en"
				loading="lazy"
			/>}
		</div>
	);
}
export default Comments;
