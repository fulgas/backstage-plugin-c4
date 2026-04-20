import { useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { C4Diagram } from '@fulgas/plugin-c4-node';
import type { C4RenderOptions } from '@fulgas/plugin-c4-frontend-common';
import { diagramToFlow } from './diagramToFlow';
import { BoundaryNode, InternalNode, ExternalNode, ActorNode } from './nodes/C4NodeTypes';

const nodeTypes: NodeTypes = {
  boundary: BoundaryNode as any,
  internal: InternalNode as any,
  external: ExternalNode as any,
  actor: ActorNode as any,
};

interface Props {
  diagram: C4Diagram;
  options?: C4RenderOptions;
}

/** React Flow canvas for a single C4Diagram. */
export function ReactFlowDiagram({ diagram, options }: Props) {
  const { nodes, edges } = useMemo(() => diagramToFlow(diagram), [diagram]);

  return (
    <div style={{ width: '100%', height: 600 }}>
      {/* Strip the white background React Flow adds to every node wrapper */}
      <style>{`.react-flow__node { background: transparent !important; border: none !important; padding: 0 !important; box-shadow: none !important; }`}</style>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
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
