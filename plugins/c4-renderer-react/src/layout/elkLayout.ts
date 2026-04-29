import type { C4Diagram } from '@fulgas/plugin-c4-node';
import { NODE_H, NODE_W } from '../c4Style';
import {
  buildSrcHandles,
  buildTgtHandles,
  isHorizontalHandle,
  orthogonalPath,
  resolveAbsolutePositions,
} from './geometry';
import { buildElkGraph } from './pipeline/buildElkGraph';
import { buildFlowGraph } from './pipeline/buildFlowGraph';
import { classify } from './pipeline/classify';
import { redistributeExternals } from './pipeline/redistributeExternals';
import { runElk, type ElkSection } from './pipeline/runElk';
import type { C4LayoutOptions } from './pipeline/types';
import { HandleRouter, HandleUsageTracker } from './routing/HandleRouter';
import type { LayoutResult } from './types';

/**
 * Recompute edge sections and handle IDs from current node positions using
 * HandleRouter. Called after node drag and on exit from edit mode.
 * Only edges are updated — portHandles on nodes stay from the last full layout
 * to avoid handle-registry desync that causes edges to disappear.
 */
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

    // Only set sourceHandle/targetHandle when not already present — existing IDs
    // (dynamic ELK ports or ghost-promoted handles) must be preserved so React Flow's
    // handle registry lookup stays valid and edges don't disappear in edit mode.
    return {
      ...e,
      sourceHandle: e.sourceHandle ?? sourceHandle,
      targetHandle: e.targetHandle ?? targetHandle,
      data: { ...(e.data as object), sections },
    };
  });

  return { ...layout, edges };
}

