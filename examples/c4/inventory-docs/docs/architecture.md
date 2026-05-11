# Architecture

## Container Diagram

Internal services that make up the Inventory system:

<!-- With mkdocs-macros-plugin: {{ c4_view('component-inventory-service') }} -->
<div data-c4-view-id="catalog-container-component-default-inventory-service" style="min-height:500px"></div>

## Design Decisions

| Decision                      | Rationale                                                                 |
| ----------------------------- | ------------------------------------------------------------------------- |
| Kafka for stock events        | Decouples replenishment from order processing; consumers can replay       |
| PostgreSQL for stock counts   | Strong consistency required for stock reservation under concurrent writes |
| Separate replenishment worker | Keeps inventory-service latency unaffected by slow supplier integrations  |
