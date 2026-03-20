import { describe, it, expect } from "vitest";
import {
  getOutputParamNames,
  findExplicitDeps,
  findImplicitDeps,
  buildDependencyGraph,
  GENERIC_PARAMS,
  type Tool,
} from "@/lib/analyze.ts";

function makeTool(override: Partial<Tool> & { slug: string }): Tool {
  return {
    name: override.slug,
    description: "",
    inputParameters: { properties: {}, required: [] },
    outputParameters: { properties: {} },
    ...override,
  };
}

// ─── getOutputParamNames ────────────────────────────────────────────────────

describe("getOutputParamNames", () => {
  it("returns keys from outputParameters.properties.data.properties", () => {
    const tool = makeTool({
      slug: "GITHUB_GET_REPO",
      outputParameters: {
        properties: {
          data: {
            properties: {
              repo_id: { type: "string" },
              repo_name: { type: "string" },
              default_branch: { type: "string" },
            },
          },
        },
      },
    });

    expect(getOutputParamNames(tool)).toEqual(["repo_id", "repo_name", "default_branch"]);
  });

  it("returns empty array when data has no properties", () => {
    const tool = makeTool({
      slug: "GITHUB_GET_REPO",
      outputParameters: { properties: { data: {} } },
    });

    expect(getOutputParamNames(tool)).toEqual([]);
  });

  it("returns empty array when data is absent", () => {
    const tool = makeTool({
      slug: "GITHUB_GET_REPO",
      outputParameters: { properties: {} },
    });

    expect(getOutputParamNames(tool)).toEqual([]);
  });
});

// ─── findExplicitDeps ───────────────────────────────────────────────────────

describe("findExplicitDeps", () => {
  it("finds a dependency when a tool slug appears in a parameter description", () => {
    const allSlugs = new Set(["GMAIL_LIST_THREADS", "GMAIL_REPLY_TO_THREAD"]);
    const tool = makeTool({
      slug: "GMAIL_REPLY_TO_THREAD",
      inputParameters: {
        properties: {
          thread_id: {
            type: "string",
            description: "The thread_id from GMAIL_LIST_THREADS response",
          },
        },
      },
    });

    const deps = findExplicitDeps(tool, allSlugs);

    expect(deps).toHaveLength(1);
    expect(deps[0]!.slug).toBe("GMAIL_LIST_THREADS");
    expect(deps[0]!.reason).toContain("thread_id");
    expect(deps[0]!.reason).toContain("GMAIL_LIST_THREADS");
  });

  it("skips self-references", () => {
    const allSlugs = new Set(["GMAIL_SEND_EMAIL"]);
    const tool = makeTool({
      slug: "GMAIL_SEND_EMAIL",
      inputParameters: {
        properties: {
          subject: {
            type: "string",
            description: "Use GMAIL_SEND_EMAIL to send the email",
          },
        },
      },
    });

    expect(findExplicitDeps(tool, allSlugs)).toEqual([]);
  });

  it("returns empty when no slug appears in any description", () => {
    const allSlugs = new Set(["GITHUB_LIST_REPOS", "GITHUB_CREATE_ISSUE"]);
    const tool = makeTool({
      slug: "GITHUB_CREATE_ISSUE",
      inputParameters: {
        properties: {
          title: { type: "string", description: "Title of the issue" },
          body: { type: "string", description: "Body of the issue" },
        },
      },
    });

    expect(findExplicitDeps(tool, allSlugs)).toEqual([]);
  });

  it("finds multiple slugs across different parameters", () => {
    const allSlugs = new Set([
      "GITHUB_LIST_REPOS",
      "GITHUB_LIST_ISSUES",
      "GITHUB_CREATE_COMMENT",
    ]);
    const tool = makeTool({
      slug: "GITHUB_CREATE_COMMENT",
      inputParameters: {
        properties: {
          repo_id: {
            type: "string",
            description: "repo_id from GITHUB_LIST_REPOS",
          },
          issue_number: {
            type: "number",
            description: "issue_number from GITHUB_LIST_ISSUES",
          },
        },
      },
    });

    const deps = findExplicitDeps(tool, allSlugs);
    const slugs = deps.map((d) => d.slug);

    expect(slugs).toContain("GITHUB_LIST_REPOS");
    expect(slugs).toContain("GITHUB_LIST_ISSUES");
    expect(slugs).not.toContain("GITHUB_CREATE_COMMENT");
  });

  it("returns empty when allSlugs is empty", () => {
    const tool = makeTool({
      slug: "GITHUB_CREATE_ISSUE",
      inputParameters: {
        properties: {
          body: { type: "string", description: "GITHUB_LIST_REPOS" },
        },
      },
    });

    expect(findExplicitDeps(tool, new Set())).toEqual([]);
  });
});

