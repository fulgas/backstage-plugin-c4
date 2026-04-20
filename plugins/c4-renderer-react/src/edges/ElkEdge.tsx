import React from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';

interface ElkSection {
  startPoint: { x: number; y: number };
  bendPoints?: Array<{ x: number; y: number }>;
  endPoint: { x: number; y: number };
}

/**
 * Custom React Flow edge that renders ELK's computed orthogonal routing path.
 *
 * ELK returns `sections[0]` with `startPoint`, `bendPoints`, and `endPoint`
 * in absolute canvas coordinates — already routed around all node obstacles.
 * We draw these as a straight-segment polyline (`M … L … L …`).
 *
 * Falls back to a bezier curve if ELK sections are missing.
 */
export function ElkEdge({
  id,
  data,
  style,
  markerEnd,
  label,
  labelStyle,
  sourceX,
  sourceY,
  targetX,
  targetY,
}: EdgeProps) {
  const sections: ElkSection[] = (data as any)?.sections ?? [];

  let edgePath: string;
  let labelX: number;
  let labelY: number;

  if (sections.length > 0 && sections[0]) {
    const { startPoint, bendPoints = [], endPoint } = sections[0];
    const pts = [startPoint, ...(bendPoints ?? []), endPoint];
    edgePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    // Place label at the midpoint segment
    const mid = pts[Math.floor(pts.length / 2)];
    labelX = mid.x;
    labelY = mid.y;
  } else {
    // Fallback: no ELK sections yet (e.g. layout still loading)
    [edgePath] = getBezierPath({ sourceX, sourceY, targetX, targetY });
    labelX = (sourceX + targetX) / 2;
    labelY = (sourceY + targetY) / 2;
  }

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd as string} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -120%) translate(${labelX}px,${labelY}px)`,
              fontSize: 10,
              fontStyle: 'italic',
              color: '#333',
              background: 'rgba(255,255,255,0.85)',
              padding: '1px 5px',
              borderRadius: 3,
              pointerEvents: 'all',
              whiteSpace: 'pre',           // preserve \n line breaks in merged labels
              ...(labelStyle as React.CSSProperties ?? {}),
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
