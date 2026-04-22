import { resolvePackagePath } from '@backstage/backend-plugin-api';
import { Knex } from 'knex';
import {
  C4Actor,
  C4Diagram,
  C4DiagramLevel,
  C4Model,
  C4Node,
  C4Relationship,
  C4Source,
  C4ViewDescriptor,
  C4ViewDisplaySettings,
} from '../types';

/**
 * Primary data store for the C4 backend plugin.
 *
 * Pure DB adapter: handles all reads/writes and on-demand diagram computation.
 * Caching is handled at the router level via Backstage CacheService.
 */
export class ModelStore {
  constructor(private readonly db: Knex) {}

  /** Run pending DB migrations. Must be called once at plugin startup before any other method. */
  async migrate(): Promise<void> {
    await this.db.migrate.latest({
      directory: resolvePackagePath(
        '@fulgas/plugin-c4-backend',
        'src/store/migrations',
      ),
      loadExtensions: ['.ts', '.js'],
    });
  }

  /**
   * Persist a C4Model produced by a sync provider.
   *
   * Replaces all previously stored nodes, actors, and relationships for the given `source`.
   */
  async saveModel(model: C4Model, source: C4Source): Promise<void> {
    await this.db.transaction(async trx => {
      await trx('c4_nodes').where({ source }).delete();
      await trx('c4_actors').where({ source }).delete();
      await trx('c4_relationships').where({ source }).delete();

      for (const n of model.nodes) {
        await trx('c4_nodes').insert({
          id: n.id,
          parent_id: n.parentId ?? null,
          depth: n.depth,
          name: n.name,
          description: n.description,
          technology: n.technology ?? null,
          sub_type: n.subType ?? null,
          navigable: n.navigable ? 1 : 0,
          tags: JSON.stringify(n.tags),
          catalog_entity_ref: n.catalogEntityRef ?? null,
          source,
        });
      }

      for (const a of model.actors) {
        await trx('c4_actors').insert({
          id: a.id,
          name: a.name,
          description: a.description,
          tags: JSON.stringify(a.tags),
          catalog_entity_ref: a.catalogEntityRef ?? null,
          source,
        });
      }

      for (const r of model.relationships) {
        await trx('c4_relationships').insert({
          id: r.id,
          source_id: r.sourceId,
          target_id: r.targetId,
          description: r.description,
          technology: r.technology ?? null,
          tags: JSON.stringify(r.tags),
          source,
        });
      }
    });
  }

  /** Persist view descriptors produced by a sync provider. Replaces all previously stored descriptors for the given `source`. */
  async saveViewDescriptors(
    descriptors: C4ViewDescriptor[],
    source: C4Source,
  ): Promise<void> {
    await this.db.transaction(async trx => {
      const oldRows = await trx('c4_view_descriptors')
        .where({ source })
        .select('id');
      const oldIds: string[] = oldRows.map((r: any) => r.id);

      await trx('c4_view_descriptors').where({ source }).delete();

      if (oldIds.length > 0) {
        await trx('c4_node_positions').whereIn('view_id', oldIds).delete();
      }

      for (const d of descriptors) {
        await trx('c4_view_descriptors').insert({
          id: d.id,
          title: d.title,
          subject_id: d.subjectId,
          entity_ref: d.entityRef ?? null,
          source,
        });
      }
    });
  }

  private descriptorQuery() {
    const subcompSub = this.db('c4_nodes')
      .where('depth', 3)
      .select('parent_id')
      .groupBy('parent_id');
    return this.db('c4_view_descriptors as vd')
      .leftJoin('c4_nodes as n', 'vd.subject_id', 'n.id')
      .leftJoin('c4_nodes as pn', 'pn.id', 'n.parent_id')
      .leftJoin('c4_view_settings as vs', 'vd.id', 'vs.view_id')
      .leftJoin(subcompSub.as('sc'), 'sc.parent_id', 'vd.subject_id')
      .select(
        'vd.*',
        'n.depth as subject_depth',
        'pn.name as parent_title',
        'pn.catalog_entity_ref as parent_entity_ref',
        'vs.settings as display_settings',
        this.db.raw(
          'CASE WHEN sc.parent_id IS NOT NULL THEN 1 ELSE 0 END as has_subcomponents',
        ),
      );
  }

  /** Return all view descriptors, optionally filtered by owning Backstage entity ref. */
  async getViewDescriptors(opts?: {
    entityRef?: string;
  }): Promise<C4ViewDescriptor[]> {
    let query = this.descriptorQuery();
    if (opts?.entityRef)
      query = query.where({ 'vd.entity_ref': opts.entityRef });
    const rows = await query;
    return rows.map(this.rowToDescriptor);
  }