// ─── findImplicitDeps ───────────────────────────────────────────────────────

describe("findImplicitDeps", () => {
  it("matches a required _id param to a tool that outputs it", () => {
    const producer = makeTool({
      slug: "GITHUB_LIST_REPOS",
      outputParameters: {
        properties: { data: { properties: { repo_id: { type: "string" } } } },
      },
    });
    const consumer = makeTool({
      slug: "GITHUB_GET_REPO",
      inputParameters: { properties: {}, required: ["repo_id"] },
    });

    const deps = findImplicitDeps(consumer, [producer, consumer]);

    expect(deps).toHaveLength(1);
    expect(deps[0]!.slug).toBe("GITHUB_LIST_REPOS");
    expect(deps[0]!.reason).toContain("repo_id");
  });

  it("matches _key, _token, _number, and _sha suffixes", () => {
    const suffixCases = ["api_key", "auth_token", "issue_number", "commit_sha"] as const;

    for (const param of suffixCases) {
      const producer = makeTool({
        slug: "GITHUB_PRODUCER",
        outputParameters: {
          properties: { data: { properties: { [param]: { type: "string" } } } },
        },
      });
      const consumer = makeTool({
        slug: "GITHUB_CONSUMER",
        inputParameters: { properties: {}, required: [param] },
      });

      const deps = findImplicitDeps(consumer, [producer, consumer]);
      expect(deps.map((d) => d.slug)).toContain("GITHUB_PRODUCER");
    }
  });

  it("does not match params without a specific suffix", () => {
    const producer = makeTool({
      slug: "GITHUB_LIST_REPOS",
      outputParameters: {
        properties: { data: { properties: { repository: { type: "string" } } } },
      },
    });
    const consumer = makeTool({
      slug: "GITHUB_GET_REPO",
      inputParameters: { properties: {}, required: ["repository"] },
    });

    expect(findImplicitDeps(consumer, [producer, consumer])).toEqual([]);
  });

  it("does not match params in GENERIC_PARAMS", () => {
    for (const genericParam of GENERIC_PARAMS) {
      const producer = makeTool({
        slug: "GITHUB_PRODUCER",
        outputParameters: {
          properties: { data: { properties: { [genericParam]: { type: "string" } } } },
        },
      });
      const consumer = makeTool({
        slug: "GITHUB_CONSUMER",
        inputParameters: { properties: {}, required: [genericParam] },
      });

      // Generic params don't end in _id/_key/etc so they're filtered by isSpecific check
      expect(findImplicitDeps(consumer, [producer, consumer])).toEqual([]);
    }
  });

  it("skips self-reference", () => {
    const tool = makeTool({
      slug: "GITHUB_GET_REPO",
      inputParameters: { properties: {}, required: ["repo_id"] },
      outputParameters: {
        properties: { data: { properties: { repo_id: { type: "string" } } } },
      },
    });

    expect(findImplicitDeps(tool, [tool])).toEqual([]);
  });

  it("returns empty when no required inputs", () => {
    const producer = makeTool({
      slug: "GITHUB_LIST_REPOS",
      outputParameters: {
        properties: { data: { properties: { repo_id: { type: "string" } } } },
      },
    });
    const consumer = makeTool({
      slug: "GITHUB_GET_REPO",
      inputParameters: { properties: {}, required: [] },
    });

    expect(findImplicitDeps(consumer, [producer, consumer])).toEqual([]);
  });

  it("returns empty when no tool produces the required param", () => {
    const irrelevant = makeTool({
      slug: "GITHUB_LIST_REPOS",
      outputParameters: {
        properties: { data: { properties: { other_id: { type: "string" } } } },
      },
    });
    const consumer = makeTool({
      slug: "GITHUB_GET_REPO",
      inputParameters: { properties: {}, required: ["repo_id"] },
    });

    expect(findImplicitDeps(consumer, [irrelevant, consumer])).toEqual([]);
  });
});

