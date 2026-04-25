import type { ElkNode } from 'elkjs';
import { NODE_H, NODE_W } from '../../c4Style';
import { elkDebug } from '../debug';
import type { Rect } from '../geometry';
import type { Boundary } from './types';

export interface ElkSection {
  startPoint: { x: number; y: number };
  bendPoints?: Array<{ x: number; y: number }>;
  endPoint: { x: number; y: number };
}

// Lazily loaded and cached — the UMD bundle must NOT be imported statically
// because webpack executes it at module-init time and corrupts React's module
// context (causes "$RefreshSig$ / useState is not a function" errors).
let _elk: InstanceType<typeof import('elkjs').default> | null = null;
async function getElk() {
  if (!_elk) {
    const mod = await import('elkjs/lib/elk.bundled.js');
    const ELKClass = ((mod as any).default ?? mod) as any;
    _elk = new ELKClass();
  }
  return _elk!;
}

export async function runElk(
  elkGraph: ElkNode,
  subdomainIds: Set<string>,
): Promise<{
  elkResult: ElkNode;
  boundary: Boundary;
  absRects: Map<string, Rect>;
  elkEdgeSections: Map<string, ElkSection[]>;
}> {
  const elk = await getElk();
  const elkResult = await elk.layout(elkGraph);

  // The __boundary__ compound wraps all internal nodes. Its ELK position and size
  // define the canvas boundary box (placed at canvas origin 0,0).
  const boundaryChild = (elkResult.children ?? []).find(
    c => c.id === '__boundary__',
  );

  // Offset: translates ELK root coordinates → canvas coordinates.
  // boundary compound maps to canvas (0,0), so offset = -compound.x, -compound.y.
  const bx = boundaryChild?.x ?? 0;
  const by = boundaryChild?.y ?? 0;
  const offsetX = -bx;
  const offsetY = -by;
  elkDebug('boundary', {
    x: bx,
    y: by,
    w: boundaryChild?.width,
    h: boundaryChild?.height,
  });
  elkDebug('edge counts', {
    root: elkResult.edges?.length ?? 0,
    boundary: boundaryChild?.edges?.length ?? 0,
  });
  elkDebug(
    'internal children',
    boundaryChild?.children?.map(c => ({ id: c.id, x: c.x, y: c.y })),
  );
  elkDebug(
    'external children',
    elkResult.children
      ?.filter(c => c.id !== '__boundary__')
      .map(c => ({ id: c.id, x: c.x, y: c.y })),
  );
  if (elkResult.edges?.length) {
    elkDebug(
      'root edge sections',
      elkResult.edges.map(e => ({
        id: e.id,
        sections: e.sections?.map(s => ({
          start: s.startPoint,
          end: s.endPoint,
          bends: s.bendPoints?.length,
        })),
      })),
    );
  }
  if (boundaryChild?.edges?.length) {
    elkDebug(
      'boundary edge sections',
      boundaryChild.edges.map(e => ({
        id: e.id,
        sections: e.sections?.map(s => ({
          start: s.startPoint,
          end: s.endPoint,
          bends: s.bendPoints?.length,
        })),
      })),
    );
  }

  const boundary: Boundary = {
    x: 0,
    y: 0,
    w: boundaryChild?.width ?? NODE_W,
    h: boundaryChild?.height ?? NODE_H,
  };

  // Build absolute canvas positions for all nodes.
  // Internal: relative to __boundary__ which maps to canvas (0,0).
  // External: in root space; canvas = root_x + offsetX.
  const absRects = new Map<string, Rect>();

  for (const child of boundaryChild?.children ?? []) {
    if (subdomainIds.has(child.id)) {
      const sdAbsX = child.x ?? 0;
      const sdAbsY = child.y ?? 0;
      for (const sys of child.children ?? []) {
        absRects.set(sys.id, {
          x: sdAbsX + (sys.x ?? 0),
          y: sdAbsY + (sys.y ?? 0),
          w: NODE_W,
          h: NODE_H,
        });
      }
    } else {
      absRects.set(child.id, {
        x: child.x ?? 0,
        y: child.y ?? 0,
        w: NODE_W,
        h: NODE_H,
      });
    }
  }

  for (const child of elkResult.children ?? []) {
    if (child.id === '__boundary__') continue;
    // External or actor node at root level.
    absRects.set(child.id, {
      x: (child.x ?? 0) + offsetX,
      y: (child.y ?? 0) + offsetY,
      w: NODE_W,
      h: NODE_H,
    });
  }

  // Extract ELK ORTHOGONAL edge sections in canvas coordinates.
  // With INCLUDE_CHILDREN, all root-level edges are routed globally → sections in root space.
  const elkEdgeSections = new Map<string, ElkSection[]>();

  function translateSections(
    edges: NonNullable<ElkNode['edges']>,
    dx: number,
    dy: number,
  ) {
    for (const edge of edges) {
      if (!edge.sections?.length) continue;
      elkEdgeSections.set(
        edge.id,
        edge.sections.map(s => ({
          startPoint: { x: s.startPoint.x + dx, y: s.startPoint.y + dy },
          bendPoints: s.bendPoints?.map(p => ({
            x: p.x + dx,
            y: p.y + dy,
          })),
          endPoint: { x: s.endPoint.x + dx, y: s.endPoint.y + dy },
        })),
      );
    }
  }

  // Root-level edges: sections in root coordinate space → apply (offsetX, offsetY).
  if (elkResult.edges?.length) {
    translateSections(elkResult.edges, offsetX, offsetY);
  }

  // __boundary__ compound may have edges if ELK lifted some there.
  if (boundaryChild?.edges?.length) {
    // Sections relative to __boundary__ which maps to canvas (0,0) → no offset needed.
    translateSections(boundaryChild.edges, 0, 0);
  }

  // Subdomain-internal edges: sections relative to subdomain compound.
  for (const child of boundaryChild?.children ?? []) {
    if (!subdomainIds.has(child.id) || !child.edges?.length) continue;
    const sdX = child.x ?? 0;
    const sdY = child.y ?? 0;
    translateSections(child.edges, sdX, sdY);
  }

  // buildFlowGraph iterates elkResult.children expecting internal nodes at root.
  // Expose __boundary__'s children so existing position code works unchanged.
  // __boundary__ padding is already factored into child.x/y by ELK — so buildFlowGraph
  // must NOT add BOUNDARY_PAD again (child.x already = BOUNDARY_PAD + elkX).
  const innerElkResult: ElkNode = {
    ...elkResult,
    children: boundaryChild?.children ?? [],
  };

  return { elkResult: innerElkResult, boundary, absRects, elkEdgeSections };
}
