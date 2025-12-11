'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import setupGoatCounter from './Analytics.goatcounter';
//import { useReportWebVitals } from 'next/web-vitals';

export function Analytics() {
	const path = usePathname();
	const goatcounter = useRef<ReturnType<typeof setupGoatCounter>>(undefined);
	useEffect(() => {
		if (!goatcounter.current) {
			goatcounter.current = setupGoatCounter({
				endpoint: 'https://analytics.ferrybig.nl/count',
				no_onload: true,
				allow_local: true,
			});
			goatcounter.current.bind_events();
		}
		const referrer = sessionStorage.getItem('referrer') ?? document.referrer;
		sessionStorage.setItem('referrer', new URL(path, location.href).href);
		goatcounter.current.count({
			path,
			referrer,
		});
	}, [path]);
	/*
	useReportWebVitals((metric) => {
		scheduleEvent({
			path,
			event: true,
			title: metric.name,
		});
	});
	*/
	return null;
}
