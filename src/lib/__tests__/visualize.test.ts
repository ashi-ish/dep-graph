import { describe, it, expect } from "vitest";
import {
  collectNodeSet,
  buildNodes,
  buildEdges,
  calcStats,
  type DependencyEntry,
  type VisEdge,
} from "@/lib/visualize.ts";

// ─── collectNodeSet ─────────────────────────────────────────────────────────

describe("collectNodeSet", () => {
  it("collects tool slugs and their dependency slugs", () => {
    const graph: DependencyEntry[] = [
      { tool: "GITHUB_GET_REPO", dependsOn: ["GITHUB_LIST_REPOS"], reasons: ["reason"] },
    ];

    const nodeSet = collectNodeSet(graph);

    expect(nodeSet.has("GITHUB_GET_REPO")).toBe(true);
    expect(nodeSet.has("GITHUB_LIST_REPOS")).toBe(true);
    expect(nodeSet.size).toBe(2);
  });

  it("deduplicates nodes referenced multiple times", () => {
    const graph: DependencyEntry[] = [
      { tool: "GITHUB_A", dependsOn: ["GITHUB_SHARED"], reasons: ["r1"] },
      { tool: "GITHUB_B", dependsOn: ["GITHUB_SHARED"], reasons: ["r2"] },
    ];

    const nodeSet = collectNodeSet(graph);

    expect(nodeSet.size).toBe(3); // A, B, SHARED
    expect(nodeSet.has("GITHUB_SHARED")).toBe(true);
  });

  it("returns an empty set for an empty graph", () => {
    expect(collectNodeSet([])).toEqual(new Set());
  });

  it("includes nodes that only appear as dependencies (leaf nodes)", () => {
    const graph: DependencyEntry[] = [
      { tool: "GITHUB_A", dependsOn: ["GITHUB_LEAF"], reasons: ["reason"] },
    ];

    const nodeSet = collectNodeSet(graph);

    expect(nodeSet.has("GITHUB_LEAF")).toBe(true);
  });
});

// ─── buildNodes ─────────────────────────────────────────────────────────────

describe("buildNodes", () => {
  it("creates blue nodes for GOOGLESUPER_ slugs with GS_ label", () => {
    const nodeSet = new Set(["GOOGLESUPER_GMAIL_SEND_EMAIL"]);
    const nodes = buildNodes(nodeSet);

    expect(nodes).toHaveLength(1);
    const node = nodes[0]!;
    expect(node.id).toBe("GOOGLESUPER_GMAIL_SEND_EMAIL");
    expect(node.label).toBe("GS_GMAIL_SEND_EMAIL");
    expect(node.title).toBe("GOOGLESUPER_GMAIL_SEND_EMAIL");
    expect(node.color.background).toBe("#4285F4");
    expect(node.color.border).toBe("#1a73e8");
    expect(node.color.highlight.background).toBe("#74a9f5");
  });

  it("creates green nodes for GITHUB_ slugs with GH_ label", () => {
    const nodeSet = new Set(["GITHUB_LIST_REPOS"]);
    const nodes = buildNodes(nodeSet);

    expect(nodes).toHaveLength(1);
    const node = nodes[0]!;
    expect(node.id).toBe("GITHUB_LIST_REPOS");
    expect(node.label).toBe("GH_LIST_REPOS");
    expect(node.title).toBe("GITHUB_LIST_REPOS");
    expect(node.color.background).toBe("#238636");
    expect(node.color.border).toBe("#196127");
    expect(node.color.highlight.background).toBe("#56d364");
  });

  it("sets white font color and size 11 for all nodes", () => {
    const nodeSet = new Set(["GITHUB_LIST_REPOS", "GOOGLESUPER_GMAIL_SEND"]);
    const nodes = buildNodes(nodeSet);

    for (const node of nodes) {
      expect(node.font.color).toBe("#ffffff");
      expect(node.font.size).toBe(11);
    }
  });

  it("highlight border is always white", () => {
    const nodeSet = new Set(["GITHUB_A", "GOOGLESUPER_B"]);
    const nodes = buildNodes(nodeSet);

    for (const node of nodes) {
      expect(node.color.highlight.border).toBe("#ffffff");
    }
  });

  it("returns empty array for empty set", () => {
    expect(buildNodes(new Set())).toEqual([]);
  });
});

