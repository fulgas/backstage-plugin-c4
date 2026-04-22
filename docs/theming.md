# C4 Plugin Theming

All diagram colours are CSS custom properties (`--c4-color-*`). The defaults ship in `c4Theme.css` (auto-imported by `@fulgas/plugin-c4-renderer-react`). Override any variable in your app CSS — no plugin changes required.

## Light and dark mode

The plugin reads Backstage's `[data-theme-mode]` attribute, which `UnifiedThemeProvider` sets automatically based on the active theme. React Flow's canvas additionally reads `palette.type` from the MUI theme to switch its own chrome (handles, minimap, controls panel).

Both light and dark defaults are included out of the box. You only need to override what differs from the defaults.

## CSS variable reference

| Variable                      | Default (light)          | Dark override         | Used for                                  |
| ----------------------------- | ------------------------ | --------------------- | ----------------------------------------- |
| `--c4-color-internal`         | `#1168bd`                | —                     | Internal system/container/component nodes |
| `--c4-color-external`         | `#999999`                | —                     | External system nodes                     |
| `--c4-color-person`           | `#08427b`                | —                     | Person nodes                              |
| `--c4-color-database`         | `#0b6e4f`                | —                     | Database nodes                            |
| `--c4-color-queue`            | `#1168bd`                | —                     | Queue nodes                               |
| `--c4-color-node-text`        | `#ffffff`                | —                     | Text on all coloured nodes                |
| `--c4-color-boundary-border`  | `#aaaaaa`                | —                     | Boundary box border                       |
| `--c4-color-boundary-bg`      | `rgba(255,255,255,0.55)` | `rgba(0,0,0,0.25)`    | Boundary box fill                         |
| `--c4-color-boundary-label`   | `#555555`                | `#aaaaaa`             | Boundary title text                       |
| `--c4-color-boundary-sep`     | `#cccccc`                | `#444444`             | Separator line inside boundary            |
| `--c4-color-boundary-resizer` | `#4444aa`                | —                     | Drag handle in edit mode                  |
| `--c4-color-edge`             | `#707070`                | —                     | Relationship lines                        |
| `--c4-color-edge-label`       | `#333333`                | `#dddddd`             | Relationship label text                   |
| `--c4-color-edge-label-bg`    | `rgba(255,255,255,0.85)` | `rgba(30,30,30,0.85)` | Relationship label background             |
| `--c4-color-active`           | `#1976d2`                | —                     | Active button / selected state            |
| `--c4-color-active-text`      | `#ffffff`                | —                     | Text on active/selected elements          |

> **Note:** `--c4-color-edge` controls the SVG stroke. The arrowhead marker colour is a separate constant (`COLOR_RELATIONSHIP` in `c4Style.ts`) because SVG `<marker>` elements don't reliably inherit CSS custom properties. To change arrowhead colour you'd need to fork `c4Style.ts`.

## Overriding defaults

Create a CSS file in your app and import it after the plugin (e.g. in `packages/app/src/App.tsx` via a side-effect import, or via your global stylesheet):

```css
/* packages/app/src/c4-theme-overrides.css */

/* Change all node colours to a brand palette */
:root {
  --c4-color-internal: #005eb8;
  --c4-color-person: #003d8f;
  --c4-color-database: #006644;
  --c4-color-active: #005eb8;
}
```

```ts
// packages/app/src/App.tsx
import './c4-theme-overrides.css';
```

## Separate light/dark overrides

Use the same selectors Backstage does:

```css
[data-theme-mode='light'] {
  --c4-color-internal: #005eb8;
  --c4-color-boundary-bg: rgba(240, 245, 255, 0.7);
}

[data-theme-mode='dark'] {
  --c4-color-internal: #4d9de0;
  --c4-color-boundary-bg: rgba(10, 20, 40, 0.4);
}
```

## Full dark theme example

The built-in dark overrides cover boundary and edge labels. If you want to adjust node colours for dark backgrounds as well:

```css
[data-theme-mode='dark'] {
  /* Softer node fills for dark backgrounds */
  --c4-color-internal: #4d9de0;
  --c4-color-external: #bbbbbb;
  --c4-color-person: #3a78c9;
  --c4-color-database: #2e9e6e;

  /* Boundary */
  --c4-color-boundary-bg: rgba(0, 0, 0, 0.35);
  --c4-color-boundary-label: #cccccc;
  --c4-color-boundary-sep: #555555;

  /* Edge labels */
  --c4-color-edge-label: #eeeeee;
  --c4-color-edge-label-bg: rgba(20, 20, 20, 0.9);
}
```
