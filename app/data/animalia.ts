export type Rank = "kingdom" | "clade" | "phylum" | "class";

export type TreeNode = {
  id: string;
  parent: string | null;
  label: string;
  rank: Rank;
};

export type BranchPoint = {
  id: string;
  from: string;
  to: string;
  structure: string;
  function: string;
  label?: string; // 例：真正組織、左右相称など（任意）
};

export const nodes: TreeNode[] = [
  { id: "animalia", parent: null, label: "動物界", rank: "kingdom" },

  { id: "porifera", parent: "animalia", label: "海綿動物門", rank: "phylum" },

  { id: "eumetazoa", parent: "animalia", label: "真正後生動物（組織）", rank: "clade" },
  { id: "cnidaria", parent: "eumetazoa", label: "刺胞動物門", rank: "phylum" },

  { id: "bilateria", parent: "eumetazoa", label: "左右相称動物", rank: "clade" },
  { id: "platyhelminthes", parent: "bilateria", label: "扁形動物門", rank: "phylum" },
  { id: "chordata", parent: "bilateria", label: "脊索動物門", rank: "phylum" },
];

export const branchpoints: BranchPoint[] = [
  {
    id: "bp_bilateral",
    from: "animalia",
    to: "bilateria",
    label: "左右相称",
    structure: "左右相称の体制",
    function: "一方向的運動・頭部集中",
  },
  {
    id: "bp_arth",
    from: "bilateria",
    to: "arthropoda",
    label: "関節肢",
    structure: "外骨格・関節肢",
    function: "陸上進出・高い運動性能",
  },
  {
    id: "bp_chord",
    from: "bilateria",
    to: "chordata",
    label: "脊索",
    structure: "脊索",
    function: "支持構造の獲得",
  },
];
