# Torque website

This directory contains Torque’s independent marketing and documentation website. It is a static Vite app and does not start or depend on the Tauri shell or Rust torrent engine. Product previews use clearly labeled illustrative data; download links point to the real GitHub Releases page.

## Stack

- React 19 and TypeScript
- Vite 8 with Tailwind CSS 4’s Vite integration and a small custom design system
- React Router for clean routes
- Lucide icons and locally bundled Inter Variable

## Requirements

- Node.js 22.12 or newer
- npm (included with Node.js)

## Run locally

From this directory:

```sh
npm ci
npm run dev
```

Vite serves the website at `http://127.0.0.1:5173`. `npm ci` installs the versions recorded in `package-lock.json`. If you do not need an exact lockfile install, `npm install` is also supported.

## Type check and production build

```sh
npm run typecheck
npm run build
npm run preview
```

The production website is written to `dist/`. Vite’s preview server serves the built site locally. Configure your static host to route unknown paths to `/index.html` so links to clean React Router paths work on direct visits and refreshes. A Netlify `_redirects` file is included in `public/`.

The site does not require a desktop compiler, native libraries, environment variables, or a backend service.

## Pages and structure

```text
frontend/
  public/                 App favicon, web manifest, social graphic, robots.txt, host redirects
  src/
    components/
      docs/                Documentation search, navigation, articles, and code blocks
      layout/              Header, footer, theme, route metadata
      marketing/           Interactive, labeled product-interface previews
      ui/                  Section headings and reduced-motion-aware reveal behavior
    content/docs.ts        Data-driven documentation guide catalog and article content
    lib/site.ts            Site links, route slugs, and formatting helpers
    pages/                 Home, features, downloads, changelog, about, and docs routes
    styles.css             Dark/light tokens, application previews, docs, responsive layouts
  index.html                Metadata, icon references, and theme flash prevention
  package.json              Independent website scripts and dependencies
  package-lock.json         Reproducible npm dependency lock
  vite.config.ts            React and Tailwind CSS Vite plugins
```

The documentation catalog is maintained in `src/content/docs.ts`; add an article there to include it in the searchable sidebar, documentation index, previous/next sequence, and route-specific page metadata. Keep website claims aligned with features documented in the repository README. The illustrative app windows and sample search results are intentionally marked as examples and are not connected to the live torrent engine.

## Deployment

Deploy the contents of `dist/` to any static host that supports an SPA fallback. `public/_redirects` supports Netlify; on other hosts configure a rewrite from route requests to `/index.html`. The canonical URL is derived from the served origin, so publish on the preferred domain rather than a temporary preview hostname.

The site declares a per-page title and description, canonical and Open Graph URL at runtime, a local app icon, web manifest, social image, and `robots.txt`. It is client-rendered: social crawlers that do not execute JavaScript receive the shared default metadata from `index.html`.
