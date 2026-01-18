import React from "react";
import { Handle, Position, NodeProps } from "reactflow";

export default function TaxonNode({ data }: NodeProps<any>) {
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
    <div className="text-sm">
      {/* ラベル */}
      <div className="text-sm">
        <span className="mr-2 border rounded-full px-2 py-0.5 text-xs">
          {data?.rankTag ?? "系統"}
        </span>
        {data?.labelText ?? "（名称）"}
      </div>

      {/* ★重要：閲覧モードでもHandleは存在させる */}
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
