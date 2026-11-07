import type { ComponentChildren } from "preact";

/**
 * Shows `current` in a box that is as tall as the tallest of `all`.
 *
 * Text that changes with every step wraps onto a different number of lines,
 * and whatever is below it would jump up and down. Rather than guess a
 * height, every possible content is laid out invisibly in the same grid
 * cell, so the cell is always the size of the worst case at the current
 * width. The copies are hidden from assistive technology.
 */
export function Stable({ current, all }: { current: ComponentChildren; all: ComponentChildren[] }) {
	return (
		<div class="stable">
			<div class="stable-current">{current}</div>
			{all.map((content, i) => (
				<div key={i} class="stable-sizer" aria-hidden="true">
					{content}
				</div>
			))}
		</div>
	);
}
