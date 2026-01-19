"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  Edge,
  Node,
  Position,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Connection,
  EdgeChange,
  NodeChange,
} from "reactflow";
import "reactflow/dist/style.css";

import { nodes as rawNodes, branchpoints } from "./data/animalia";
import TaxonNode from "./components/TaxonNode";
import BranchpointNode from "./components/BranchpointNode";

type Mode = "view" | "edit";

type SelectedBP = {
  id: string;
  label?: string;
  structure: string;
  function: string;
  from: string;
  to: string;
};

type SelectedTaxon = {
  id: string;
  labelText: string;
  rank: string;
  memo?: string;
  photos?: string[]; // dataURL(base64)
};

type Selected =
  | { kind: "taxon"; value: SelectedTaxon }
  | { kind: "branchpoint"; value: SelectedBP }
  | null;

function rankTag(rank: string) {
  switch (rank) {
    case "domain":
      return "ドメイン";
    case "kingdom":
      return "界";
    case "phylum":
      return "門";
    case "class":
      return "綱";
    case "order":
      return "目";
    case "family":
      return "科";
    case "genus":
      return "属";
    case "species":
      return "種";
    case "clade":
    default:
      return "系統";
  }
}

function rankStyle(rank: string) {
  switch (rank) {
    case "kingdom":
      return { borderWidth: 3, fontWeight: 700, padding: 10, borderRadius: 14, minWidth: 180 };
    case "phylum":
      return { borderWidth: 2, fontWeight: 700, padding: 9, borderRadius: 12, minWidth: 175 };
    case "class":
    case "order":
      return { borderWidth: 2, fontWeight: 700, padding: 8, borderRadius: 12, minWidth: 170 };
    case "family":
    case "genus":
    case "species":
      return { borderWidth: 1, fontWeight: 700, padding: 7, borderRadius: 10, minWidth: 160 };
    case "clade":
    default:
      return { borderWidth: 1, fontWeight: 700, padding: 7, borderRadius: 10, minWidth: 200 };
  }
}

const STORAGE_KEY = "bio-tree:flow:v1";

