import { Handle, NodeResizer, Position } from '@xyflow/react';
import type { CSSProperties } from 'react';

// ── Shared text styles ────────────────────────────────────────────────────────

const LABEL: CSSProperties = {
  fontWeight: 600,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const DESC: CSSProperties = {
  fontSize: 11,
  marginTop: 4,
  opacity: 0.85,
  whiteSpace: 'normal',
  lineHeight: 1.4,
};

const TECH: CSSProperties = {
  fontSize: 10,
  opacity: 0.75,
  marginTop: 2,
  fontStyle: 'italic',
  whiteSpace: 'nowrap',
};

// ── Handles ───────────────────────────────────────────────────────────────────

const HANDLE_STYLE: CSSProperties = { opacity: 0 };

// Three handles per face at ¼, ½, ¾ — center is preferred by HandleRouter when
// a face has only one edge; near/far slots absorb additional edges on that face.
function AllHandles() {
  const hl = { ...HANDLE_STYLE, left: '25%' };
  const hc = { ...HANDLE_STYLE, left: '50%' };
  const hr = { ...HANDLE_STYLE, left: '75%' };
  const vt = { ...HANDLE_STYLE, top: '25%' };
  const vc = { ...HANDLE_STYLE, top: '50%' };
  const vb = { ...HANDLE_STYLE, top: '75%' };
  return (
    <>
      <Handle id="s-top-l" type="source" position={Position.Top} style={hl} />
      <Handle id="s-top-c" type="source" position={Position.Top} style={hc} />
      <Handle id="s-top-r" type="source" position={Position.Top} style={hr} />
      <Handle
        id="s-right-t"
        type="source"
        position={Position.Right}
        style={vt}
      />
      <Handle
        id="s-right-c"
        type="source"
        position={Position.Right}
        style={vc}
      />
      <Handle
        id="s-right-b"
        type="source"
        position={Position.Right}
        style={vb}
      />
      <Handle
        id="s-bottom-l"
        type="source"
        position={Position.Bottom}
        style={hl}
      />
      <Handle
        id="s-bottom-c"
        type="source"
        position={Position.Bottom}
        style={hc}
      />
      <Handle
        id="s-bottom-r"
        type="source"
        position={Position.Bottom}
        style={hr}
      />
      <Handle id="s-left-t" type="source" position={Position.Left} style={vt} />
      <Handle id="s-left-c" type="source" position={Position.Left} style={vc} />
      <Handle id="s-left-b" type="source" position={Position.Left} style={vb} />
      <Handle id="t-top-l" type="target" position={Position.Top} style={hl} />
      <Handle id="t-top-c" type="target" position={Position.Top} style={hc} />
      <Handle id="t-top-r" type="target" position={Position.Top} style={hr} />
      <Handle
        id="t-right-t"
        type="target"
        position={Position.Right}
        style={vt}
      />
      <Handle
        id="t-right-c"
        type="target"
        position={Position.Right}
        style={vc}
      />
      <Handle
        id="t-right-b"
        type="target"
        position={Position.Right}
        style={vb}
      />
      <Handle
        id="t-bottom-l"
        type="target"
        position={Position.Bottom}
        style={hl}
      />
      <Handle
        id="t-bottom-c"
        type="target"
        position={Position.Bottom}
        style={hc}
      />
      <Handle
        id="t-bottom-r"
        type="target"
        position={Position.Bottom}
        style={hr}
      />
      <Handle id="t-left-t" type="target" position={Position.Left} style={vt} />
      <Handle id="t-left-c" type="target" position={Position.Left} style={vc} />
      <Handle id="t-left-b" type="target" position={Position.Left} style={vb} />
    </>
  );
}

// ── Shape helpers ─────────────────────────────────────────────────────────────

interface NodeData {
  label: string;
  description?: string;
  technology?: string;
  subType?: string;
  navigable?: boolean;
}

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
        color: 'var(--c4-color-node-text, #ffffff)',
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
 * Uses color-mix() to derive a lighter top ellipse from the base colour,
 * so the tint adapts automatically when --c4-color-database is overridden.
 */
function CylinderShape({ bg, data }: { bg: string; data: NodeData }) {
  const EH = 9;
  const bgLight = `color-mix(in srgb, ${bg} 75%, white)`;
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
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
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: EH * 2,
          borderRadius: '50%',
          background: bgLight,
          border: '1px solid rgba(255,255,255,0.35)',
          zIndex: 3,
        }}
      />
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
          color: 'var(--c4-color-node-text, #ffffff)',
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

function PillShape({ bg, data }: { bg: string; data: NodeData }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        padding: '8px 20px',
        borderRadius: 9999,
        background: bg,
        color: 'var(--c4-color-node-text, #ffffff)',
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

function NodeShape({ bg, data }: { bg: string; data: NodeData }) {
  if (data.subType === 'database') return <CylinderShape bg={bg} data={data} />;
  if (data.subType === 'queue') return <PillShape bg={bg} data={data} />;
  return <BoxShape bg={bg} data={data} />;
}

// ── Exported node components ──────────────────────────────────────────────────

export function BoundaryNode({ data }: { data: any }) {
  return (
    <>
      <NodeResizer
        isVisible={!!data.editMode}
        minWidth={120}
        minHeight={80}
        lineStyle={{
          stroke: 'var(--c4-color-boundary-resizer, #4444aa)',
          strokeWidth: 1.5,
          strokeDasharray: '4 2',
        }}
        handleStyle={{
          width: 10,
          height: 10,
          borderRadius: 2,
          background: 'var(--c4-color-boundary-resizer, #4444aa)',
          border: 'none',
        }}
      />
      <div
        style={{
          border: '2px dashed var(--c4-color-boundary-border, #aaaaaa)',
          borderRadius: 8,
          background: 'var(--c4-color-boundary-bg, rgba(255,255,255,0.6))',
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          cursor: data.navigable ? 'pointer' : 'default',
        }}
      >
        <div
          style={{
            padding: '6px 12px 4px',
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--c4-color-boundary-label, #555555)',
            textTransform: 'uppercase',
            letterSpacing: 1,
            whiteSpace: 'nowrap',
            borderBottom: '1px dashed var(--c4-color-boundary-sep, #cccccc)',
          }}
        >
          {data.label}
        </div>
      </div>
    </>
  );
}

export function InternalNode({ data }: { data: any }) {
  const bg =
    data.subType === 'database'
      ? 'var(--c4-color-database, #0b6e4f)'
      : data.subType === 'queue'
      ? 'var(--c4-color-queue, #1168bd)'
      : 'var(--c4-color-internal, #1168bd)';
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        cursor: data.navigable ? 'pointer' : 'default',
      }}
    >
      <AllHandles />
      <NodeShape bg={bg} data={data} />
    </div>
  );
}

export function ExternalNode({ data }: { data: any }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        cursor: data.navigable ? 'pointer' : 'default',
      }}
    >
      <AllHandles />
      <NodeShape bg="var(--c4-color-external, #999999)" data={data} />
    </div>
  );
}

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
          background: 'var(--c4-color-person, #08427b)',
          color: 'var(--c4-color-node-text, #ffffff)',
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