// ─── buildEdges ─────────────────────────────────────────────────────────────

describe("buildEdges", () => {
  it("creates an edge from tool to each dependency", () => {
    const graph: DependencyEntry[] = [
      {
        tool: "GITHUB_GET_REPO",
        dependsOn: ["GITHUB_LIST_REPOS"],
        reasons: ["Required input repo_id is produced by GITHUB_LIST_REPOS"],
      },
    ];

    const edges = buildEdges(graph);

    expect(edges).toHaveLength(1);
    expect(edges[0]!.from).toBe("GITHUB_GET_REPO");
    expect(edges[0]!.to).toBe("GITHUB_LIST_REPOS");
    expect(edges[0]!.title).toBe("Required input repo_id is produced by GITHUB_LIST_REPOS");
    expect(edges[0]!.arrows).toBe("to");
  });

  it("creates one edge per dependency for tools with multiple deps", () => {
    const graph: DependencyEntry[] = [
      {
        tool: "GITHUB_C",
        dependsOn: ["GITHUB_A", "GITHUB_B"],
        reasons: ["reason A", "reason B"],
      },
    ];

    const edges = buildEdges(graph);

    expect(edges).toHaveLength(2);
    expect(edges.find((e) => e.to === "GITHUB_A")!.title).toBe("reason A");
    expect(edges.find((e) => e.to === "GITHUB_B")!.title).toBe("reason B");
  });

  it("returns empty array for empty graph", () => {
    expect(buildEdges([])).toEqual([]);
  });

  it("handles multiple entries in the graph", () => {
    const graph: DependencyEntry[] = [
      { tool: "GITHUB_A", dependsOn: ["GITHUB_X"], reasons: ["r1"] },
      { tool: "GITHUB_B", dependsOn: ["GITHUB_X", "GITHUB_Y"], reasons: ["r2", "r3"] },
    ];

    const edges = buildEdges(graph);

    expect(edges).toHaveLength(3);
  });

  it("falls back to empty string title when reasons array is shorter than dependsOn", () => {
    const graph: DependencyEntry[] = [
      { tool: "GITHUB_A", dependsOn: ["GITHUB_X", "GITHUB_Y"], reasons: ["r1"] },
    ];

    const edges = buildEdges(graph);
    const edgeY = edges.find((e) => e.to === "GITHUB_Y");

    expect(edgeY!.title).toBe("");
  });
});

// ─── calcStats ──────────────────────────────────────────────────────────────

describe("calcStats", () => {
  it("counts total nodes and edges correctly", () => {
    const nodeSet = new Set(["GITHUB_A", "GITHUB_B", "GOOGLESUPER_C"]);
    const edges: VisEdge[] = [
      { from: "GITHUB_A", to: "GITHUB_B", title: "", arrows: "to" },
      { from: "GITHUB_B", to: "GOOGLESUPER_C", title: "", arrows: "to" },
    ];

    const stats = calcStats(nodeSet, edges);

    expect(stats.totalNodes).toBe(3);
    expect(stats.totalEdges).toBe(2);
  });

  it("counts Google Super nodes separately from GitHub nodes", () => {
    const nodeSet = new Set([
      "GOOGLESUPER_GMAIL_SEND",
      "GOOGLESUPER_GMAIL_LIST",
      "GITHUB_LIST_REPOS",
    ]);

    const stats = calcStats(nodeSet, []);

    expect(stats.googleNodes).toBe(2);
    expect(stats.githubNodes).toBe(1);
  });

  it("returns zeros for empty inputs", () => {
    const stats = calcStats(new Set(), []);

    expect(stats).toEqual({ totalNodes: 0, totalEdges: 0, googleNodes: 0, githubNodes: 0 });
  });

  it("counts only GOOGLESUPER_ prefix for google nodes (not partial matches)", () => {
    const nodeSet = new Set(["GOOGLESUPER_A", "GOOGLE_B", "NOTGOOGLESUPER_C"]);
    const stats = calcStats(nodeSet, []);

    expect(stats.googleNodes).toBe(1);
  });
});