// ─── buildDependencyGraph ───────────────────────────────────────────────────

describe("buildDependencyGraph", () => {
  it("builds a graph with correct structure", () => {
    const producer = makeTool({
      slug: "GITHUB_LIST_REPOS",
      outputParameters: {
        properties: { data: { properties: { repo_id: { type: "string" } } } },
      },
    });
    const consumer = makeTool({
      slug: "GITHUB_GET_REPO",
      inputParameters: { properties: {}, required: ["repo_id"] },
    });

    const graph = buildDependencyGraph([producer, consumer]);

    expect(graph).toHaveLength(1);
    expect(graph[0]!.tool).toBe("GITHUB_GET_REPO");
    expect(graph[0]!.dependsOn).toContain("GITHUB_LIST_REPOS");
  });

  it("excludes tools with no dependencies", () => {
    const standalone = makeTool({ slug: "GITHUB_LIST_REPOS" });
    const graph = buildDependencyGraph([standalone]);
    expect(graph).toHaveLength(0);
  });

  it("deduplicates when explicit and implicit detect the same dependency", () => {
    const producer = makeTool({
      slug: "GMAIL_LIST_THREADS",
      outputParameters: {
        properties: { data: { properties: { thread_id: { type: "string" } } } },
      },
    });
    const consumer = makeTool({
      slug: "GMAIL_REPLY_TO_THREAD",
      inputParameters: {
        properties: {
          thread_id: {
            type: "string",
            description: "The thread_id from GMAIL_LIST_THREADS",
          },
        },
        required: ["thread_id"],
      },
    });

    const graph = buildDependencyGraph([producer, consumer]);
    const entry = graph.find((e) => e.tool === "GMAIL_REPLY_TO_THREAD");

    expect(entry).toBeDefined();
    // Duplicate slug should appear only once in dependsOn
    const count = entry!.dependsOn.filter((d) => d === "GMAIL_LIST_THREADS").length;
    expect(count).toBe(1);
    expect(entry!.dependsOn.length).toBe(entry!.reasons.length);
  });

  it("first-seen reason wins on deduplication", () => {
    // Explicit dep is found first, then implicit — explicit reason should be kept
    const producer = makeTool({
      slug: "GMAIL_LIST_THREADS",
      outputParameters: {
        properties: { data: { properties: { thread_id: { type: "string" } } } },
      },
    });
    const consumer = makeTool({
      slug: "GMAIL_REPLY_TO_THREAD",
      inputParameters: {
        properties: {
          thread_id: {
            type: "string",
            description: "Use thread_id from GMAIL_LIST_THREADS",
          },
        },
        required: ["thread_id"],
      },
    });

    const graph = buildDependencyGraph([producer, consumer]);
    const entry = graph.find((e) => e.tool === "GMAIL_REPLY_TO_THREAD");
    const reason = entry!.reasons[entry!.dependsOn.indexOf("GMAIL_LIST_THREADS")];

    // Explicit reason mentions the param description
    expect(reason).toContain("mentions");
  });

  it("handles empty tools array", () => {
    expect(buildDependencyGraph([])).toEqual([]);
  });

  it("dependsOn and reasons arrays have equal length", () => {
    const a = makeTool({
      slug: "GITHUB_A",
      outputParameters: { properties: { data: { properties: { a_id: { type: "string" } } } } },
    });
    const b = makeTool({
      slug: "GITHUB_B",
      outputParameters: { properties: { data: { properties: { b_id: { type: "string" } } } } },
    });
    const consumer = makeTool({
      slug: "GITHUB_C",
      inputParameters: { properties: {}, required: ["a_id", "b_id"] },
    });

    const graph = buildDependencyGraph([a, b, consumer]);
    const entry = graph.find((e) => e.tool === "GITHUB_C");

    expect(entry).toBeDefined();
    expect(entry!.dependsOn.length).toBe(entry!.reasons.length);
  });
});
