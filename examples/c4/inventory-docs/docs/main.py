"""
mkdocs-macros-plugin definitions for embedding C4 diagrams.

Usage in Markdown:

  Embed all diagrams for an entity (tab strip to switch between levels):
    {{ c4_entity('system:default/ordering') }}
    {{ c4_entity('system:default/ordering', height=600) }}

  Embed a specific diagram by its view ID:
    {{ c4_view('catalog-container-component-default-inventory-service') }}
    {{ c4_view('catalog-container-component-default-inventory-service', height=600) }}

View ID format (catalog-generated views)
-----------------------------------------
  catalog-{viewType}-{kind}-{namespace}-{name}

  viewType  : landscape | context | container
  kind      : domain | system | component  (lowercased entity kind)
  namespace : the entity namespace (e.g. "default")
  name      : the entity metadata.name (underscores preserved)

  Examples:
    system:default/inventory         → catalog-context-system-default-inventory
    component:default/inventory_svc  → catalog-container-component-default-inventory-svc
    domain:default/retail            → catalog-landscape-domain-default-retail

  Tip: copy the view ID from the C4 Architecture page URL in Backstage
  (/c4/<namespace>/<kind>/<name>) — but note the ID uses hyphens, not slashes.

These expand to <div> placeholders that the C4DiagramAddon hydrates at
runtime in the Backstage TechDocs reader.
"""


def define_env(env):
    @env.macro
    def c4_entity(entity_ref: str, height: int = 480) -> str:
        return (
            f'<div data-c4-entity="{entity_ref}" '
            f'style="min-height:{height}px"></div>'
        )

    @env.macro
    def c4_view(view_id: str, height: int = 480) -> str:
        return (
            f'<div data-c4-view-id="{view_id}" '
            f'style="min-height:{height}px"></div>'
        )
