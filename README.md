# Iceberg V4 · Eos prototype

Standalone UX prototype of the Iceberg CMS authoring interface rebuilt on the
Eos design system. It uses illustrative data only; there is no backend,
authentication, or persistence beyond browser state.

Live: https://sebastianvidalnbc.github.io/iceberg-v5-prototype/

## Local development

Requires Node.js 22.

```bash
npm ci
npm run dev
```

Vite serves the app at
`http://localhost:5173/iceberg-v5-prototype/`.

```bash
npm run typecheck
npm run build
npm run preview
```

## Application

Source lives in `src/v4-eos/`. The main authoring app uses Eos styling, while
`src/v4-eos/renderer/` is an isolated Peacock customer preview loaded in an
iframe.

Primary hash routes:

- `#/home`
- `#/pages`
- `#/widgets`
- `#/content-pages`
- `#/design-system`

Pushes to `main` are checked, built, and deployed to GitHub Pages by
`.github/workflows/deploy-pages.yml`.

See `docs/CURRENT-PROGRESS.md`, `docs/eos-design-system.md`, and
`AUTHOR-EFFICIENCY.md` before changing the authoring experience.
