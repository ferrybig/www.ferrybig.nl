import { h, render } from "preact";
import css from "./ui/style.css";
import { App } from "./ui/App.tsx";

/**
 * <geodata-range-coder></geodata-range-coder>
 *
 * Attributes (both optional):
 *   mode="encode" | "decode"   fixes the direction and hides the switch
 *   example="blog" | "spec"    fixes the chunk and hides the picker
 *
 * It draws inside a shadow root, so the page's CSS does not reach it. It
 * does follow the page's `color-scheme`, light or dark.
 */
class GeodataRangeCoder extends HTMLElement {
	private mount: HTMLDivElement | undefined;

	connectedCallback() {
		const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
		root.replaceChildren();
		const style = document.createElement("style");
		style.textContent = css;
		this.mount = document.createElement("div");
		root.append(style, this.mount);

		const mode = this.getAttribute("mode");
		const example = this.getAttribute("example");
		render(
			h(App, {
				...(mode === "encode" || mode === "decode" ? { mode } : {}),
				...(example ? { example } : {}),
			}),
			this.mount,
		);
	}

	disconnectedCallback() {
		if (this.mount) render(null, this.mount);
	}
}

if (!customElements.get("geodata-range-coder")) {
	customElements.define("geodata-range-coder", GeodataRangeCoder);
}
