import { readFile, writeFile } from "fs/promises";
import type { DependencyEntry } from "./lib/visualize.ts";
import { collectNodeSet, buildNodes, buildEdges, calcStats } from "./lib/visualize.ts";

const graph: DependencyEntry[] = JSON.parse(
  await readFile("dependency_graph.json", "utf-8")
);

const nodeSet = collectNodeSet(graph);
const nodes = buildNodes(nodeSet);
const edges = buildEdges(graph);
const stats = calcStats(nodeSet, edges);

// Read vis.js from local node_modules — reliable, no network needed
const visJsSource = await readFile(
  "node_modules/vis-network/standalone/umd/vis-network.min.js",
  "utf-8"
);

// ─── Generate HTML ─────────────────────────────────────────────────────────

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Tool Dependency Graph</title>
  <script>VISJS_PLACEHOLDER</script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0d1117; color: #c9d1d9; height: 100vh; display: flex; flex-direction: column; }

    header { padding: 12px 20px; background: #161b22; border-bottom: 1px solid #30363d; display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
    header h1 { font-size: 16px; font-weight: 600; color: #f0f6fc; }

    .stats { display: flex; gap: 16px; font-size: 12px; }
    .stat { background: #21262d; padding: 4px 10px; border-radius: 20px; border: 1px solid #30363d; }
    .stat span { font-weight: 600; color: #58a6ff; }

    .controls { display: flex; gap: 8px; align-items: center; margin-left: auto; }
    .controls input { background: #21262d; border: 1px solid #30363d; color: #c9d1d9; padding: 5px 10px; border-radius: 6px; font-size: 12px; width: 220px; }
    .controls input:focus { outline: none; border-color: #58a6ff; }
    .controls button { background: #21262d; border: 1px solid #30363d; color: #c9d1d9; padding: 5px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; }
    .controls button:hover { background: #30363d; }
    .controls button.active { background: #1f6feb; border-color: #388bfd; color: #fff; }

    .legend { display: flex; gap: 12px; font-size: 12px; }
    .legend-item { display: flex; align-items: center; gap: 6px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; }

    main { flex: 1; display: flex; overflow: hidden; }
    #network { flex: 1; }

    #info-panel { width: 300px; background: #161b22; border-left: 1px solid #30363d; padding: 16px; overflow-y: auto; font-size: 13px; }
    #info-panel h2 { font-size: 14px; font-weight: 600; color: #f0f6fc; margin-bottom: 12px; }
    #info-panel .tool-slug { font-family: monospace; font-size: 11px; color: #58a6ff; word-break: break-all; margin-bottom: 12px; padding: 6px 8px; background: #0d1117; border-radius: 4px; }
    #info-panel .section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; color: #8b949e; margin: 12px 0 6px; letter-spacing: 0.5px; }
    #info-panel .dep-item { padding: 6px 8px; background: #0d1117; border-radius: 4px; margin-bottom: 4px; font-size: 11px; font-family: monospace; color: #79c0ff; }
    #info-panel .dep-item .reason { color: #8b949e; font-family: sans-serif; font-size: 11px; margin-top: 2px; }
    #info-panel .empty { color: #8b949e; font-style: italic; }
  </style>
</head>
<body>

<header>
  <h1>Tool Dependency Graph</h1>
  <div class="stats">
    <div class="stat">Nodes: <span>${stats.totalNodes}</span></div>
    <div class="stat">Edges: <span>${stats.totalEdges}</span></div>
    <div class="stat">Google Super: <span>${stats.googleNodes}</span></div>
    <div class="stat">GitHub: <span>${stats.githubNodes}</span></div>
  </div>
  <div class="legend">
    <div class="legend-item"><div class="dot" style="background:#4285F4"></div>Google Super</div>
    <div class="legend-item"><div class="dot" style="background:#238636"></div>GitHub</div>
  </div>
  <div class="controls">
    <input id="search" type="text" placeholder="Search tool (e.g. GMAIL, REPO)..." />
    <button id="btn-gs" class="active" onclick="toggleFilter('gs')">Google Super</button>
    <button id="btn-gh" class="active" onclick="toggleFilter('gh')">GitHub</button>
    <button onclick="network.fit()">Reset View</button>
  </div>
</header>

<main>
  <div id="network"></div>
  <div id="info-panel">
    <h2>Click a node to inspect</h2>
    <div class="empty">Select any tool node to see its dependencies.</div>
  </div>
</main>

<script>
  const ALL_NODES = ${JSON.stringify(nodes)};
  const ALL_EDGES = ${JSON.stringify(edges)};
  const GRAPH = ${JSON.stringify(graph)};

  let showGs = true, showGh = true;

  const container = document.getElementById("network");
  const nodesDS = new vis.DataSet(ALL_NODES);
  const edgesDS = new vis.DataSet(ALL_EDGES);

  const options = {
    physics: {
      solver: "forceAtlas2Based",
      forceAtlas2Based: { gravitationalConstant: -50, springLength: 100, springConstant: 0.05 },
      stabilization: { iterations: 150 }
    },
    edges: {
      color: { color: "#30363d", highlight: "#58a6ff" },
      smooth: { type: "continuous" },
      width: 1.2,
    },
    nodes: { shape: "dot", size: 14, borderWidth: 1.5 },
    interaction: { hover: true, tooltipDelay: 200 },
  };

  const network = new vis.Network(container, { nodes: nodesDS, edges: edgesDS }, options);

  // ── Click handler: show info panel ──
  network.on("click", (params) => {
    if (params.nodes.length === 0) return;
    const slug = params.nodes[0];
    const entry = GRAPH.find((e) => e.tool === slug);
    const panel = document.getElementById("info-panel");

    const toolkit = slug.startsWith("GOOGLESUPER_") ? "Google Super" : "GitHub";
    let html = \`<h2>\${toolkit}</h2><div class="tool-slug">\${slug}</div>\`;

    if (entry && entry.dependsOn.length > 0) {
      html += \`<div class="section-title">Depends On (\${entry.dependsOn.length})</div>\`;
      entry.dependsOn.forEach((dep, i) => {
        html += \`<div class="dep-item">\${dep}<div class="reason">\${entry.reasons[i]}</div></div>\`;
      });
    } else {
      html += \`<div class="section-title">Dependencies</div><div class="empty">No dependencies detected (leaf node)</div>\`;
    }

    // Also show what tools depend on THIS tool
    const dependents = GRAPH.filter((e) => e.dependsOn.includes(slug));
    if (dependents.length > 0) {
      html += \`<div class="section-title">Required By (\${dependents.length})</div>\`;
      dependents.forEach((e) => {
        html += \`<div class="dep-item">\${e.tool}</div>\`;
      });
    }

    panel.innerHTML = html;
  });

  // ── Search ──
  document.getElementById("search").addEventListener("input", (e) => {
    const q = e.target.value.trim().toUpperCase();
    nodesDS.forEach((node) => {
      const match = !q || node.id.includes(q);
      nodesDS.update({ id: node.id, opacity: match ? 1.0 : 0.08 });
    });
  });

  // ── Toolkit filter ──
  function toggleFilter(which) {
    if (which === 'gs') { showGs = !showGs; document.getElementById('btn-gs').classList.toggle('active', showGs); }
    if (which === 'gh') { showGh = !showGh; document.getElementById('btn-gh').classList.toggle('active', showGh); }

    const visible = ALL_NODES.filter((n) => {
      if (n.id.startsWith("GOOGLESUPER_") && !showGs) return false;
      if (n.id.startsWith("GITHUB_") && !showGh) return false;
      return true;
    });

    const visibleIds = new Set(visible.map((n) => n.id));
    nodesDS.clear(); edgesDS.clear();
    nodesDS.add(visible);
    edgesDS.add(ALL_EDGES.filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to)));
  }
</script>
</body>
</html>`;

const finalHtml = html.split("VISJS_PLACEHOLDER").join(visJsSource);

await writeFile("graph.html", finalHtml, "utf-8");
console.log(`Graph generated: graph.html`);
console.log(`  ${stats.totalNodes} nodes, ${stats.totalEdges} edges`);
