import { useState, useEffect } from 'react';
import {
  ReactFlow,
  Controls,
  type NodeTypes,
  type EdgeTypes,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { C4Diagram } from '@fulgas/plugin-c4-node';
import type { C4RenderOptions } from '@fulgas/plugin-c4-frontend-common';
import { dagreLayout } from './layout/dagreLayout';
import { elkLayout } from './layout/elkLayout';
import type { LayoutEngine } from './layout/types';
import { BoundaryNode, InternalNode, ExternalNode, ActorNode } from './nodes/C4NodeTypes';
import { ElkEdge } from './edges/ElkEdge';

const nodeTypes: NodeTypes = {
  boundary: BoundaryNode as any,
  internal: InternalNode as any,
  external: ExternalNode as any,
  actor: ActorNode as any,
};

// ElkEdge is registered for all engines; only used by ELK-produced edges.
const edgeTypes: EdgeTypes = {
  elk: ElkEdge as any,
};

interface Props {
  diagram: C4Diagram;
  options?: C4RenderOptions;
  layoutEngine?: LayoutEngine;
}

/** React Flow canvas for a single C4Diagram. Supports dagre and ELK layout engines. */
export function ReactFlowDiagram({ diagram, options, layoutEngine = 'elk' }: Props) {
  const [flow, setFlow] = useState<{ nodes: Node[]; edges: Edge[] } | null>(null);

  useEffect(() => {
    setFlow(null);
    const fn = layoutEngine === 'elk' ? elkLayout : dagreLayout;
    let cancelled = false;
    fn(diagram).then(result => {
      if (!cancelled) setFlow(result);
    });
    return () => { cancelled = true; };
  }, [diagram, layoutEngine]);

  return (
    <div style={{ width: '100%', height: 600 }}>
      {/* Strip React Flow's white background from every node wrapper */}
      <style>{`.react-flow__node { background: transparent !important; border: none !important; padding: 0 !important; box-shadow: none !important; }`}</style>
      <ReactFlow
        nodes={flow?.nodes ?? []}
        edges={flow?.edges ?? []}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        onNodeClick={(_e, node) => {
          if (!options?.onNodeClick) return;
          const entityRef = (node.data as any).entityRef ?? node.id;
          options.onNodeClick(entityRef);
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
