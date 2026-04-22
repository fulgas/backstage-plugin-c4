import type { C4Diagram } from '@fulgas/plugin-c4-node';
import { NODE_H, NODE_W } from '../c4Style';
import { resolveAbsolutePositions } from './geometry';
import { buildElkGraph } from './pipeline/buildElkGraph';
import { buildFlowGraph } from './pipeline/buildFlowGraph';
import { classify } from './pipeline/classify';
import { placeExternals } from './pipeline/placeExternals';
import { runElk } from './pipeline/runElk';
import { HandleRouter, HandleUsageTracker } from './routing/HandleRouter';
import type { LayoutResult } from './types';

export type { C4LayoutOptions } from './pipeline/types';

export function recomputeEdgeSections(layout: LayoutResult): LayoutResult {
  const absPos = resolveAbsolutePositions(layout.nodes);
  const router = new HandleRouter();
  const usage = new HandleUsageTracker();

  const edges = layout.edges.map(e => {
    const srcPos = absPos.get(e.source);
    const tgtPos = absPos.get(e.target);
    if (!srcPos || !tgtPos) return e;

    const srcRect = { x: srcPos.x, y: srcPos.y, w: NODE_W, h: NODE_H };
    const tgtRect = { x: tgtPos.x, y: tgtPos.y, w: NODE_W, h: NODE_H };

    const { sections, sourceHandle, targetHandle } = router.select(
      srcRect,
      tgtRect,
      usage.ctx(e.source, e.target),
    );
    usage.mark(e.source, sourceHandle, e.target, targetHandle);

    return {
      ...e,
      sourceHandle,
      targetHandle,
      data: { ...(e.data as object), sections },
    };
  });

  return { ...layout, edges };
}

export async function elkLayout(
  diagram: C4Diagram,
  options: import('./pipeline/types').C4LayoutOptions = {},
): Promise<LayoutResult> {
  const { nodes, actors, relationships } = diagram;
  const subjectId = diagram.descriptor.subjectId;
  const dir = options.direction ?? 'TB';

  const classified = classify(nodes, actors, relationships, subjectId);
  const elkGraph = buildElkGraph(classified, dir);
  const { elkResult, boundary, absRects } = await runElk(
    elkGraph,
    classified.subdomainIds,
  );
  placeExternals(absRects, boundary, classified, actors);
  const { flowNodes, flowEdges } = buildFlowGraph(
    classified,
    elkResult,
    boundary,
    absRects,
    actors,
  );

  return { nodes: flowNodes, edges: flowEdges };
}
