"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { AnalyzedNode } from "@/lib/graph";

// A member drawn as their photo in a ring (side color; Red's ring is dashed so it reads without color).

export type PersonData = {
  p: AnalyzedNode;
  size: number;
  color: string;
  dashed?: boolean;
  dim?: boolean;
  label?: boolean;
  badge?: string;
};
export type PersonFlowNode = Node<PersonData, "person">;

const handle = {
  left: "50%",
  top: "50%",
  width: 1,
  height: 1,
  minWidth: 0,
  minHeight: 0,
  border: 0,
  opacity: 0,
  transform: "translate(-50%, -50%)",
} as const;

export function PersonNode({ data, selected }: NodeProps<PersonFlowNode>) {
  const { p, size, color, dashed, dim, label, badge } = data;
  return (
    <div
      className="relative transition-opacity"
      style={{ width: size, height: size, opacity: dim ? 0.12 : 1 }}
      title={`@${p.username}`}
    >
      <Handle type="target" position={Position.Top} style={handle} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} style={handle} isConnectable={false} />
      <div
        className="h-full w-full overflow-hidden rounded-full bg-muted"
        style={{
          border: `${Math.max(2, size / 12)}px ${dashed ? "dashed" : "solid"} ${color}`,
          boxShadow: selected ? `0 0 0 3px var(--bg), 0 0 0 6px ${color}` : undefined,
        }}
      >
        {p.avatar && <img src={p.avatar} alt="" draggable={false} className="h-full w-full object-cover" />}
      </div>
      {badge && (
        <span className="absolute -top-1 -right-1 rounded-full bg-fg px-1 text-[9px] leading-4 font-bold text-bg">{badge}</span>
      )}
      {(label || selected) && (
        <span className="pointer-events-none absolute top-full left-1/2 mt-0.5 -translate-x-1/2 rounded bg-card/90 px-1 text-[10px] whitespace-nowrap">
          @{p.username}
        </span>
      )}
    </div>
  );
}

export const nodeTypes = { person: PersonNode };