  /** Return a single descriptor by ID, or `undefined` if not found. */
  async getViewDescriptor(id: string): Promise<C4ViewDescriptor | undefined> {
    const row = await this.descriptorQuery().where({ 'vd.id': id }).first();
    return row ? this.rowToDescriptor(row) : undefined;
  }

  /**
   * Compute a fully resolved `C4Diagram` on demand from the node tree.
   *
   * Returns `undefined` if the descriptor or subject node does not exist.
   *
   * Rules by subject depth:
   * - **0 (domain)** → internal = direct child systems; external = connected nodes/actors outside the domain
   * - **1 (system)** → internal = direct child containers; external = connected nodes/actors outside the system
   * - **2 (container)** → internal = the subject itself (or depth-3 subcomponents if present)
   */
  async computeDiagram(viewId: string): Promise<C4Diagram | undefined> {
    const descriptor = await this.getViewDescriptor(viewId);
    if (!descriptor) return undefined;

    const subjectRow = await this.db('c4_nodes')
      .where({ id: descriptor.subjectId })
      .first();
    if (!subjectRow) return undefined;

    const subjectDepth = subjectRow.depth as number;
    const subjectNode = this.rowToNode(subjectRow);

    let internalNodes: C4Node[];
    if (subjectDepth < 2) {
      const rows = await this.db('c4_nodes').where({
        parent_id: descriptor.subjectId,
      });
      internalNodes = rows.map(this.rowToNode);
      // For landscape views, also pull systems that belong to subdomain children
      if (subjectDepth === 0) {
        const subdomainIds = rows
          .filter((r: any) => r.depth === 0)
          .map((r: any) => r.id);
        if (subdomainIds.length > 0) {
          const grandchildRows = await this.db('c4_nodes').whereIn(
            'parent_id',
            subdomainIds,
          );
          internalNodes = [
            ...internalNodes,
            ...grandchildRows.map(this.rowToNode),
          ];
        }
      }
    } else {
      // For component views: include depth-3 subcomponents if any exist
      const subcomponentRows = await this.db('c4_nodes').where({
        parent_id: descriptor.subjectId,
        depth: 3,
      });
      internalNodes =
        subcomponentRows.length > 0
          ? subcomponentRows.map(this.rowToNode)
          : [subjectNode];
    }

    const internalIds = new Set(internalNodes.map(n => n.id));

    const relRows = await this.db('c4_relationships').where(
      function whereRelated() {
        this.whereIn('source_id', [...internalIds]).orWhereIn('target_id', [
          ...internalIds,
        ]);
      },
    );
    const allRelationships: C4Relationship[] = relRows.map((r: any) => ({
      id: r.id,
      sourceId: r.source_id,
      targetId: r.target_id,
      description: r.description,
      technology: r.technology ?? undefined,
      tags: JSON.parse(r.tags),
    }));

    // Collect IDs on the far side of each relationship (could be node or actor)
    const externalCandidateIds = new Set<string>();
    for (const r of allRelationships) {
      const otherId = internalIds.has(r.sourceId) ? r.targetId : r.sourceId;
      if (!internalIds.has(otherId)) externalCandidateIds.add(otherId);
    }

    let externalNodes: C4Node[] = [];
    const resolvedNodeIds = new Set<string>();
    if (externalCandidateIds.size > 0) {
      const rows = await this.db('c4_nodes').whereIn('id', [
        ...externalCandidateIds,
      ]);
      externalNodes = rows.map(this.rowToNode);
      for (const n of externalNodes) resolvedNodeIds.add(n.id);
    }

    const actorCandidateIds = [...externalCandidateIds].filter(
      id => !resolvedNodeIds.has(id),
    );
    let externalActors: C4Actor[] = [];
    if (actorCandidateIds.length > 0) {
      const rows = await this.db('c4_actors').whereIn('id', actorCandidateIds);
      externalActors = rows.map(this.rowToActor);
    }

    const visibleIds = new Set([
      ...internalIds,
      ...externalNodes.map(n => n.id),
      ...externalActors.map(a => a.id),
    ]);
    const relationships = allRelationships.filter(
      r => visibleIds.has(r.sourceId) && visibleIds.has(r.targetId),
    );

    // Include subject node for rendering the boundary; dedupe if it's already in internalNodes
    const seenIds = new Set<string>();
    const nodes: C4Node[] = [];
    for (const n of [subjectNode, ...internalNodes, ...externalNodes]) {
      if (!seenIds.has(n.id)) {
        seenIds.add(n.id);
        nodes.push(n);
      }
    }

    const nodePositions = await this.getNodePositions(viewId);
    return {
      descriptor,
      nodes,
      actors: externalActors,
      relationships,
      nodePositions,
    };
  }

