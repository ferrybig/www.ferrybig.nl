import { h, render } from "preact";
import css from "./ui/style.css";
import { App } from "./ui/App.tsx";
import { RealApp } from "./ui/RealApp.tsx";

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

/**
 * <geodata-real-chunk></geodata-real-chunk>
 *
 * Chunk 207623 of the world file, decoded from its own bytes. Decoding it
 * takes a moment, so nothing is drawn until the element is close to the
 * screen. Until then it reserves the height of the finished view.
 */
class GeodataRealChunk extends HTMLElement {
	private mount: HTMLDivElement | undefined;
	private watcher: IntersectionObserver | undefined;

	connectedCallback() {
		const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
		root.replaceChildren();
		const style = document.createElement("style");
		style.textContent = css;
		this.mount = document.createElement("div");
		root.append(style, this.mount);

		const start = () => this.mount && render(h(RealApp, {}), this.mount);
		if (typeof IntersectionObserver !== "function") return start();
		this.watcher = new IntersectionObserver(
			(entries) => {
				if (!entries.some((e) => e.isIntersecting)) return;
				this.watcher?.disconnect();
				start();
			},
			{ rootMargin: "1200px 0px" },
		);
		this.watcher.observe(this);
		// Not drawn yet, but as tall as the drawn view will be.
		render(h("div", { class: "sim real placeholder" }), this.mount);
	}

	disconnectedCallback() {
		this.watcher?.disconnect();
		if (this.mount) render(null, this.mount);
	}
}

if (!customElements.get("geodata-real-chunk")) {
	customElements.define("geodata-real-chunk", GeodataRealChunk);
}