/** 初期データ（animalia.ts）から nodes/edges を組み立て（※React要素は入れない） */
function buildInitialFlow(): { nodes: Node[]; edges: Edge[] } {
  const xGap = 360;
  const yGap = 140;

  const childrenMap = new Map<string | null, string[]>();
  for (const n of rawNodes as any[]) {
    const arr = childrenMap.get(n.parent) ?? [];
    arr.push(n.id);
    childrenMap.set(n.parent, arr);
  }

  const depthMap = new Map<string, number>();
  function dfs(id: string, depth: number) {
    depthMap.set(id, depth);
    const kids = childrenMap.get(id) ?? [];
    for (const k of kids) dfs(k, depth + 1);
  }
  dfs("animalia", 0);

  const countPerDepth = new Map<number, number>();
  const order = new Map<string, number>();
  for (const n of rawNodes as any[]) {
    const d = depthMap.get(n.id) ?? 0;
    const c = countPerDepth.get(d) ?? 0;
    order.set(n.id, c);
    countPerDepth.set(d, c + 1);
  }

  const baseNodes: Node[] = (rawNodes as any[]).map((n) => {
    const d = depthMap.get(n.id) ?? 0;
    const idx = order.get(n.id) ?? 0;

    return {
      id: n.id,
      type: "taxon",
      position: { x: d * xGap, y: idx * yGap },
      data: { kind: "taxon", rank: n.rank, labelText: n.label, memo: "", photos: [] },
      style: { background: "white", borderStyle: "solid", borderColor: "#111", ...rankStyle(n.rank) },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
  });

  const pos = new Map<string, { x: number; y: number }>();
  for (const n of baseNodes) pos.set(n.id, n.position);

  const bpNodes: Node[] = (branchpoints as any[]).map((bp) => {
    const p = pos.get(bp.from);
    const c = pos.get(bp.to);
    const px = p?.x ?? 0;
    const py = p?.y ?? 0;
    const cx = c?.x ?? px + xGap;
    const cy = c?.y ?? py;

    const t = 0.33;
    const x = px + (cx - px) * t;
    const y = py + (cy - py) * t;

    return {
      id: bp.id,
      type: "branchpoint",
      position: { x, y },
      data: { kind: "branchpoint", bp },
      style: {
        width: 24,
        height: 24,
        borderRadius: 999,
        border: "2px solid #111",
        background: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
  });

  const edges: Edge[] = [];
  for (const n of rawNodes as any[]) {
    if (!n.parent) continue;

    const bp = (branchpoints as any[]).find((b) => b.from === n.parent && b.to === n.id);
    if (bp) {
      edges.push(
        { id: `${n.parent}-${bp.id}`, source: n.parent, target: bp.id, type: "smoothstep", style: { stroke: "#111", strokeWidth: 2 } },
        { id: `${bp.id}-${n.id}`, source: bp.id, target: n.id, type: "smoothstep", style: { stroke: "#111", strokeWidth: 2 } }
      );
    } else {
      edges.push({ id: `${n.parent}-${n.id}`, source: n.parent, target: n.id, type: "smoothstep", style: { stroke: "#111", strokeWidth: 2 } });
    }
  }

  return { nodes: [...baseNodes, ...bpNodes], edges };
}

function downloadJson(filename: string, obj: unknown) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toSavableNodes(ns: Node[]) {
  return ns.map((n) => {
    const data = { ...(n.data as any) };
    delete data.label;
    return { ...n, data };
  });
}

function PageInner() {
  const [mode, setMode] = useState<Mode>("view");
  const [selected, setSelected] = useState<Selected>(null);
  const [jsonText, setJsonText] = useState("");

  const [selectedIds, setSelectedIds] = useState<{ nodes: string[]; edges: string[] }>({
    nodes: [],
    edges: [],
  });

  const initial = useMemo(() => buildInitialFlow(), []);
  const [nodes, setNodes] = useState<Node[]>(initial.nodes);
  const [edges, setEdges] = useState<Edge[]>(initial.edges);

  /** ✅ 遅延対策：nodeTypes を固定（毎レンダーで新オブジェクトを作らない） */
  const nodeTypes = useMemo(() => {
    return { taxon: TaxonNode, branchpoint: BranchpointNode };
  }, []);

  const normalizeNodes = useCallback(
    (ns: Node[]) =>
      ns.map((n) => {
        const data: any = { ...(n.data as any) };

        if (data.kind === "taxon") {
          const rank = data.rank ?? "clade";
          return {
            ...n,
            type: "taxon",
            data: {
              ...data,
              labelText: data.labelText ?? "（名称）",
              memo: data.memo ?? "",
              photos: Array.isArray(data.photos) ? data.photos : [],
              rankTag: rankTag(rank),
              editable: mode === "edit",
            },
          };
        }

        if (data.kind === "branchpoint") {
          return {
            ...n,
            type: "branchpoint",
            data: { ...data, editable: mode === "edit" },
          };
        }

        return n;
      }),
    [mode]
  );

  const ensureEdges = useCallback(
    (eds: any) => (Array.isArray(eds) && eds.length > 0 ? (eds as Edge[]) : initial.edges),
    [initial.edges]
  );

  /** 起動時：localStorageから復元 */
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      setNodes((prev) => normalizeNodes(prev));
      setEdges(initial.edges);
      return;
    }

    try {
      const parsed = JSON.parse(saved);
      const savedNodes = Array.isArray(parsed?.nodes) ? parsed.nodes : null;
      const savedEdges = Array.isArray(parsed?.edges) ? parsed.edges : null;

      setNodes(savedNodes ? normalizeNodes(savedNodes) : (prev) => normalizeNodes(prev));
      setEdges(ensureEdges(savedEdges));
    } catch {
      setNodes((prev) => normalizeNodes(prev));
      setEdges(initial.edges);
    }
  }, [normalizeNodes, initial.edges, ensureEdges]);

  /** modeが変わったら editable を付け替える */
  useEffect(() => {
    setNodes((prev) => normalizeNodes(prev));
  }, [mode, normalizeNodes]);

  /** 保存（edges空で保存しない / もし空なら復旧） */
  useEffect(() => {
    try {
      const safeEdges = ensureEdges(edges);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes: toSavableNodes(nodes), edges: safeEdges }));
      if (safeEdges !== edges) setEdges(safeEdges);
    } catch {}
  }, [nodes, edges, ensureEdges]);

  /** 選択状態の更新（無限ループ防止） */
  const onSelectionChange = useCallback((params: { nodes: Node[]; edges: Edge[] }) => {
    const nextNodes = params.nodes.map((n) => n.id).sort();
    const nextEdges = params.edges.map((e) => e.id).sort();

    setSelectedIds((prev) => {
      const sameNodes =
        prev.nodes.length === nextNodes.length && prev.nodes.every((id, i) => id === nextNodes[i]);
      const sameEdges =
        prev.edges.length === nextEdges.length && prev.edges.every((id, i) => id === nextEdges[i]);
      if (sameNodes && sameEdges) return prev;
      return { nodes: nextNodes, edges: nextEdges };
    });
  }, []);

  /** ✅ 遅延対策：クリック/タップで即 selectedIds を更新（パネルがすぐ反応） */
  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedIds({ nodes: [node.id], edges: [] });
  }, []);

  /** 右ペインは「選択ID→nodesから引き直し」で作る（モード切替でも安定） */
  useEffect(() => {
    const id = selectedIds.nodes[0];
    if (!id) {
      setSelected(null);
      return;
    }

    const node = nodes.find((n) => n.id === id);
    if (!node) {
      setSelected(null);
      return;
    }

    if (node.data?.kind === "taxon") {
      const d: any = node.data;
      setSelected({
        kind: "taxon",
        value: {
          id: node.id,
          labelText: d.labelText ?? "（名称）",
          rank: d.rank ?? "clade",
          memo: d.memo ?? "",
          photos: Array.isArray(d.photos) ? d.photos : [],
        },
      });
      return;
    }

    if (node.data?.kind === "branchpoint") {
      const bp: any = node.data.bp ?? {};
      setSelected({
        kind: "branchpoint",
        value: {
          id: node.id,
          label: bp.label ?? "",
          structure: bp.structure ?? "",
          function: bp.function ?? "",
          from: bp.from ?? "",
          to: bp.to ?? "",
        },
      });
      return;
    }

    setSelected(null);
  }, [selectedIds.nodes, nodes]);

  /** 編集時のみ有効：位置移動など */
  const onNodesChange = (changes: NodeChange[]) => {
    if (mode !== "edit") return;
    setNodes((nds) => applyNodeChanges(changes, nds));
  };

  const onEdgesChange = (changes: EdgeChange[]) => {
    if (mode !== "edit") return;
    setEdges((eds) => applyEdgeChanges(changes, eds));
  };

  const onConnect = (connection: Connection) => {
    if (mode !== "edit") return;
    setEdges((eds) =>
      addEdge({ ...connection, type: "smoothstep", style: { stroke: "#111", strokeWidth: 2 } }, eds)
    );
  };

  /** ✅ 削除（選択中のノード/線） */
  const deleteSelected = useCallback(() => {
    if (mode !== "edit") return;

    setNodes((nds) => nds.filter((n) => !selectedIds.nodes.includes(n.id)));

    setEdges((eds) =>
      eds.filter(
        (e) =>
          !selectedIds.edges.includes(e.id) &&
          !selectedIds.nodes.includes(e.source) &&
          !selectedIds.nodes.includes(e.target)
      )
    );

    setSelected(null);
    setSelectedIds({ nodes: [], edges: [] });
  }, [mode, selectedIds.nodes, selectedIds.edges]);

  /** ✅ Delete/Backspaceキーで削除（PC向け） */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (mode !== "edit") return;
      if (e.key !== "Delete" && e.key !== "Backspace") return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;

      deleteSelected();
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode, deleteSelected]);

  /** Taxon編集：右ペイン入力→nodesへ反映（memo/photosも含む） */
  const updateSelectedTaxon = useCallback(
    (patch: Partial<SelectedTaxon>) => {
      const id = patch.id ?? (selected?.kind === "taxon" ? selected.value.id : "");
      if (!id) return;

      setNodes((nds) =>
        normalizeNodes(
          nds.map((n) => {
            if (n.id !== id) return n;
            const data: any = { ...(n.data as any) };
            if (data.kind !== "taxon") return n;

            const nextLabel = patch.labelText ?? data.labelText ?? "（名称）";
            const nextRank = patch.rank ?? data.rank ?? "clade";
            const nextMemo = patch.memo ?? data.memo ?? "";
            const nextPhotos = patch.photos ?? (Array.isArray(data.photos) ? data.photos : []);

            return {
              ...n,
              data: {
                ...data,
                labelText: nextLabel,
                rank: nextRank,
                memo: nextMemo,
                photos: nextPhotos,
                rankTag: rankTag(nextRank),
              },
              style: {
                ...(n.style ?? {}),
                background: "white",
                borderStyle: "solid",
                borderColor: "#111",
                ...rankStyle(nextRank),
              },
            };
          })
        )
      );
    },
    [normalizeNodes, selected]
  );

  /** Branchpoint編集：右ペイン入力→nodesへ反映 */
  const updateSelectedBP = useCallback(
    (patch: Partial<SelectedBP>) => {
      const id = patch.id ?? (selected?.kind === "branchpoint" ? selected.value.id : "");
      if (!id) return;

      setNodes((nds) =>
        normalizeNodes(
          nds.map((n) => {
            if (n.id !== id) return n;
            const data: any = { ...(n.data as any) };
            if (data.kind !== "branchpoint") return n;

            const bp = { ...(data.bp ?? {}) };
            bp.id = id;
            if (patch.label !== undefined) bp.label = patch.label;
            if (patch.structure !== undefined) bp.structure = patch.structure;
            if (patch.function !== undefined) bp.function = patch.function;
            if (patch.from !== undefined) bp.from = patch.from;
            if (patch.to !== undefined) bp.to = patch.to;

            return { ...n, data: { ...data, bp } };
          })
        )
      );
    },
    [normalizeNodes, selected]
  );

  const resetToInitial = () => {
    localStorage.removeItem(STORAGE_KEY);
    setNodes(normalizeNodes(initial.nodes));
    setEdges(initial.edges);
    setSelected(null);
    setSelectedIds({ nodes: [], edges: [] });
  };

  const exportJson = () => {
    downloadJson("bio-tree-flow.json", { nodes: toSavableNodes(nodes), edges: ensureEdges(edges) });
  };

  const importJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed?.nodes || !parsed?.edges) {
        alert('JSONの形式が違います。{ "nodes":[...], "edges":[...] } の形にしてください。');
        return;
      }
      setNodes(normalizeNodes(parsed.nodes));
      setEdges(ensureEdges(parsed.edges));
      setSelected(null);
      setSelectedIds({ nodes: [], edges: [] });
      setJsonText("");
    } catch {
      alert("JSONが正しくありません（カンマ抜け等）。");
    }
  };

  const addTaxonNode = () => {
    if (mode !== "edit") return;
    const id = `taxon_${Date.now()}`;
    const newNode: Node = {
      id,
      type: "taxon",
      position: { x: 100, y: 100 },
      data: { kind: "taxon", rank: "clade", labelText: "新しいノード", memo: "", photos: [] },
      style: { background: "white", borderStyle: "solid", borderColor: "#111", ...rankStyle("clade") },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
    setNodes((nds) => normalizeNodes([...nds, newNode]));
  };

  const addBranchPointNode = () => {
    if (mode !== "edit") return;
    const id = `bp_${Date.now()}`;
    const newNode: Node = {
      id,
      type: "branchpoint",
      position: { x: 200, y: 200 },
      data: {
        kind: "branchpoint",
        bp: { id, label: "分岐点", structure: "（構造）", function: "（機能）", from: "", to: "" },
      },
      style: {
        width: 24,
        height: 24,
        borderRadius: 999,
        border: "2px solid #111",
        background: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
    setNodes((nds) => normalizeNodes([...nds, newNode]));
  };

  return (
    <div className="flex h-screen w-screen">
      <div className="flex-1 relative">
        <div className="absolute z-10 left-3 top-3 flex gap-2 rounded-xl border bg-white/95 p-2">
          <button
            className={`px-3 py-2 rounded-lg border text-sm ${mode === "view" ? "font-bold" : ""}`}
            onClick={() => setMode("view")}
          >
            閲覧
          </button>
          <button
            className={`px-3 py-2 rounded-lg border text-sm ${mode === "edit" ? "font-bold" : ""}`}
            onClick={() => setMode("edit")}
          >
            編集
          </button>

          <div className="w-px bg-black/20 mx-1" />

          <button className="px-3 py-2 rounded-lg border text-sm" onClick={exportJson}>
            JSON書き出し
          </button>
          <button className="px-3 py-2 rounded-lg border text-sm" onClick={resetToInitial}>
            初期に戻す
          </button>

          {mode === "edit" && (
            <>
              <div className="w-px bg-black/20 mx-1" />
              <button className="px-3 py-2 rounded-lg border text-sm" onClick={addTaxonNode}>
                ノード追加
              </button>
              <button className="px-3 py-2 rounded-lg border text-sm" onClick={addBranchPointNode}>
                分岐点追加
              </button>
              <button
                className="px-3 py-2 rounded-lg border text-sm"
                onClick={deleteSelected}
                disabled={selectedIds.nodes.length === 0 && selectedIds.edges.length === 0}
              >
                選択を削除
              </button>
            </>
          )}
        </div>

        <div className="absolute z-10 right-3 top-3 rounded-xl border bg-white/95 px-3 py-2 text-xs">
          iPhone操作：
          <br />
          1本指=移動 / 2本指=ズーム
          {mode === "edit" ? (
            <>
              <br />
              ノード端の点からドラッグで線追加
            </>
          ) : null}
        </div>

        <div className="h-full w-full" style={{ touchAction: "none" }}>
          <ReactFlow
            nodes={nodes}
            edges={ensureEdges(edges)}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.1}
            maxZoom={2.5}
            panOnScroll
            zoomOnPinch
            zoomOnScroll={false}
            selectNodesOnDrag={false}
            nodesDraggable={mode === "edit"}
            nodesConnectable={mode === "edit"}
            edgesUpdatable={mode === "edit"}
            elementsSelectable
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={mode === "edit" ? onConnect : undefined}
            onSelectionChange={onSelectionChange}
            onNodeClick={onNodeClick}
            onPaneClick={() => setSelectedIds({ nodes: [], edges: [] })}
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
      </div>

      <aside className="w-[380px] border-l bg-white p-4 overflow-auto">
        <div className="text-base font-bold mb-2">パネル</div>

        <div className="mb-4 text-sm leading-relaxed">
          <div className="font-bold mb-1">凡例</div>
          <ul className="list-disc pl-5">
            <li>角丸ノード：分類群（界・門・綱・目・科・属・種・系統）</li>
            <li>●：分岐点（獲得形質）</li>
            <li>左→右：進化の流れ（時間）</li>
            <li>上下：配置の都合（時間ではない）</li>
          </ul>
          <div className="mt-2 text-xs text-black/70">
            iPhone：1本指=移動、2本指=ズーム。
            <br />
            編集モード：端の小点からドラッグで線追加／「選択を削除」で削除。
          </div>
        </div>

        {selected ? (
          selected.kind === "taxon" ? (
            <div className="text-sm leading-relaxed mb-6">
              <div className="font-bold mb-2">分類群ノード</div>

              {mode === "edit" ? (
                <>
                  <div className="mb-3">
                    <div className="font-bold mb-1">名前</div>
                    <input
                      className="w-full border rounded-lg px-2 py-2 text-sm"
                      value={selected.value.labelText}
                      onChange={(e) =>
                        updateSelectedTaxon({ id: selected.value.id, labelText: e.target.value })
                      }
                    />
                  </div>

                  <div className="mb-3">
                    <div className="font-bold mb-1">ランク</div>
                    <select
                      className="w-full border rounded-lg px-2 py-2 text-sm"
                      value={selected.value.rank}
                      onChange={(e) => updateSelectedTaxon({ id: selected.value.id, rank: e.target.value })}
                    >
                      <option value="domain">domain（ドメイン）</option>
                      <option value="kingdom">kingdom（界）</option>
                      <option value="phylum">phylum（門）</option>
                      <option value="class">class（綱）</option>
                      <option value="order">order（目）</option>
                      <option value="family">family（科）</option>
                      <option value="genus">genus（属）</option>
                      <option value="species">species（種）</option>
                      <option value="clade">clade（系統）</option>
                    </select>
                  </div>

                  <div className="mb-3">
                    <div className="font-bold mb-1">メモ</div>
                    <textarea
                      className="w-full h-28 border rounded-lg p-2 text-sm"
                      value={selected.value.memo ?? ""}
                      onChange={(e) => updateSelectedTaxon({ id: selected.value.id, memo: e.target.value })}
                    />
                  </div>

                  <div className="mb-3">
                    <div className="font-bold mb-1">写真</div>

                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="w-full text-sm"
                      onChange={async (e) => {
                        const files = Array.from(e.target.files ?? []);
                        if (files.length === 0) return;

                        const toDataUrl = (file: File) =>
                          new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(String(reader.result));
                            reader.onerror = reject;
                            reader.readAsDataURL(file);
                          });

                        const urls = await Promise.all(files.map(toDataUrl));
                        const current = selected.value.photos ?? [];
                        updateSelectedTaxon({ id: selected.value.id, photos: [...current, ...urls] });

                        e.currentTarget.value = "";
                      }}
                    />

                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {(selected.value.photos ?? []).map((src, idx) => (
                        <div key={idx} className="border rounded-lg p-1">
                          <img src={src} className="w-full h-24 object-cover rounded" />
                          <button
                            className="mt-1 w-full px-2 py-1 border rounded text-xs"
                            onClick={() => {
                              const arr = [...(selected.value.photos ?? [])];
                              arr.splice(idx, 1);
                              updateSelectedTaxon({ id: selected.value.id, photos: arr });
                            }}
                          >
                            この写真を削除
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="mt-2 text-xs text-black/60">
                      ※写真はこの端末のブラウザ内に保存されます（容量が大きいと保存できないことがあります）
                    </div>
                  </div>

                  <button
                    className="mt-2 w-full px-3 py-2 rounded-lg border text-sm"
                    onClick={() => {
                      setSelectedIds((prev) => ({ ...prev, nodes: [selected.value.id], edges: [] }));
                      setTimeout(() => deleteSelected(), 0);
                    }}
                  >
                    このノードを削除
                  </button>
                </>
              ) : (
                <>
                  <div className="mb-2">
                    <span className="font-bold">名前：</span>
                    {selected.value.labelText}
                  </div>
                  <div className="mb-2">
                    <span className="font-bold">ランク：</span>
                    {selected.value.rank}（{rankTag(selected.value.rank)}）
                  </div>

                  {selected.value.memo ? (
                    <div className="mb-3">
                      <div className="font-bold">メモ</div>
                      <div className="mt-1 whitespace-pre-wrap">{selected.value.memo}</div>
                    </div>
                  ) : null}

                  {(selected.value.photos ?? []).length > 0 ? (
                    <div className="mb-3">
                      <div className="font-bold">写真</div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {(selected.value.photos ?? []).map((src, idx) => (
                          <img key={idx} src={src} className="w-full h-24 object-cover rounded border" />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : (
            <div className="text-sm leading-relaxed mb-6">
              <div className="font-bold mb-2">
                {selected.value.label ? `分岐点：${selected.value.label}` : "分岐点"}
              </div>

              {mode === "edit" ? (
                <>
                  <div className="mb-3">
                    <div className="font-bold mb-1">ラベル</div>
                    <input
                      className="w-full border rounded-lg px-2 py-2 text-sm"
                      value={selected.value.label ?? ""}
                      onChange={(e) => updateSelectedBP({ id: selected.value.id, label: e.target.value })}
                    />
                  </div>

                  <div className="mb-3">
                    <div className="font-bold mb-1">構造</div>
                    <textarea
                      className="w-full h-24 border rounded-lg p-2 text-sm"
                      value={selected.value.structure}
                      onChange={(e) =>
                        updateSelectedBP({ id: selected.value.id, structure: e.target.value })
                      }
                    />
                  </div>

                  <div className="mb-3">
                    <div className="font-bold mb-1">機能</div>
                    <textarea
                      className="w-full h-24 border rounded-lg p-2 text-sm"
                      value={selected.value.function}
                      onChange={(e) =>
                        updateSelectedBP({ id: selected.value.id, function: e.target.value })
                      }
                    />
                  </div>

                  <button
                    className="mt-2 w-full px-3 py-2 rounded-lg border text-sm"
                    onClick={() => {
                      setSelectedIds((prev) => ({ ...prev, nodes: [selected.value.id], edges: [] }));
                      setTimeout(() => deleteSelected(), 0);
                    }}
                  >
                    この分岐点を削除
                  </button>
                </>
              ) : (
                <>
                  <div className="mb-3">
                    <div className="font-bold">構造</div>
                    <div className="mt-1 whitespace-pre-wrap">{selected.value.structure}</div>
                  </div>
                  <div className="mb-3">
                    <div className="font-bold">機能</div>
                    <div className="mt-1 whitespace-pre-wrap">{selected.value.function}</div>
                  </div>
                </>
              )}
            </div>
          )
        ) : (
          <div className="text-sm mb-6">ノード（角丸）または ● をタップすると詳細が表示されます。</div>
        )}

        <div className="border-t pt-4">
          <div className="font-bold mb-2 text-sm">JSON読み込み（貼り付け）</div>
          <textarea
            className="w-full h-32 border rounded-lg p-2 text-xs"
            placeholder='{"nodes":[...],"edges":[...]} を貼り付け'
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
          />
          <button className="mt-2 px-3 py-2 rounded-lg border text-sm" onClick={importJson}>
            読み込む
          </button>
        </div>
      </aside>
    </div>
  );
}

export default function Page() {
  return (
    <ReactFlowProvider>
      <PageInner />
    </ReactFlowProvider>
  );
}
