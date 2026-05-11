# Inventory System

The Inventory system tracks stock levels, warehouse locations, and
replenishment across the fulfillment domain.

## System Context

All external actors and systems that interact with Inventory:

<!-- Raw HTML — works without mkdocs-macros-plugin.
     With mkdocs-macros-plugin this can be written as:
     {{ c4_entity('system:default/inventory') }} -->
<div data-c4-entity="system:default/inventory" style="min-height:500px"></div>

## Key Responsibilities

- Expose stock levels and reservation endpoints via `inventory-api`
- Trigger replenishment purchase orders when stock falls below threshold
- Publish stock-changed events to downstream systems via Kafka