export async function elkLayout(
  diagram: C4Diagram,
  options: C4LayoutOptions = {},
): Promise<LayoutResult> {
  const { nodes, actors, relationships } = diagram;
  const subjectId = diagram.descriptor.subjectId;
  const dir = options.direction ?? 'TB';

  const classified = classify(nodes, actors, relationships, subjectId);
  const { elkGraph } = buildElkGraph(classified, dir, actors);
  const { elkResult, boundary, absRects, elkEdgeSections, subdomainRects } =
    await runElk(elkGraph, classified.subdomainIds);

  const effectiveDir: 'TB' | 'LR' =
    dir === 'auto' || dir === 'LR' ? 'LR' : 'TB';
  const redistributed = redistributeExternals(
    absRects,
    boundary.w,
    boundary.h,
    classified,
    actors,
    effectiveDir,
  );

  const { internalIdSet, edgeMap } = classified;

  // Routing tolerance constants.
  // CROSS_TOL: radius around each node used for path-crossing detection.
  const CROSS_TOL = 4;
  // FACE_TOL_NODE: how close a segment must be to a regular node face to count as hugging.
  const FACE_TOL_NODE = 8;
  // FACE_TOL_BOUNDARY: looser tolerance for boundary walls (larger visual elements).
  const FACE_TOL_BOUNDARY = 15;
  // FACE_MIN_OVERLAP: minimum parallel overlap with a face to count as hugging.
  const FACE_MIN_OVERLAP = 20;
  // BEND_GAP: minimum gap from a boundary face enforced by shiftBendsAwayFromBoundaries.
  const BEND_GAP = 20;

  // Boundary boxes as routing obstacles — outer boundary + sub-domain boundaries.
  const outerBoundary = { x: 0, y: 0, w: boundary.w, h: boundary.h };
  const boundaryObstacles = [outerBoundary, ...subdomainRects.values()];

  // Build internal-only sections from first pass (these are correct, nodes haven't moved).
  const internalSections = new Map<string, ElkSection[]>();
  for (const [key, secs] of elkEdgeSections) {
    const group = edgeMap.get(key);
    if (!group) continue;
    const { sourceId, targetId } = group[0];
    if (internalIdSet.has(sourceId) && internalIdSet.has(targetId))
      internalSections.set(key, secs);
  }

  // For external edges: brute-force obstacle-aware routing.
  // Try all 144 src×tgt handle combos, pick the L-bend with fewest node crossings.
  function pathCrossings(
    pts: { x: number; y: number }[],
    srcId: string,
    tgtId: string,
  ): number {
    const lastSeg = pts.length - 2;
    let count = 0;
    for (const [nid, r] of redistributed) {
      if (nid === srcId) continue;
      for (let i = 0; i + 1 < pts.length; i++) {
        // Target: only the endpoint approach segment (last) is allowed inside the target.
        if (nid === tgtId && i === lastSeg) continue;
        const ax = pts[i].x,
          ay = pts[i].y,
          bx = pts[i + 1].x,
          by = pts[i + 1].y;
        for (let s = 1; s < 20; s++) {
          const t = s / 20;
          const px = ax + t * (bx - ax),
            py = ay + t * (by - ay);
          if (
            px >= r.x - CROSS_TOL &&
            px <= r.x + r.w + CROSS_TOL &&
            py >= r.y - CROSS_TOL &&
            py <= r.y + r.h + CROSS_TOL
          ) {
            count++;
            break;
          }
        }
      }
    }
    return count;
  }

  // Score paths for face-hugging and non-perpendicular target approach.
  // Returns a count where each unit adds 1e6 to the route score.
  function pathFaceHugs(
    pts: { x: number; y: number }[],
    srcId: string,
    tgtId: string,
  ): number {
    function hugsRect(
      a: { x: number; y: number },
      b: { x: number; y: number },
      r: { x: number; y: number; w: number; h: number },
      tol: number,
    ): boolean {
      const dx = b.x - a.x,
        dy = b.y - a.y;
      if (Math.abs(dy) < 2 && Math.abs(dx) >= FACE_MIN_OVERLAP) {
        const y = (a.y + b.y) / 2;
        const minX = Math.min(a.x, b.x),
          maxX = Math.max(a.x, b.x);
        const overlap = Math.min(maxX, r.x + r.w) - Math.max(minX, r.x);
        if (
          overlap >= FACE_MIN_OVERLAP &&
          (Math.abs(y - r.y) <= tol || Math.abs(y - (r.y + r.h)) <= tol)
        )
          return true;
      }
      if (Math.abs(dx) < 2 && Math.abs(dy) >= FACE_MIN_OVERLAP) {
        const x = (a.x + b.x) / 2;
        const minY = Math.min(a.y, b.y),
          maxY = Math.max(a.y, b.y);
        const overlap = Math.min(maxY, r.y + r.h) - Math.max(minY, r.y);
        if (
          overlap >= FACE_MIN_OVERLAP &&
          (Math.abs(x - r.x) <= tol || Math.abs(x - (r.x + r.w)) <= tol)
        )
          return true;
      }
      return false;
    }

    const lastSeg = pts.length - 2;
    let count = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i],
        b = pts[i + 1];
      for (const r of boundaryObstacles) {
        if (hugsRect(a, b, r, FACE_TOL_BOUNDARY)) {
          count++;
          break;
        }
      }
      // Source: always skip. Target: skip only the last (endpoint approach) segment.
      for (const [nid, r] of redistributed) {
        if (nid === srcId) continue;
        if (nid === tgtId && i === lastSeg) continue;
        if (hugsRect(a, b, r, FACE_TOL_NODE)) {
          count++;
          break;
        }
      }
    }

    if (pts.length >= 2) {
      const tgtR = redistributed.get(tgtId);
      if (tgtR) {
        const endPt = pts[pts.length - 1];
        const prevPt = pts[pts.length - 2];
        const ldx = endPt.x - prevPt.x;
        const ldy = endPt.y - prevPt.y;
        const onLeft = Math.abs(endPt.x - tgtR.x) < FACE_TOL_NODE;
        const onRight = Math.abs(endPt.x - (tgtR.x + tgtR.w)) < FACE_TOL_NODE;
        const onTop = Math.abs(endPt.y - tgtR.y) < FACE_TOL_NODE;
        const onBottom = Math.abs(endPt.y - (tgtR.y + tgtR.h)) < FACE_TOL_NODE;
        // Prefer perpendicular approach; tolerate parallel when no clean alternative exists.
        const parallelToFace =
          ((onLeft || onRight) && Math.abs(ldx) < 2 && Math.abs(ldy) > 10) ||
          ((onTop || onBottom) && Math.abs(ldy) < 2 && Math.abs(ldx) > 10);
        if (parallelToFace) count += 100;

        // Traversal: enters target via one face but connects at the opposite face,
        // making the edge appear to pass through the node. Higher penalty than parallel.
        const traversal =
          (Math.abs(ldx) < 2 && onBottom && !onTop && prevPt.y < tgtR.y) ||
          (Math.abs(ldx) < 2 &&
            onTop &&
            !onBottom &&
            prevPt.y > tgtR.y + tgtR.h) ||
          (Math.abs(ldy) < 2 && onRight && !onLeft && prevPt.x < tgtR.x) ||
          (Math.abs(ldy) < 2 &&
            onLeft &&
            !onRight &&
            prevPt.x > tgtR.x + tgtR.w);
        if (traversal) count += 500;
      }
    }

    return count;
  }

  // orthogonalPath places the Z-bend at the midpoint between source and target.
  // When that midpoint lands within BEND_GAP of a boundary face the edge looks like
  // it's hugging the wall. Push the shared bend coordinate past the face.
  function shiftBendsAwayFromBoundaries(
    pts: { x: number; y: number }[],
  ): { x: number; y: number }[] {
    if (pts.length < 4) return pts;
    const result = pts.map(p => ({ ...p }));
    const p1 = result[1],
      p2 = result[2];

    if (Math.abs(p1.y - p2.y) < 2) {
      let bendY = (p1.y + p2.y) / 2;
      for (const r of boundaryObstacles) {
        if (Math.abs(bendY - r.y) < BEND_GAP) {
          bendY = r.y - BEND_GAP;
          break;
        }
        if (Math.abs(bendY - (r.y + r.h)) < BEND_GAP) {
          bendY = r.y + r.h + BEND_GAP;
          break;
        }
      }
      result[1] = { ...result[1], y: bendY };
      result[2] = { ...result[2], y: bendY };
    }

    if (Math.abs(p1.x - p2.x) < 2) {
      let bendX = (p1.x + p2.x) / 2;
      for (const r of boundaryObstacles) {
        if (Math.abs(bendX - r.x) < BEND_GAP) {
          bendX = r.x - BEND_GAP;
          break;
        }
        if (Math.abs(bendX - (r.x + r.w)) < BEND_GAP) {
          bendX = r.x + r.w + BEND_GAP;
          break;
        }
      }
      result[1] = { ...result[1], x: bendX };
      result[2] = { ...result[2], x: bendX };
    }

    return result;
  }

  const hrUsage = new HandleUsageTracker();
  const externalSections = new Map<string, ElkSection[]>();
  for (const [key, group] of edgeMap) {
    const { sourceId, targetId } = group[0];
    if (internalIdSet.has(sourceId) && internalIdSet.has(targetId)) continue;
    const srcR = redistributed.get(sourceId);
    const tgtR = redistributed.get(targetId);
    if (!srcR || !tgtR) continue;

    const ctx = hrUsage.ctx(sourceId, targetId);
    let bestPts: { x: number; y: number }[] | null = null;
    let bestSrcH = '';
    let bestTgtH = '';
    let bestScore = Infinity;

    for (const s of buildSrcHandles(srcR)) {
      for (const t of buildTgtHandles(tgtR)) {
        const { pts } = orthogonalPath(
          s.x,
          s.y,
          t.x,
          t.y,
          isHorizontalHandle(s.id),
          s.face,
          t.face,
        );
        let len = 0;
        for (let i = 0; i + 1 < pts.length; i++) {
          len +=
            Math.abs(pts[i + 1].x - pts[i].x) +
            Math.abs(pts[i + 1].y - pts[i].y);
        }
        // HandleRouter rules (center preference, min-distance) as secondary sort.
        const hrScore = HandleRouter.DEFAULT_RULES.reduce(
          (sum, rule) => sum + rule.score(s, t, ctx),
          0,
        );
        // Priority: fewest crossings → fewest face-hugs (nodes + boundaries) → HandleRouter rules → length.
        const score =
          pathCrossings(pts, sourceId, targetId) * 1e9 +
          pathFaceHugs(pts, sourceId, targetId) * 1e6 +
          -hrScore +
          len;
        if (score < bestScore) {
          bestScore = score;
          bestPts = pts;
          bestSrcH = s.id;
          bestTgtH = t.id;
        }
      }
    }

    if (bestPts) {
      hrUsage.mark(sourceId, bestSrcH, targetId, bestTgtH);
      const finalPts = shiftBendsAwayFromBoundaries(bestPts);
      externalSections.set(key, [
        {
          startPoint: finalPts[0],
          bendPoints: finalPts.slice(1, -1),
          endPoint: finalPts[finalPts.length - 1],
        },
      ]);
    }
  }

  const mergedSections = new Map([...internalSections, ...externalSections]);

  const { flowNodes, flowEdges } = buildFlowGraph(
    classified,
    elkResult,
    boundary,
    redistributed,
    actors,
    mergedSections,
  );

  return { nodes: flowNodes, edges: flowEdges };
}
