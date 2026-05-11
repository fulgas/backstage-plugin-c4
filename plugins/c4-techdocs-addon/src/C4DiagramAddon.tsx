import {
  createTechDocsAddonExtension,
  TechDocsAddonLocations,
  useTechDocsReaderPage,
} from '@backstage/plugin-techdocs-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { C4DiagramEmbed } from './C4DiagramEmbed';
import { c4TechDocsAddonPlugin } from './plugin';

/**
 * TechDocs addon that hydrates `data-c4-entity` and `data-c4-view-id` placeholder
 * elements embedded in documentation pages.
 *
 * Register once in `app.tsx`:
 * ```tsx
 * <TechDocsAddons>
 *   <C4DiagramAddon />
 * </TechDocsAddons>
 * ```
 *
 * Then in any docs Markdown file authors add one of:
 *
 * ```html
 * <!-- All diagrams for an entity (tab strip to switch between levels) -->
 * <div data-c4-entity="system:default/inventory" style="min-height:500px"></div>
 *
 * <!-- A specific diagram by its view ID -->
 * <div data-c4-view-id="catalog-container-component-default-inventory-service" style="min-height:500px"></div>
 * ```
 *
 * ## View ID format (catalog-generated views)
 *
 * `catalog-{viewType}-{kind}-{namespace}-{name}`
 *
 * | Part        | Values                                |
 * |-------------|---------------------------------------|
 * | `viewType`  | `landscape` · `context` · `container` |
 * | `kind`      | `domain` · `system` · `component`    |
 * | `namespace` | entity namespace, e.g. `default`     |
 * | `name`      | entity `metadata.name`                |
 *
 * Examples:
 * - `system:default/inventory`            → `catalog-context-system-default-inventory`
 * - `component:default/inventory-service` → `catalog-container-component-default-inventory-service`
 *
 * Tip: find the view ID on the C4 Architecture page — it appears in the URL after `/c4/`.
 */
export const C4DiagramAddon = c4TechDocsAddonPlugin.provide(
  createTechDocsAddonExtension({
    name: 'C4DiagramAddon',
    location: TechDocsAddonLocations.Content,
    component: C4DiagramAddonImpl,
  }),
);

export function C4DiagramAddonImpl(): JSX.Element | null {
  const entityEls = useShadowElements<HTMLDivElement>('[data-c4-entity]');
  const viewEls = useShadowElements<HTMLDivElement>('[data-c4-view-id]');

  if (!entityEls.length && !viewEls.length) return null;

  return (
    <>
      {entityEls.map((el, i) => {
        const entityRef = el.getAttribute('data-c4-entity');
        if (!entityRef) return null;
        const height = el.style.minHeight
          ? parseInt(el.style.minHeight, 10) || 480
          : 480;
        return createPortal(
          <C4DiagramEmbed entityRef={entityRef} height={height} />,
          el,
          `c4-entity-${i}`,
        );
      })}
      {viewEls.map((el, i) => {
        const viewId = el.getAttribute('data-c4-view-id');
        if (!viewId) return null;
        const height = el.style.minHeight
          ? parseInt(el.style.minHeight, 10) || 480
          : 480;
        return createPortal(
          <C4DiagramEmbed viewId={viewId} height={height} />,
          el,
          `c4-view-${i}`,
        );
      })}
    </>
  );
}

/**
 * Replacement for `useShadowRootElements` that fixes the stale-root bug:
 * Backstage's implementation initialises `root` via `useState(shadowRoot?.firstChild)`,
 * so when `shadowRoot` transitions undefined → ShadowRoot the MutationObserver is set
 * up but `root` is never refreshed synchronously — any pre-existing DOM nodes are missed.
 *
 * This hook calls `scan()` immediately inside the `useEffect` so elements that are
 * already present when the shadow root becomes available are always detected.
 */
function useShadowElements<T extends HTMLElement>(selector: string): T[] {
  const { shadowRoot } = useTechDocsReaderPage();
  const [elements, setElements] = useState<T[]>([]);

  useEffect(() => {
    if (!shadowRoot) return;

    const scan = () => {
      setElements(Array.from(shadowRoot.querySelectorAll<T>(selector)));
    };

    scan(); // immediate scan — fixes the stale-root bug in useShadowRootElements

    const observer = new MutationObserver(scan);
    observer.observe(shadowRoot, {
      attributes: true,
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [shadowRoot, selector]);

  return elements;
}
