import { readFile } from "fs/promises";

// ─── Types ─────────────────────────────────────────────────────────────────

type ToolParam = {
  type: string;
  description?: string;
  title?: string;
  properties?: Record<string, ToolParam>;
};

type Tool = {
  slug: string;
  name: string;
  description: string;
  inputParameters: {
    properties: Record<string, ToolParam>;
    required?: string[];
  };
  outputParameters: {
    properties: {
      data?: {
        properties?: Record<string, ToolParam>;
      };
    };
  };
};

type Dependency = {
  tool: string;
  dependsOn: string[];
  reasons: string[];
};

// ─── Load tools ────────────────────────────────────────────────────────────

const googleTools: Tool[] = JSON.parse(
  await readFile("googlesuper_tools.json", "utf-8")
);
const githubTools: Tool[] = JSON.parse(
  await readFile("github_tools.json", "utf-8")
);

const allTools = [...googleTools, ...githubTools];
const allSlugs = new Set(allTools.map((t) => t.slug));

// ─── Helper: extract output parameter names from a tool ────────────────────

function getOutputParamNames(tool: Tool): string[] {
  const dataProps = tool.outputParameters?.properties?.data?.properties;
  if (!dataProps) return [];
  return Object.keys(dataProps);
}

// ─── Detection 1: Explicit — slug mentioned in description ─────────────────

function findExplicitDeps(tool: Tool): { slug: string; reason: string }[] {
  const found: { slug: string; reason: string }[] = [];
  const inputProps = tool.inputParameters?.properties ?? {};

  for (const [paramName, param] of Object.entries(inputProps)) {
    const desc = param.description ?? "";

    // Look for any known tool slug mentioned inside the description
    for (const candidateSlug of allSlugs) {
      if (candidateSlug === tool.slug) continue; // skip self
      if (desc.includes(candidateSlug)) {
        found.push({
          slug: candidateSlug,
          reason: `Input param "${paramName}" description mentions ${candidateSlug}`,
        });
      }
    }
  }

  return found;
}

// ─── Detection 2: Implicit — input param name matches another tool's output ─

// Generic names that appear everywhere — matching on these creates false positives
const GENERIC_PARAMS = new Set([
  "id", "type", "name", "role", "scope", "status", "value",
  "title", "url", "path", "body", "data", "kind", "etag",
  "label", "token", "format", "action", "query", "filter"
]);

function findImplicitDeps(tool: Tool): { slug: string; reason: string }[] {
  const found: { slug: string; reason: string }[] = [];
  const requiredInputs = tool.inputParameters?.required ?? [];

  for (const requiredParam of requiredInputs) {
    // Only match on specific identifiers — skip generic words
    const isSpecific = requiredParam.endsWith("_id") ||
                       requiredParam.endsWith("_key") ||
                       requiredParam.endsWith("_token") ||
                       requiredParam.endsWith("_number") ||
                       requiredParam.endsWith("_sha");

    if (!isSpecific || GENERIC_PARAMS.has(requiredParam)) continue;

    for (const candidate of allTools) {
      if (candidate.slug === tool.slug) continue;

      const outputNames = getOutputParamNames(candidate);
      if (outputNames.includes(requiredParam)) {
        found.push({
          slug: candidate.slug,
          reason: `Required input "${requiredParam}" is produced by ${candidate.slug}`,
        });
      }
    }
  }

  return found;
}

// ─── Build the full dependency graph ───────────────────────────────────────

const graph: Dependency[] = [];

for (const tool of allTools) {
  const explicit = findExplicitDeps(tool);
  const implicit = findImplicitDeps(tool);

  // Merge, deduplicating by slug
  const seen = new Map<string, string>();
  for (const dep of [...explicit, ...implicit]) {
    if (!seen.has(dep.slug)) {
      seen.set(dep.slug, dep.reason);
    }
  }

  if (seen.size > 0) {
    graph.push({
      tool: tool.slug,
      dependsOn: [...seen.keys()],
      reasons: [...seen.values()],
    });
  }
}

console.log(`Found dependencies for ${graph.length} tools`);

import { writeFile } from "fs/promises";
await writeFile("dependency_graph.json", JSON.stringify(graph, null, 2), "utf-8");
console.log("Dependency graph written to dependency_graph.json");
