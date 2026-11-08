import { animate } from "motion";
import { useEffect, useRef, useState } from "preact/hooks";

export function prefersReducedMotion(): boolean {
	return (
		typeof matchMedia === "function" &&
		matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

/**
 * Follows `target`, easing from wherever it currently is. A change that
 * arrives mid-flight starts from the value on screen, not from the old
 * target, so clicking fast never makes anything jump.
 */
export function useTweened(target: readonly number[], seconds: number): number[] {
	const [value, setValue] = useState<number[]>(() => [...target]);
	const shown = useRef<number[]>([...target]);
	const key = target.join(",");

	useEffect(() => {
		const to = [...target];
		const from = shown.current;
		if (seconds <= 0 || prefersReducedMotion() || from.length !== to.length) {
			shown.current = to;
			setValue(to);
			return;
		}
		const playback = animate(0, 1, {
			duration: seconds,
			ease: "easeInOut",
			onUpdate: (t: number) => {
				const next = to.map((end, i) => from[i]! + (end - from[i]!) * t);
				shown.current = next;
				setValue(next);
			},
		});
		return () => playback.stop();
		// `key` stands for the contents of `target`, which is a new array every render.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key, seconds]);

	return value;
}

/**
 * 0 to 1 over `seconds`, starting again whenever `restartKey` changes.
 * For things that replay on every step, such as an interval being cut.
 */
export function useReplay(restartKey: unknown, seconds: number): number {
	const [t, setT] = useState(1);
	useEffect(() => {
		if (seconds <= 0 || prefersReducedMotion()) {
			setT(1);
			return;
		}
		setT(0);
		const playback = animate(0, 1, {
			duration: seconds,
			ease: "easeInOut",
			onUpdate: setT,
		});
		return () => playback.stop();
	}, [restartKey, seconds]);
	return t;
}
