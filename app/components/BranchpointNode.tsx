import React from "react";
import { Handle, Position, NodeProps } from "reactflow";

export default function BranchpointNode({ data }: NodeProps<any>) {
  const editable = !!data?.editable;

  const handleStyle = {
    width: 10,
    height: 10,
    border: "2px solid #111",
    background: "white",
    opacity: editable ? 1 : 0,
    pointerEvents: editable ? "auto" : "none",
  } as React.CSSProperties;

  return (
    <div className="text-xs font-bold leading-none select-none">
      ●
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={editable}
        style={handleStyle}
      />
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={editable}
        style={handleStyle}
      />
    </div>
  );
}
