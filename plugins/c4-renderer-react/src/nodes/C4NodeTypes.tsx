import { Handle, NodeResizer, Position } from '@xyflow/react';
import React from 'react';
import {
  COLOR_DATABASE,
  COLOR_EXTERNAL,
  COLOR_INTERNAL,
  COLOR_PERSON,
  COLOR_QUEUE,
} from '../c4Style';

// ── Shared text styles ────────────────────────────────────────────────────────

const LABEL: React.CSSProperties = {
  fontWeight: 600,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const DESC: React.CSSProperties = {
  fontSize: 11,
  marginTop: 4,
  opacity: 0.85,
  whiteSpace: 'normal',
  lineHeight: 1.4,
};

const TECH: React.CSSProperties = {
  fontSize: 10,
  opacity: 0.75,
  marginTop: 2,
  fontStyle: 'italic',
  whiteSpace: 'nowrap',
};

// ── Handles ───────────────────────────────────────────────────────────────────

const HANDLE_STYLE: React.CSSProperties = { opacity: 0 };

/**
 * Hidden handles on all 4 sides, rendered as siblings of the content element
 * so React Flow positions them relative to the `.react-flow__node` wrapper.
 */
function AllHandles() {
  return (
    <>
      <Handle
        id="s-top"
        type="source"
        position={Position.Top}
        style={HANDLE_STYLE}
      />
      <Handle
        id="s-right"
        type="source"
        position={Position.Right}
        style={HANDLE_STYLE}
      />
      <Handle
        id="s-bottom"
        type="source"
        position={Position.Bottom}
        style={HANDLE_STYLE}
      />
      <Handle
        id="s-left"
        type="source"
        position={Position.Left}
        style={HANDLE_STYLE}
      />
      <Handle
        id="t-top"
        type="target"
        position={Position.Top}
        style={HANDLE_STYLE}
      />
      <Handle
        id="t-right"
        type="target"
        position={Position.Right}
        style={HANDLE_STYLE}
      />
      <Handle
        id="t-bottom"
        type="target"
        position={Position.Bottom}
        style={HANDLE_STYLE}
      />
      <Handle
        id="t-left"
        type="target"
        position={Position.Left}
        style={HANDLE_STYLE}
      />
    </>
  );
}

// ── Shape helpers ─────────────────────────────────────────────────────────────

/** Mix a hex colour toward white by `amount` (0–1). */
function lighten(hex: string, amount = 0.25): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const mix = (c: number) => Math.min(255, Math.round(c + (255 - c) * amount));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

interface NodeData {
  label: string;
  description?: string;
  technology?: string;
  subType?: string;
}

/**
 * Standard rounded-rectangle box (service, resource, default).
 */
function BoxShape({ bg, data }: { bg: string; data: NodeData }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        padding: '8px 12px',
        borderRadius: 6,
        background: bg,
        color: '#fff',
        fontFamily: 'sans-serif',
        fontSize: 13,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <div style={LABEL}>{data.label}</div>
      {data.technology && <div style={TECH}>[{data.technology}]</div>}
      {data.description && <div style={DESC}>{data.description}</div>}
    </div>
  );
}

/**
 * Cylinder shape for databases (C4 standard).
 *
 * Built with three absolutely-positioned divs inside the fixed node wrapper:
 *   ┌──────────────────┐  ← top ellipse (lighten bg, z=3)
 *   │                  │
 *   │   body + text    │  ← rectangle body (bg, z=1)
 *   │                  │
 *   └──────────────────┘  ← bottom ellipse (bg, z=2)
 */
