import { readFile, writeFile } from "fs/promises";
import type { Tool, Dependency } from "./lib/analyze.ts";
import { buildDependencyGraph } from "./lib/analyze.ts";

const googleTools: Tool[] = JSON.parse(
  await readFile("googlesuper_tools.json", "utf-8")
);
const githubTools: Tool[] = JSON.parse(
  await readFile("github_tools.json", "utf-8")
);

const allTools = [...googleTools, ...githubTools];
const graph: Dependency[] = buildDependencyGraph(allTools);

console.log(`Found dependencies for ${graph.length} tools`);

await writeFile("dependency_graph.json", JSON.stringify(graph, null, 2), "utf-8");
console.log("Dependency graph written to dependency_graph.json");
