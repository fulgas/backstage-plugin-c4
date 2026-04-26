import {
  BaseEdge,
  EdgeLabelRenderer,
  useNodes,
  type EdgeProps,
} from '@xyflow/react';
import type { CSSProperties } from 'react';
import { NODE_H, NODE_W } from '../c4Style';
import {
  faceFromHandle,
  handleIdToPoint,
  isHorizontalHandle,
  orthogonalPath,
  resolveAbsolutePositions,
} from '../layout/geometry';
import { HandleRouter } from '../layout/routing/HandleRouter';

interface ElkSection {
  startPoint: { x: number; y: number };
  bendPoints?: Array<{ x: number; y: number }>;
  endPoint: { x: number; y: number };
}

type Point = { x: number; y: number };

/** Returns the point at fraction `frac` (0=source, 1=target) along a polyline by arc length,
 *  along with the direction vector of the segment that contains it. */
function polylinePoint(
  pts: Point[],
  frac: number,
): { mid: Point; dx: number; dy: number } {
  if (pts.length === 0) return { mid: { x: 0, y: 0 }, dx: 0, dy: 0 };
  if (pts.length === 1) return { mid: pts[0], dx: 0, dy: 0 };

  const cumLen: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    cumLen.push(cumLen[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  const target = cumLen[cumLen.length - 1] * Math.max(0, Math.min(1, frac));

  for (let i = 1; i < cumLen.length; i++) {
    if (cumLen[i] >= target) {
      const segLen = cumLen[i] - cumLen[i - 1];
      const t = segLen === 0 ? 0 : (target - cumLen[i - 1]) / segLen;
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      return {
        mid: { x: pts[i - 1].x + t * dx, y: pts[i - 1].y + t * dy },
        dx,
        dy,
      };
    }
  }
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  return { mid: last, dx: last.x - prev.x, dy: last.y - prev.y };
}

const LABEL_W = 140; // conservative estimated label width for overlap test
const LABEL_H = 22; // estimated label height (10px font + padding)
const LABEL_GAP = 4; // clearance between the line and the label

/**
 * Custom React Flow edge that renders ELK's computed orthogonal routing path.
 *
 * ELK returns `sections[0]` with `startPoint`, `bendPoints`, and `endPoint`
 * in absolute canvas coordinates — already routed around all node obstacles.
 * We draw these as a straight-segment polyline (`M … L … L …`).
 *
 * Falls back to a smooth-step path if ELK sections are missing.
 */
export function ElkEdge({
  id,
  data,
  style,
  markerEnd,
  label,
  labelStyle,
  source,
  target,
  sourceHandleId,
  targetHandleId,
}: EdgeProps) {
  const nodes = useNodes();

  const absPos = resolveAbsolutePositions(nodes);

  /** True if the label rectangle at (mx, rectTop→rectBottom) hits any node box. */
  function overlapsNode(
    mx: number,
    rectTop: number,
    rectBottom: number,
  ): boolean {
    const lx = mx - LABEL_W / 2;
    const rx = mx + LABEL_W / 2;
    for (const n of nodes) {
      const pos = absPos.get(n.id) ?? { x: 0, y: 0 };
      const nw = (n.style?.width as number) ?? NODE_W;
      const nh = (n.style?.height as number) ?? NODE_H;
      if (
        lx < pos.x + nw &&
        rx > pos.x &&
        rectTop < pos.y + nh &&
        rectBottom > pos.y
      ) {
        return true;
      }
    }
    return false;
  }

  const sections: ElkSection[] = (data as any)?.sections ?? [];

  let edgePath: string;
  let labelX: number;
  let labelY: number;
  let isHorizontal = false;

  if (sections.length > 0 && sections[0]) {
    const { startPoint, bendPoints = [], endPoint } = sections[0];
    const pts = [startPoint, ...(bendPoints ?? []), endPoint];
    edgePath = pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
      .join(' ');
    const labelFrac: number = (data as any)?.labelFraction ?? 0.5;
    const { mid, dx, dy } = polylinePoint(pts, labelFrac);
    labelX = mid.x;
    labelY = mid.y;
    isHorizontal = Math.abs(dx) > Math.abs(dy);
  } else {
    // No sections — route from live node positions.
    // If sourceHandle/targetHandle are set (manual reconnect or dynamic ports),
    // use those exact positions. Otherwise let HandleRouter pick the best pair.
    const srcPos = absPos.get(source);
    const tgtPos = absPos.get(target);
    if (srcPos && tgtPos) {
      const srcRect = { x: srcPos.x, y: srcPos.y, w: NODE_W, h: NODE_H };
      const tgtRect = { x: tgtPos.x, y: tgtPos.y, w: NODE_W, h: NODE_H };

      let sx: number, sy: number, tx: number, ty: number;
      let sh: string, th: string;

      if (sourceHandleId && targetHandleId) {
        // Respect the stored handle choice (dynamic port or manual reconnect).
        const srcPt = handleIdToPoint(sourceHandleId, srcRect);
        const tgtPt = handleIdToPoint(targetHandleId, tgtRect);
        sx = srcPt.x;
        sy = srcPt.y;
        tx = tgtPt.x;
        ty = tgtPt.y;
        sh = sourceHandleId;
        th = targetHandleId;
      } else {
        const result = new HandleRouter().select(srcRect, tgtRect);
        sx = result.sx;
        sy = result.sy;
        tx = result.tx;
        ty = result.ty;
        sh = result.sourceHandle;
        th = result.targetHandle;
      }

      const horiz = isHorizontalHandle(sh);
      const { path, pts } = orthogonalPath(
        sx,
        sy,
        tx,
        ty,
        horiz,
        faceFromHandle(sh),
        faceFromHandle(th),
      );
      edgePath = path;
      const labelFrac: number = (data as any)?.labelFraction ?? 0.5;
      const { mid, dx: ldx, dy: ldy } = polylinePoint(pts, labelFrac);
      labelX = mid.x;
      labelY = mid.y;
      isHorizontal = Math.abs(ldx) > Math.abs(ldy);
    } else {
      edgePath = '';
      labelX = 0;
      labelY = 0;
    }
  }

  // For horizontal segments: prefer label above the line; fall back to below if a node
  // is sitting in the way. For vertical segments: centre on the line.
  let translateY: number;
  let alignY: string;

  if (isHorizontal) {
    const aboveTop = labelY - LABEL_GAP - LABEL_H;
    const aboveBot = labelY - LABEL_GAP;
    const belowTop = labelY + LABEL_GAP;
    const belowBot = labelY + LABEL_GAP + LABEL_H;

    if (!overlapsNode(labelX, aboveTop, aboveBot)) {
      // Place above
      translateY = labelY - LABEL_GAP;
      alignY = '-100%';
    } else if (!overlapsNode(labelX, belowTop, belowBot)) {
      // Place below
      translateY = labelY + LABEL_GAP;
      alignY = '0%';
    } else {
      // Both blocked — default to above
      translateY = labelY - LABEL_GAP;
      alignY = '-100%';
    }
  } else {
    translateY = labelY;
    alignY = '-50%';
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={style}
        markerEnd={markerEnd as string}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              // Horizontal edge → label above the line; vertical → label centred on the line
              transform: `translate(-50%, ${alignY}) translate(${labelX}px,${translateY}px)`,
              fontSize: 10,
              fontStyle: 'italic',
              color: 'var(--c4-color-edge-label, #333333)',
              textAlign: 'center',
              background:
                'var(--c4-color-edge-label-bg, rgba(255,255,255,0.85))',
              padding: '1px 5px',
              borderRadius: 3,
              pointerEvents: 'all',
              whiteSpace: 'pre', // preserve \n line breaks in merged labels
              ...((labelStyle as CSSProperties) ?? {}),
            }}
            className="nodrag nopan"
          >
            {String(label)}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