function CylinderShape({ bg, data }: { bg: string; data: NodeData }) {
  const EH = 9; // vertical radius of each ellipse cap (px)
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Rectangle body */}
      <div
        style={{
          position: 'absolute',
          top: EH,
          left: 0,
          right: 0,
          bottom: EH,
          background: bg,
          zIndex: 1,
        }}
      />
      {/* Bottom ellipse — same colour as body so it blends */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: EH * 2,
          borderRadius: '50%',
          background: bg,
          borderTop: '1px solid rgba(255,255,255,0.2)',
          zIndex: 2,
        }}
      />
      {/* Top ellipse — slightly lighter for 3-D depth */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: EH * 2,
          borderRadius: '50%',
          background: lighten(bg),
          border: '1px solid rgba(255,255,255,0.35)',
          zIndex: 3,
        }}
      />
      {/* Text — sits above all shapes, padded away from ellipse zones */}
      <div
        style={{
          position: 'absolute',
          top: EH,
          left: 0,
          right: 0,
          bottom: EH,
          zIndex: 4,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: `${EH + 2}px 12px`,
          boxSizing: 'border-box',
          color: '#fff',
          fontFamily: 'sans-serif',
          fontSize: 13,
          textAlign: 'center',
        }}
      >
        <div style={LABEL}>{data.label}</div>
        {data.technology && <div style={TECH}>[{data.technology}]</div>}
        {data.description && <div style={DESC}>{data.description}</div>}
      </div>
    </div>
  );
}

/**
 * Pill / capsule shape for queues and message buses (C4 "pipe" shape).
 */
function PillShape({ bg, data }: { bg: string; data: NodeData }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        padding: '8px 20px',
        // borderRadius > half of height makes perfectly rounded ends
        borderRadius: 9999,
        background: bg,
        color: '#fff',
        fontFamily: 'sans-serif',
        fontSize: 13,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <div style={LABEL}>{data.label}</div>
      {data.technology && <div style={TECH}>[{data.technology}]</div>}
      {data.description && <div style={DESC}>{data.description}</div>}
    </div>
  );
}

/** Pick the right shape component based on subType. */
function NodeShape({ bg, data }: { bg: string; data: NodeData }) {
  if (data.subType === 'database') return <CylinderShape bg={bg} data={data} />;
  if (data.subType === 'queue') return <PillShape bg={bg} data={data} />;
  return <BoxShape bg={bg} data={data} />;
}

// ── Exported node components ──────────────────────────────────────────────────

/** The subject boundary box — wraps internal nodes visually. */
export function BoundaryNode({ data }: { data: any }) {
  return (
    <>
      <NodeResizer
        isVisible={!!data.editMode}
        minWidth={120}
        minHeight={80}
        lineStyle={{
          stroke: '#4444aa',
          strokeWidth: 1.5,
          strokeDasharray: '4 2',
        }}
        handleStyle={{
          width: 10,
          height: 10,
          borderRadius: 2,
          background: '#4444aa',
          border: 'none',
        }}
      />
      <AllHandles />
      <div
        style={{
          border: '2px dashed #aaa',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.6)',
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          cursor: 'default',
        }}
      >
        <div
          style={{
            padding: '6px 12px 4px',
            fontSize: 11,
            fontWeight: 700,
            color: '#555',
            textTransform: 'uppercase',
            letterSpacing: 1,
            whiteSpace: 'nowrap',
            borderBottom: '1px dashed #ccc',
          }}
        >
          {data.label}
        </div>
      </div>
    </>
  );
}

/** Internal node — a system or container inside the boundary. */
export function InternalNode({ data }: { data: any }) {
  const bg =
    data.subType === 'database'
      ? COLOR_DATABASE
      : data.subType === 'queue'
      ? COLOR_QUEUE
      : COLOR_INTERNAL;
  return (
    <>
      <AllHandles />
      <NodeShape bg={bg} data={data} />
    </>
  );
}

/** External node — a system or container outside the boundary. */
export function ExternalNode({ data }: { data: any }) {
  return (
    <>
      <AllHandles />
      <NodeShape bg={COLOR_EXTERNAL} data={data} />
    </>
  );
}

/** Actor node — a person or group. */
export function ActorNode({ data }: { data: any }) {
  return (
    <>
      <AllHandles />
      <div
        style={{
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          padding: '6px 12px',
          borderRadius: 24,
          background: COLOR_PERSON,
          color: '#fff',
          fontFamily: 'sans-serif',
          fontSize: 13,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <div style={{ fontSize: 18, marginBottom: 4 }}>👤</div>
        <div style={LABEL}>{data.label}</div>
        {data.description && <div style={DESC}>{data.description}</div>}
      </div>
    </>
  );
}