  async getNodePositions(
    viewId: string,
  ): Promise<Record<string, { x: number; y: number }>> {
    const rows = await this.db('c4_node_positions').where({ view_id: viewId });
    const result: Record<string, { x: number; y: number }> = {};
    for (const row of rows) {
      result[row.node_id] = { x: row.x, y: row.y };
    }
    return result;
  }

  async saveNodePositions(
    viewId: string,
    positions: Record<string, { x: number; y: number }>,
  ): Promise<void> {
    await this.db.transaction(async trx => {
      await trx('c4_node_positions').where({ view_id: viewId }).delete();
      const rows = Object.entries(positions).map(([nodeId, pos]) => ({
        view_id: viewId,
        node_id: nodeId,
        x: pos.x,
        y: pos.y,
      }));
      if (rows.length > 0) await trx('c4_node_positions').insert(rows);
    });
  }

  async clearNodePositions(viewId: string): Promise<void> {
    await this.db('c4_node_positions').where({ view_id: viewId }).delete();
  }

  /** Persist display settings for a view (direction, node/rank spacing). Upserts into `c4_view_settings`. */
  async updateViewSettings(
    viewId: string,
    patch: C4ViewDisplaySettings,
  ): Promise<void> {
    const existing = await this.db('c4_view_settings')
      .where({ view_id: viewId })
      .first();
    const current: C4ViewDisplaySettings = existing
      ? JSON.parse(existing.settings)
      : {};
    const merged: C4ViewDisplaySettings = { ...current };
    (Object.keys(patch) as (keyof C4ViewDisplaySettings)[]).forEach(k => {
      if (patch[k] !== undefined) (merged as any)[k] = patch[k];
    });
    if (existing) {
      await this.db('c4_view_settings')
        .where({ view_id: viewId })
        .update({ settings: JSON.stringify(merged) });
    } else {
      await this.db('c4_view_settings').insert({
        view_id: viewId,
        settings: JSON.stringify(merged),
      });
    }
  }

  /**
   * Record the last sync time and status for a provider.
   * Uses an upsert so the first call for a new source creates the row.
   */
  async updateSyncStatus(
    source: C4Source,
    status: 'ok' | 'error',
  ): Promise<void> {
    const now = new Date().toISOString();
    const existing = await this.db('c4_sync_status').where({ source }).first();
    if (existing) {
      await this.db('c4_sync_status')
        .where({ source })
        .update({ last_sync: now, status });
    } else {
      await this.db('c4_sync_status').insert({
        source,
        last_sync: now,
        status,
      });
    }
  }

  /** Return the last sync time and status for every registered source. */
  async getSyncStatus(): Promise<
    Record<string, { lastSync: string | null; status: string }>
  > {
    const rows = await this.db('c4_sync_status');
    const result: Record<string, { lastSync: string | null; status: string }> =
      {};
    for (const row of rows) {
      result[row.source] = {
        lastSync: row.last_sync ?? null,
        status: row.status,
      };
    }
    return result;
  }

  private rowToNode(row: any): C4Node {
    return {
      id: row.id,
      parentId: row.parent_id ?? undefined,
      depth: row.depth,
      name: row.name,
      description: row.description,
      technology: row.technology ?? undefined,
      subType: row.sub_type ?? undefined,
      navigable: !!row.navigable,
      tags: JSON.parse(row.tags),
      catalogEntityRef: row.catalog_entity_ref ?? undefined,
    };
  }

  private rowToActor(row: any): C4Actor {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      tags: JSON.parse(row.tags),
      catalogEntityRef: row.catalog_entity_ref ?? undefined,
    };
  }

  private rowToDescriptor(row: any): C4ViewDescriptor {
    const depth: number = row.subject_depth ?? 0;
    const hasSubcomponents = !!(
      row.has_subcomponents && row.has_subcomponents !== 0
    );
    let level: C4DiagramLevel;
    if (depth === 0) level = 'landscape';
    else if (depth === 1) level = 'context';
    else if (depth === 2 && hasSubcomponents) level = 'component';
    else level = 'container';
    let displaySettings: C4ViewDisplaySettings | undefined;
    if (row.display_settings) {
      try {
        displaySettings = JSON.parse(row.display_settings);
      } catch {
        /* ignore */
      }
    }
    return {
      id: row.id,
      title: row.title,
      subjectId: row.subject_id,
      entityRef: row.entity_ref ?? undefined,
      source: row.source,
      level,
      displaySettings,
      parentTitle: row.parent_title ?? undefined,
      parentEntityRef: row.parent_entity_ref ?? undefined,
    };
  }
}
