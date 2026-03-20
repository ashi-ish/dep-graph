// ─── Types ─────────────────────────────────────────────────────────────────

export type DependencyEntry = {
  tool: string;
  dependsOn: string[];
  reasons: string[];
};

export type VisNode = {
  id: string;
  label: string;
  title: string;
  color: {
    background: string;
    border: string;
    highlight: { background: string; border: string };
  };
  font: { color: string; size: number };
};

export type VisEdge = {
  from: string;
  to: string;
  title: string;
  arrows: string;
};

export type GraphStats = {
  totalNodes: number;
  totalEdges: number;
  googleNodes: number;
  githubNodes: number;
};

export function collectNodeSet(graph: DependencyEntry[]): Set<string> {
  const nodeSet = new Set<string>();
  for (const entry of graph) {
    nodeSet.add(entry.tool);
    for (const dep of entry.dependsOn) {
      nodeSet.add(dep);
    }
  }
  return nodeSet;
}

export function buildNodes(nodeSet: Set<string>): VisNode[] {
  return [...nodeSet].map((slug) => ({
    id: slug,
    label: slug.startsWith("GOOGLESUPER_")
      ? slug.replace("GOOGLESUPER_", "GS_")
      : slug.replace("GITHUB_", "GH_"),
    title: slug,
    color: {
      background: slug.startsWith("GOOGLESUPER_") ? "#4285F4" : "#238636",
      border: slug.startsWith("GOOGLESUPER_") ? "#1a73e8" : "#196127",
      highlight: {
        background: slug.startsWith("GOOGLESUPER_") ? "#74a9f5" : "#56d364",
        border: "#ffffff",
      },
    },
    font: { color: "#ffffff", size: 11 },
  }));
}

export function buildEdges(graph: DependencyEntry[]): VisEdge[] {
  const edges: VisEdge[] = [];
  for (const entry of graph) {
    for (let i = 0; i < entry.dependsOn.length; i++) {
      edges.push({
        from: entry.tool,
        to: entry.dependsOn[i]!,
        title: entry.reasons[i] ?? "",
        arrows: "to",
      });
    }
  }
  return edges;
}

export function calcStats(nodeSet: Set<string>, edges: VisEdge[]): GraphStats {
  return {
    totalNodes: nodeSet.size,
    totalEdges: edges.length,
    googleNodes: [...nodeSet].filter((s) => s.startsWith("GOOGLESUPER_")).length,
    githubNodes: [...nodeSet].filter((s) => s.startsWith("GITHUB_")).length,
  };
}
