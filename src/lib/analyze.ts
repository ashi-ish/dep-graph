// ─── Types ─────────────────────────────────────────────────────────────────

export type ToolParam = {
  type: string;
  description?: string;
  title?: string;
  properties?: Record<string, ToolParam>;
};

export type Tool = {
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

export type Dependency = {
  tool: string;
  dependsOn: string[];
  reasons: string[];
};

// Generic names that appear everywhere — matching on these creates false positives
export const GENERIC_PARAMS = new Set([
  "id", "type", "name", "role", "scope", "status", "value",
  "title", "url", "path", "body", "data", "kind", "etag",
  "label", "token", "format", "action", "query", "filter"
]);

export function getOutputParamNames(tool: Tool): string[] {
  const dataProps = tool.outputParameters?.properties?.data?.properties;
  if (!dataProps) return [];
  return Object.keys(dataProps);
}

export function findExplicitDeps(
  tool: Tool,
  allSlugs: Set<string>
): { slug: string; reason: string }[] {
  const found: { slug: string; reason: string }[] = [];
  const inputProps = tool.inputParameters?.properties ?? {};

  for (const [paramName, param] of Object.entries(inputProps)) {
    const desc = param.description ?? "";

    for (const candidateSlug of allSlugs) {
      if (candidateSlug === tool.slug) continue;
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

export function findImplicitDeps(
  tool: Tool,
  allTools: Tool[]
): { slug: string; reason: string }[] {
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

export function buildDependencyGraph(allTools: Tool[]): Dependency[] {
  const allSlugs = new Set(allTools.map((t) => t.slug));
  const graph: Dependency[] = [];

  for (const tool of allTools) {
    const explicit = findExplicitDeps(tool, allSlugs);
    const implicit = findImplicitDeps(tool, allTools);

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

  return graph;
}
