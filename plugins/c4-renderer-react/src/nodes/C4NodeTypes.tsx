import React from 'react';
import { Handle, Position } from '@xyflow/react';

const BASE: React.CSSProperties = {
  fontFamily: 'sans-serif',
  borderRadius: 6,
  padding: '10px 14px',
  width: 180,           // matches NODE_W in c4Style.ts — dagre and render agree
  boxSizing: 'border-box',
  textAlign: 'center',
  fontSize: 13,
  position: 'relative',
};

const LABEL: React.CSSProperties = {
  fontWeight: 600,
  whiteSpace: 'nowrap',    // name never breaks
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const DESC: React.CSSProperties = {
  fontSize: 11,
  marginTop: 4,
  opacity: 0.85,
  whiteSpace: 'normal',    // description wraps
  lineHeight: 1.4,
};

const TECH: React.CSSProperties = {
  fontSize: 10,
  opacity: 0.75,
  marginTop: 2,
  fontStyle: 'italic',
  whiteSpace: 'nowrap',
};

/** Hidden handles on all 4 sides so edges can exit/enter from the correct side. */
function AllHandles() {
  const s: React.CSSProperties = { opacity: 0, width: 8, height: 8 };
  return (
    <>
      <Handle id="s-top"    type="source" position={Position.Top}    style={s} />
      <Handle id="s-right"  type="source" position={Position.Right}  style={s} />
      <Handle id="s-bottom" type="source" position={Position.Bottom} style={s} />
      <Handle id="s-left"   type="source" position={Position.Left}   style={s} />
      <Handle id="t-top"    type="target" position={Position.Top}    style={s} />
      <Handle id="t-right"  type="target" position={Position.Right}  style={s} />
      <Handle id="t-bottom" type="target" position={Position.Bottom} style={s} />
      <Handle id="t-left"   type="target" position={Position.Left}   style={s} />
    </>
  );
}

/** The subject boundary box — wraps internal nodes visually. */
export function BoundaryNode({ data }: { data: any }) {
  return (
    <div style={{
      border: '2px dashed #aaa',
      borderRadius: 8,
      background: 'rgba(255,255,255,0.6)',
      minWidth: data.width ?? 200,
      minHeight: data.height ?? 120,
      position: 'relative',
    }}>
      <AllHandles />
      {/* Title sits above the content; nowrap ensures it never breaks mid-word */}
      <div style={{
        padding: '6px 12px 4px',
        fontSize: 11, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: 1,
        whiteSpace: 'nowrap',
        borderBottom: '1px dashed #ccc',
      }}>
        {data.label}
      </div>
    </div>
  );
}

/** Internal node — a system or container inside the boundary. */
export function InternalNode({ data }: { data: any }) {
  const bg = data.subType === 'database' ? '#0b6e4f' : '#1168bd';
  return (
    <div style={{ ...BASE, background: bg, color: '#fff', border: 'none' }}>
      <AllHandles />
      <div style={LABEL}>{data.label}</div>
      {data.technology && <div style={TECH}>[{data.technology}]</div>}
      {data.description && <div style={DESC}>{data.description}</div>}
    </div>
  );
}

/** External node — a system or container outside the boundary. */
export function ExternalNode({ data }: { data: any }) {
  return (
    <div style={{ ...BASE, background: '#999', color: '#fff', border: 'none' }}>
      <AllHandles />
      <div style={LABEL}>{data.label}</div>
      {data.technology && <div style={TECH}>[{data.technology}]</div>}
      {data.description && <div style={DESC}>{data.description}</div>}
    </div>
  );
}

/** Actor node — a person or group outside the boundary. */
export function ActorNode({ data }: { data: any }) {
  return (
    <div style={{ ...BASE, background: '#08427b', color: '#fff', border: 'none', borderRadius: 24 }}>
      <AllHandles />
      <div style={{ fontSize: 18, marginBottom: 4 }}>👤</div>
      <div style={LABEL}>{data.label}</div>
      {data.description && <div style={DESC}>{data.description}</div>}
    </div>
  );
}
