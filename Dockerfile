# syntax=docker/dockerfile:1
FROM node:24-alpine AS node-base

FROM node-base AS timestamps
RUN apk add --no-cache git bash
COPY /timestamps-from-git.sh /app/timestamps-from-git.sh
COPY /.git /app/.git
RUN cd /app && /app/timestamps-from-git.sh '.md' > timestamps.txt

FROM node-base AS md-compiler-deps
COPY /md-compiler/package.json /md-compiler/package-lock.json /app/md-compiler/
RUN cd /app/md-compiler && npm ci --ignore-scripts

FROM md-compiler-deps AS md-compiler-build
COPY /md-compiler /app/md-compiler/
RUN cd /app/md-compiler && npm run compiler-build

FROM md-compiler-deps AS md-compiler
COPY --from=md-compiler-build /app/md-compiler/out /app/md-compiler/out
COPY /content /app/content
COPY /app /app/app
COPY --from=timestamps /app/timestamps.txt /app/timestamps.txt
RUN cd /app/md-compiler && ls -l /app/timestamps.txt && npm run compiler-run

FROM node-base AS deps
COPY /package.json /package-lock.json /app/
RUN cd /app && npm ci --ignore-scripts

FROM deps AS build-env
COPY /public /app/public
COPY /content /app/content
COPY /assets /app/assets
COPY /md-compiler /app/md-compiler
COPY next.config.mjs postcss.config.cjs postcssLightDarkPolyfill.cjs tsconfig.json eslint.config.mjs next-env.d.ts package.json /app/
COPY --from=md-compiler /app/app /app/app

FROM build-env AS build
RUN cd /app && npm run lint && npm run tsc
RUN --mount=type=cache,target=/app/.next/cache cd /app && IGNORE_ERRORS=true npm run build-frontend


FROM node-base AS compressor
RUN apk add --no-cache brotli libavif-apps
COPY --from=build /app/out /srv
RUN cd /srv \
&& find . -type f -not -name 'sha1sums' -exec sha1sum {} + > /srv/sha1sums \
&& find /srv -type f \( -name '*.png' -o -name '*.jpg' \) -print0 \
| xargs -0 sh -c 'for d; do avifenc -- "$d" "${d%.*}.avif"; done' 'sh' \
&& find /srv -type f \
	\( \
		-name '*.png' -o \
		-name '*.jpg' -o \
		-name '*.jpeg' -o \
		-name '*.bmp' -o \
		-name '*.tif' -o \
		-name '*.txt' -o \
		-name '*.html' -o \
		-name '*.js' -o \
		-name '*.map' -o \
		-name '*.css' -o \
		-name '*.json' -o \
		-name '*.xml' -o \
		-name '*.stl' \
	\) -size +512c \
	-print0 \
| xargs -0 brotli --best -k -s --


FROM scratch AS export
COPY --from=compressor /srv /


FROM caddy:2.8 AS server
EXPOSE 2999
COPY <<Caddyfile /etc/caddy/Caddyfile
{
	servers {
		trusted_proxies static private_ranges
		enable_full_duplex
	}
	admin off
	log default {
		format console
	}
}

:2999 {
	root * /srv
	file_server {
		precompressed br
	}
	try_files {path}.html
	header Content-Security-Policy "default-src 'self' analytics.ferrybig.nl;script-src 'self' 'unsafe-eval' 'unsafe-inline';style-src 'self' 'unsafe-inline';img-src 'self' blob: data:;font-src 'self';object-src 'none';base-uri 'self';frame-src 'self' projects.ferrybig.nl giscus.app;form-action 'self';frame-ancestors 'none';block-all-mixed-content;"
	header /giscus.css access-control-allow-origin https://giscus.app
	header /_next/static/* Cache-Control max-age=31536000
	handle_errors {
		@404-410 `{err.status_code} in [404, 410]`
		handle @404-410 {
			rewrite * /404.html
		}
	}
}
Caddyfile
COPY --from=compressor /srv /srv
