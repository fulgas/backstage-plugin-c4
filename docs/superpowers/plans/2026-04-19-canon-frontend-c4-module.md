# Canon Migration — plugin-c4-module Extensions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace MUI Grid/Typography/makeStyles in plugin-c4-module extensions with @backstage/canon Flex/Box/Text.

**Prerequisite:** None (adds @backstage/canon dep to plugin-c4-module).

---

## Task 1: Add canon dep + update C4PageExtension.tsx

- [ ] Step 1: Add `"@backstage/canon": "^0.6.0"` to the `dependencies` section of `plugins/c4-module/package.json`, then run `yarn install` to resolve and lock the new dependency.
- [ ] Step 2: Read `plugins/c4-module/src/extensions/C4PageExtension.tsx` in full to confirm the exact Blueprint API call used (`PageBlueprint.make`, `createPageExtension`, or other) and note any imports or logic that must be preserved verbatim.
- [ ] Step 3: Replace `plugins/c4-module/src/extensions/C4PageExtension.tsx` — keep the existing Blueprint.make call exactly as confirmed in Step 2; replace all MUI layout/typography (makeStyles, Grid, Typography) with canon equivalents (`Flex`, `Box`, `Text`) as shown in the target above. Update the import block accordingly (remove `@material-ui/core` imports, add `import { Box, Flex, Text } from '@backstage/canon'`).
- [ ] Step 4: Run `yarn workspace @fulgas/plugin-c4-module test --testPathPattern=C4PageExtension --no-coverage` — expect PASS.

## Task 2: Update EntityC4CardExtension.tsx

- [ ] Step 1: Read `plugins/c4-module/src/extensions/EntityC4CardExtension.tsx` in full to confirm the exact Blueprint API call used (`EntityCardBlueprint.make`, `createEntityCardExtension`, or other) and note any imports or logic that must be preserved verbatim.
- [ ] Step 2: Replace `plugins/c4-module/src/extensions/EntityC4CardExtension.tsx` — keep the Blueprint.make call exactly as confirmed in Step 1; replace `Typography` with `Text` from `@backstage/canon` (remove the `Typography` import from `@material-ui/core`, add `import { Text } from '@backstage/canon'`, update all `<Typography ...>` JSX to `<Text variant="body">`).
- [ ] Step 3: Run `yarn workspace @fulgas/plugin-c4-module test --no-coverage` — expect PASS (full suite for the package).
- [ ] Step 4: Run `yarn workspace @fulgas/plugin-c4-module tsc --noEmit` — expect no type errors.
