# Tool Dependency Graph — Complete Study Guide
### Knowledge Transfer Document: Senior Developer → Junior Developer

---

## Table of Contents

1. [What Was the Assessment?](#1-what-was-the-assessment)
2. [What is a Dependency Graph?](#2-what-is-a-dependency-graph)
3. [Project Structure](#3-project-structure)
4. [Tech Stack Explained](#4-tech-stack-explained)
5. [Step-by-Step Walkthrough](#5-step-by-step-walkthrough)
   - [Step 1: Environment Setup](#step-1-environment-setup)
   - [Step 2: Fetching Tool Data (src/index.ts)](#step-2-fetching-tool-data)
   - [Step 3: Analyzing Dependencies (src/analyze.ts)](#step-3-analyzing-dependencies)
   - [Step 4: Visualization (src/visualize.ts)](#step-4-visualization)
6. [Problems We Faced & How We Solved Them](#6-problems-we-faced--how-we-solved-them)
7. [Deep Dive: Every Function Explained](#7-deep-dive-every-function-explained)
8. [Software Engineering Principles Applied](#8-software-engineering-principles-applied)
9. [Key Concepts Glossary](#9-key-concepts-glossary)
10. [How to Re-run the Project from Scratch](#10-how-to-re-run-the-project-from-scratch)

---

## 1. What Was the Assessment?

**The problem statement (in plain English):**

When an AI agent wants to perform an action — like replying to a Gmail thread — it first needs certain data. For example, to reply to a thread, it needs a `thread_id`. That `thread_id` can only be obtained by first calling another tool: `GMAIL_LIST_THREADS`.

This creates a **dependency**: Tool A cannot run until Tool B has run first and provided the required data.

The assessment asked us to:
1. Fetch all tools from the **Google Super** and **GitHub** toolkits using the [Composio](https://composio.dev) API
2. Analyze the tool schemas to detect which tools depend on other tools
3. Build a **dependency graph** data structure
4. **Visualize** the graph so that a human can see all the connections

**Real-world relevance:** This is exactly the kind of problem that AI orchestration platforms like LangGraph, AutoGen, and Composio itself need to solve. Before an agent executes a task, it must know the execution order — which tools need to run first.

---

## 2. What is a Dependency Graph?

A **graph** in computer science consists of:
- **Nodes** (also called vertices) — the "things"
- **Edges** — the connections between things

A **dependency graph** is a directed graph where an edge from A → B means "A depends on B" (B must happen before A).

```
GMAIL_REPLY_TO_THREAD  ──────depends on──────▶  GMAIL_LIST_THREADS
        (Tool A)                                       (Tool B)
     needs thread_id                           produces thread_id
```

**Real-world analogy:** Think of it like a construction project:
- You can't paint walls (Tool A) until you've built them (Tool B)
- You can't build walls (Tool B) until you've laid the foundation (Tool C)
- This gives you a chain: C → B → A

**Key terms:**
- **Leaf node**: A tool that has no dependencies (it can run on its own)
- **Hub node**: A tool that many other tools depend on (produces widely-used data)
- **Edge**: The arrow showing "this tool depends on that tool"
- **Directed**: Arrows have a direction — dependencies only go one way

---

## 3. Project Structure

```
dep-graph/
├── src/
│   ├── index.ts          → Step 1: Fetch raw tool schemas from Composio API
│   ├── analyze.ts        → Step 2: Detect dependencies, build graph JSON
│   └── visualize.ts      → Step 3: Generate interactive HTML visualization
│
├── googlesuper_tools.json → Raw tool data for Google Super (429 tools) [generated]
├── github_tools.json      → Raw tool data for GitHub (866 tools) [generated]
├── dependency_graph.json  → Detected dependencies (211 tools) [generated]
├── graph.html             → Final interactive visualization [generated]
│
├── package.json           → Project metadata and dependencies
├── tsconfig.json          → TypeScript configuration
├── scaffold.sh            → Script to get API keys
├── upload.sh              → Submission script
└── readme.md              → Original assessment brief
```

**The pipeline is linear:**
```
index.ts  ──▶  analyze.ts  ──▶  visualize.ts
  (fetch)        (analyze)         (render)
```

Each script reads the output of the previous one. This is the **Unix philosophy**: small programs that do one thing well and chain together.

---

## 4. Tech Stack Explained

### TypeScript
TypeScript is JavaScript with **type annotations**. Instead of:
```javascript
function getNames(tools) { ... }  // JS — no idea what 'tools' is
```
We write:
```typescript
function getNames(tools: Tool[]): string[] { ... }  // TS — explicitly typed
```
The TypeScript compiler catches bugs at **compile time** (before running) rather than at **runtime** (after deploying).

### Bun
[Bun](https://bun.sh) is a modern JavaScript/TypeScript runtime — similar to Node.js but significantly faster. Key advantages:
- Runs TypeScript **natively** (no compilation step needed)
- Built-in `.env` file support
- Much faster package installation

### Composio SDK (`@composio/core`)
Composio is a platform that provides 1,000+ pre-built tool integrations for AI agents. Their SDK gives us access to all tool schemas via `getRawComposioTools()`.

### vis.js Network
A JavaScript library for rendering interactive network graphs in the browser. It handles all the physics simulation, drag-and-drop, zoom, and click events.

---

## 5. Step-by-Step Walkthrough

### Step 1: Environment Setup

**What we did:**
1. Installed [Bun](https://bun.sh) as our runtime
2. Ran `scaffold.sh` to get our API keys (Composio + OpenRouter)
3. Ran `bun init -y` to initialize the project
4. Ran `bun add @composio/core` to install the Composio SDK

**What `scaffold.sh` does:**
```bash
COMPOSIO_API_KEY=PUT_YOUR_KEY_HERE sh scaffold.sh
```
This script:
1. Takes your Composio API key from the environment variable
2. Calls the Composio hiring API to get a free OpenRouter API key
3. Writes both keys to a `.env` file so your code can use them

**The `.env` file:**
```
COMPOSIO_API_KEY=your_composio_key
OPENROUTER_API_KEY=your_openrouter_key
```
Environment variables are used to store secrets. You never hardcode API keys in source code because:
- They could be committed to git and leaked publicly
- Different environments (dev, prod) need different keys

**PATH issue we hit:**
After installing Bun, the terminal showed `zsh: command not found: bun`. This happened because:
- Bun's installer added its path to `~/.zshrc` (for future sessions)
- But our **current terminal session** had already loaded its PATH before the install

**Fix:**
```bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
```
This patches the PATH only for the current session. Future terminals automatically pick it up from `~/.zshrc`.

---

### Step 2: Fetching Tool Data

**File:** `src/index.ts`

```typescript
import { Composio } from "@composio/core";
import { writeFile } from "fs/promises";

const composio = new Composio();

// Fetch Google Super tools
const googleSuperTools = await composio.tools.getRawComposioTools({
  toolkits: ["googlesuper"],
  limit: 1000,
});

await writeFile(
  "googlesuper_tools.json",
  JSON.stringify(googleSuperTools, null, 2),
  "utf-8"
);
console.log(`Google Super: ${googleSuperTools.length} tools written to googlesuper_tools.json`);

// Fetch GitHub tools
const githubTools = await composio.tools.getRawComposioTools({
  toolkits: ["github"],
  limit: 1000,
});

await writeFile(
  "github_tools.json",
  JSON.stringify(githubTools, null, 2),
  "utf-8"
);
console.log(`GitHub: ${githubTools.length} tools written to github_tools.json`);
```

**Result:** 429 Google Super tools + 866 GitHub tools = **1,295 tools total**

**What each tool looks like (the data structure):**
```json
{
  "slug": "GOOGLESUPER_ACL_DELETE",
  "name": "Delete ACL Rule",
  "description": "Deletes an access control rule from a Google Calendar...",
  "inputParameters": {
    "type": "object",
    "properties": {
      "rule_id": {
        "type": "string",
        "description": "ACL rule identifier. use GOOGLECALENDAR_LIST_ACL_RULES to find valid IDs.",
        "examples": ["user:test@example.com"]
      },
      "calendar_id": {
        "type": "string",
        "description": "Calendar identifier. To retrieve calendar IDs call the calendarList.list method.",
        "examples": ["primary"]
      }
    },
    "required": ["calendar_id", "rule_id"]
  },
  "outputParameters": {
    "type": "object",
    "properties": {
      "data": {
        "properties": {
          "id": { "type": "string", "description": "Identifier of the ACL rule." },
          "etag": { "type": "string" },
          "role": { "type": "string" },
          "scope": { "type": "object" }
        }
      },
      "successful": { "type": "boolean" },
      "error": { "type": "string" }
    }
  }
}
```

**Key insight from this structure:**
- `inputParameters.properties` → what the tool **needs** to run
- `inputParameters.required` → which inputs are **mandatory**
- `outputParameters.properties.data.properties` → what the tool **produces**
- The `description` fields often literally tell you which other tool to call first!

**Why we write to JSON files first:**
- So we don't hit the API on every run (API calls are slow and can be rate-limited)
- So we can inspect the data manually in any text editor
- So the analyze and visualize steps can run offline without any API dependency
- This is called **caching** — storing results so you don't recompute them

---

### Step 3: Analyzing Dependencies

**File:** `src/analyze.ts`

This is the most important file — it contains all the intelligence for detecting tool dependencies.

**Result:** 211 tools with detected dependencies, 634 dependency edges

#### The Two Detection Strategies

We used two complementary approaches:

**Strategy 1 — Explicit Detection:**
Some tool descriptions literally name the other tool to call first.
```
rule_id description: "use GOOGLECALENDAR_LIST_ACL_RULES to find valid IDs"
                             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                             This is another tool's slug!
```
We scan every input parameter's description text looking for known tool slugs.

**Strategy 2 — Implicit Detection:**
If Tool A requires `calendar_id` as input, and Tool B outputs `calendar_id` in its data — then A implicitly depends on B.
```
Tool A inputParameters.required: ["calendar_id"]
Tool B outputParameters.data.properties: { "calendar_id": {...} }
                                              ^^^^^^^^^^^
                                              Match! A depends on B.
```
We match required input parameter names against output parameter names of all other tools.

---

### Step 4: Visualization

**File:** `src/visualize.ts`

This script reads `dependency_graph.json` and generates a single self-contained `graph.html` file.

**The pipeline:**
```
dependency_graph.json
        ↓
  Extract all unique slugs → Nodes (248 total)
  Map each dependency → Edges (634 total)
  Read vis.js from node_modules
  Combine into HTML template
        ↓
    graph.html
```

**Final result:**
- 248 nodes (tools)
- 634 edges (dependency arrows)
- Blue nodes = Google Super
- Green nodes = GitHub
- Interactive: click, drag, zoom, search, filter

---

## 6. Problems We Faced & How We Solved Them

### Problem 1: `bun: command not found` after installation

**What happened:** Bun installed successfully but the terminal couldn't find it.

**Root cause:** The shell's `PATH` variable is loaded once when the terminal opens. Installing Bun added its directory to `~/.zshrc`, but our current terminal session had already loaded its PATH before the install happened.

**Fix:** Manually export the PATH for the current session:
```bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
```

**Lesson:** Environment variables and shell config changes only take effect in new sessions, or when you explicitly `source` the config file. This is a very common gotcha for new developers.

---

### Problem 2: Too many false positives in dependency detection (1006 → 211)

**What happened:** Our first version of `findImplicitDeps` matched on ANY parameter name. Generic words like `role`, `scope`, `type`, and `name` appeared as output fields in dozens of unrelated tools — creating 1006 noisy dependency matches.

**Example of noise:**
```
GOOGLESUPER_ACL_INSERT depends on 8 tools just because they all output "role"
```
`role` is so generic (string value like "admin", "reader") that it could come from anywhere. This isn't a real dependency.

**Fix:** Only match on **specific identifiers** — parameter names ending in `_id`, `_key`, `_token`, `_number`, or `_sha`. These are domain-specific references that almost always mean "you need to fetch this from another tool."

```typescript
const isSpecific = requiredParam.endsWith("_id") ||
                   requiredParam.endsWith("_key") ||
                   requiredParam.endsWith("_token") ||
                   requiredParam.endsWith("_number") ||
                   requiredParam.endsWith("_sha");
```

**Result:** 1006 noisy matches → 211 high-quality matches.

**Lesson:** In data analysis and detection systems, **precision beats recall** when you want a useful result. A smaller set of highly confident matches is more valuable than a large set with noise.

---

### Problem 3: CDN script blocked in `file://` protocol

**What happened:** We tried to load vis.js from a CDN URL in the HTML:
```html
<script src="https://cdnjs.cloudflare.com/...vis-network.min.js"></script>
```
Chrome blocked it when the file was opened via `file://` protocol. The error was:
```
Unsafe attempt to load URL file:///... from frame with URL file://...
```

**Root cause:** Chrome treats `file://` as a unique security origin and blocks cross-origin requests (including CDN loads) from local HTML files.

**First attempted fix:** Fetch vis.js source at build time and embed it inline.

**New problem:** The fetch returned an HTML error page instead of JavaScript (CDN call failed during script execution). This caused:
```
Uncaught SyntaxError: Unexpected token '<'
```
The `<` was the start of the HTML error page being interpreted as JavaScript.

**Final fix:** Install vis-network as a proper npm/bun package and read it from `node_modules`:
```typescript
const visJsSource = await readFile(
  "node_modules/vis-network/standalone/umd/vis-network.min.js",
  "utf-8"
);
```

**Lesson:** Always prefer local package dependencies over CDN fetches in build scripts. CDNs can fail silently. `node_modules` is deterministic — always there, always the same version.

---

### Problem 4: Template literal broken by vis.js source code

**What happened:** When embedding vis.js inside a JavaScript template literal (backtick string), the vis.js minified source code contained backtick characters that prematurely closed the template literal, causing a syntax error.

**The trap:**
```typescript
const html = `
  <script>${visJsSource}</script>  // ← vis.js contains ` characters!
`;                                  // ← this backtick closes template early
```

**Fix:** Use a placeholder string and `split().join()` for safe injection:
```typescript
// In template: use a placeholder
const html = `<script>VISJS_PLACEHOLDER</script>`;

// After template: safely inject (no special character interpretation)
const finalHtml = html.split("VISJS_PLACEHOLDER").join(visJsSource);
```

**Why not `.replace()`?**
`String.replace()` interprets `$` in the replacement string specially (e.g., `$1`, `$$`, `$&`). vis.js uses `$` extensively. `.split().join()` does a **literal** substitution with zero interpretation.

**Lesson:** When injecting arbitrary content into strings, never use methods that interpret special characters. `.split().join()` is the safest string substitution pattern in JavaScript.

---

### Problem 5: HTTP 413 — Submission zip too large

**What happened:** The upload script failed with:
```
Error: Submission failed (HTTP 413) — Request Entity Too Large
```

**Root cause:** The zip file included `github_tools.json` (~8MB) and `googlesuper_tools.json` (~4MB) — large generated data files that aren't source code.

**Fix:** Temporarily move the generated data files out before uploading:
```bash
mv github_tools.json /tmp/github_tools.json
mv googlesuper_tools.json /tmp/googlesuper_tools.json
sh upload.sh your@email.com
mv /tmp/github_tools.json .
mv /tmp/googlesuper_tools.json .
```

**Lesson:** Generated/derived data files should not be part of submissions or git commits. Only source code and essential output deliverables belong in a submission. This is also why `.gitignore` exists — to prevent committing build artifacts.

---

### Problem 6: VSCode showing "Unexpected keyword or identifier" in graph.html

**What happened:** After generating `graph.html`, VSCode showed red syntax errors throughout the file.

**Root cause:** This was a **false alarm**. VSCode's TypeScript/JavaScript language service was trying to validate the 500,000+ character minified vis.js code embedded inline, and got confused by minified patterns. The browser had no such issue.

**Fix:** Ignore editor warnings on generated HTML files with embedded minified libraries. The browser is the only runtime that matters for HTML files.

**Lesson:** Your editor's static analysis is helpful but imperfect. Always test in the actual runtime environment (browser, Node, etc.) — not just by looking at editor highlights.

---

## 7. Deep Dive: Every Function Explained

### `src/analyze.ts`

#### Types Section

```typescript
type ToolParam = {
  type: string;
  description?: string;
  title?: string;
  properties?: Record<string, ToolParam>;
};
```
**What it is:** A TypeScript type that describes a single parameter (input or output) of a tool.

**Breaking it down:**
- `type: string` — the data type e.g. `"string"`, `"object"`, `"boolean"`
- `description?: string` — the `?` means optional. May or may not have a description.
- `properties?: Record<string, ToolParam>` — if type is `"object"`, it has nested properties. `Record<string, ToolParam>` means "an object where every key is a string and every value is a ToolParam". Notice it references itself — this is a **recursive type**, needed because JSON schemas can be nested arbitrarily deep.

```typescript
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
```
**What it is:** Describes a complete Composio tool.

**Breaking it down:**
- `slug` — unique machine-readable ID, e.g. `"GOOGLESUPER_ACL_DELETE"`
- `name` — human-readable name, e.g. `"Delete ACL Rule"`
- `inputParameters.properties` — map of all possible input fields
- `inputParameters.required` — list of field names that MUST be provided
- `outputParameters.properties.data.properties` — the actual output fields the tool returns (nested under `data`)

```typescript
type Dependency = {
  tool: string;
  dependsOn: string[];
  reasons: string[];
};
```
**What it is:** The shape of one entry in our output `dependency_graph.json`.

**Breaking it down:**
- `tool` — the slug of the tool that HAS a dependency
- `dependsOn` — array of slugs this tool depends on
- `reasons` — parallel array explaining WHY each dependency exists (same index = same dependency)

---

#### Loading and Merging Data

```typescript
const googleTools: Tool[] = JSON.parse(
  await readFile("googlesuper_tools.json", "utf-8")
);
const githubTools: Tool[] = JSON.parse(
  await readFile("github_tools.json", "utf-8")
);

const allTools = [...googleTools, ...githubTools];
const allSlugs = new Set(allTools.map((t) => t.slug));
```

**`await readFile("file.json", "utf-8")`** — reads the file from disk asynchronously and returns its contents as a UTF-8 string. The `await` keyword pauses execution until the file is fully read (non-blocking I/O).

**`JSON.parse(...)`** — converts the JSON string into a JavaScript object/array.

**`: Tool[]`** — TypeScript type annotation saying "this variable is an array of Tool objects". The compiler will warn you if you try to access a property that doesn't exist on `Tool`.

**`[...googleTools, ...githubTools]`** — the spread operator (`...`) unpacks both arrays and merges them into one. This is equivalent to `googleTools.concat(githubTools)` but more modern.

**`new Set(allTools.map((t) => t.slug))`** — creates a Set of all tool slugs.
- `Set` is a data structure that only holds **unique values** (no duplicates)
- We use it here so we can do O(1) lookup: `allSlugs.has("SOME_SLUG")` is instant, regardless of how many tools there are
- If we used an array instead, checking `allSlugs.includes(slug)` would be O(n) — slow

---

#### `getOutputParamNames(tool: Tool): string[]`

```typescript
function getOutputParamNames(tool: Tool): string[] {
  const dataProps = tool.outputParameters?.properties?.data?.properties;
  if (!dataProps) return [];
  return Object.keys(dataProps);
}
```

**Purpose:** Given a tool, returns the list of field names it produces as output.

**The `?.` operator (Optional Chaining):** Each `?.` means "if the left side is null or undefined, stop and return undefined instead of throwing an error". Without it, accessing `.properties` on a null `outputParameters` would crash.

**Example:**
```
tool = GOOGLESUPER_ACL_GET
outputParameters.properties.data.properties = {
  "id": {...},
  "etag": {...},
  "role": {...},
  "scope": {...}
}
→ returns ["id", "etag", "role", "scope"]
```

**`Object.keys(obj)`** — returns an array of all the property names (keys) of an object.

**Why `data` specifically?** All Composio tools wrap their actual output inside a `data` field. The top-level output also has `successful` (boolean) and `error` (string) — these are always the same and are not real tool outputs.

---

#### `findExplicitDeps(tool: Tool)`

```typescript
function findExplicitDeps(tool: Tool): { slug: string; reason: string }[] {
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
```

**Purpose:** Finds dependencies that are **explicitly mentioned** in tool descriptions.

**`?? {}`** — the Nullish Coalescing operator. "If the left side is null/undefined, use `{}` instead." This prevents crashes if a tool has no inputParameters.

**`Object.entries(inputProps)`** — returns an array of `[key, value]` pairs from an object. We destructure each pair as `[paramName, param]`.

**The nested loop logic:**
```
For each input parameter of the current tool:
  Get its description text
  For each known tool slug in the entire system:
    If that slug appears anywhere in the description text:
      Record this as a dependency
```

**Example:**
```
tool = GOOGLESUPER_ACL_GET
paramName = "rule_id"
desc = "...use GOOGLECALENDAR_LIST_ACL_RULES to find valid IDs..."
candidateSlug = "GOOGLECALENDAR_LIST_ACL_RULES"
desc.includes(candidateSlug) → true ✓ → dependency found!
```

**Time complexity:** O(tools × params × slugs). With 1295 tools and ~1295 slugs, the worst case is ~1.7M string searches. In practice it's fast because most tools have few params.

---

#### `GENERIC_PARAMS` constant

```typescript
const GENERIC_PARAMS = new Set([
  "id", "type", "name", "role", "scope", "status", "value",
  "title", "url", "path", "body", "data", "kind", "etag",
  "label", "token", "format", "action", "query", "filter"
]);
```

**Purpose:** A blocklist of parameter names too generic to be meaningful for dependency matching.

**Why these specifically?**
- `id` — almost every tool outputs something called `id`, but a generic `id` doesn't tell you where it comes from
- `role` — hundreds of tools produce a `role` field (admin, reader, writer) — they're all different concepts
- `name`, `type`, `status` — same problem — universal words that mean different things in different contexts

**Using `Set` instead of `Array`:** `GENERIC_PARAMS.has("role")` is O(1). `GENERIC_PARAMS.includes("role")` on an array would be O(n). For a blocklist that's checked thousands of times, this matters.

---

#### `findImplicitDeps(tool: Tool)`

```typescript
function findImplicitDeps(tool: Tool): { slug: string; reason: string }[] {
  const found: { slug: string; reason: string }[] = [];
  const requiredInputs = tool.inputParameters?.required ?? [];

  for (const requiredParam of requiredInputs) {
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
```

**Purpose:** Finds dependencies by matching **required input names** against **output field names** of other tools.

**`requiredInputs`:** We only check `required` fields — not optional ones. If a field is optional, you don't necessarily need another tool to provide it. Required fields are the hard constraints.

**`isSpecific` check:**
- `calendar_id` → ends with `_id` ✓ → specific
- `pull_number` → ends with `_number` ✓ → specific
- `commit_sha` → ends with `_sha` ✓ → specific
- `role` → doesn't end with any suffix → skip
- `name` → doesn't end with any suffix → skip

**`continue` keyword:** Skips the rest of the current loop iteration and moves to the next one. It's like saying "this one doesn't qualify, move on."

**Why only `required` and not all inputs?**
Optional inputs mean the tool can run without them. If `calendar_id` is optional, you might be able to use "primary" as a default. If it's required, you have no choice — you must get it from somewhere.

---

#### Graph Building (Main Loop)

```typescript
const graph: Dependency[] = [];

for (const tool of allTools) {
  const explicit = findExplicitDeps(tool);
  const implicit = findImplicitDeps(tool);

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
```

**Purpose:** Runs both detection strategies on every tool and merges results without duplicates.

**`new Map<string, string>()`:** A Map is like an object but with explicit key-value typing and guaranteed insertion order. Here:
- Key = dependency slug (string)
- Value = the reason string (string)

**Why Map for deduplication?**
If both `findExplicitDeps` and `findImplicitDeps` find the same dependency (same slug), we only want it once. The Map's `has()` check ensures we only store the first reason we found for each slug.

**`if (!seen.has(dep.slug))`:** "If we haven't seen this slug before, add it." The `!` inverts the boolean — "if NOT seen".

**`[...seen.keys()]` and `[...seen.values()]`:** Spread the Map's keys/values into plain arrays. Maps have `.keys()` and `.values()` methods that return iterators — wrapping with `[...]` converts them to arrays.

**Only push if `seen.size > 0`:** No point adding a tool with zero dependencies to the graph — it's a leaf node and adds no edges.

---

### `src/visualize.ts`

#### Building Nodes

```typescript
const nodeSet = new Set<string>();
for (const entry of graph) {
  nodeSet.add(entry.tool);
  for (const dep of entry.dependsOn) {
    nodeSet.add(dep);
  }
}
```

**Purpose:** Collect every unique tool slug that appears anywhere in the graph (both as a "tool that depends" and as a "tool being depended upon").

**Why both?** A tool might appear as a dependency target without having its own entry in the graph. For example, `GITHUB_LIST_REPOS` might never depend on anything (no graph entry), but 10 other tools depend on it. We still need it as a node.

```typescript
const nodes = [...nodeSet].map((slug) => ({
  id: slug,
  label: slug.startsWith("GOOGLESUPER_")
    ? slug.replace("GOOGLESUPER_", "GS_")
    : slug.replace("GITHUB_", "GH_"),
  title: slug,
  color: {
    background: slug.startsWith("GOOGLESUPER_") ? "#4285F4" : "#238636",
    ...
  },
  font: { color: "#ffffff", size: 11 },
}));
```

**`[...nodeSet].map(...)`:** Spread Set into array, then `.map()` transforms each slug into a vis.js node object.

**vis.js node properties:**
- `id` — unique identifier (must match edge `from`/`to` values)
- `label` — text shown on the node (shortened to fit)
- `title` — tooltip shown on hover (full slug)
- `color` — background/border/highlight colors
- `font` — text styling

**Shortening labels:** `GOOGLESUPER_CREATE_SPREADSHEET` → `GS_CREATE_SPREADSHEET`. Nodes are small circles — shorter labels are more readable.

---

#### Building Edges

```typescript
const edges: { from: string; to: string; title: string; arrows: string }[] = [];
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
```

**Purpose:** Convert each dependency relationship into a vis.js edge object.

**Direction:** `from: entry.tool, to: entry.dependsOn[i]` means the arrow points FROM the dependent tool TO the tool it depends on. Reading the arrow: "this tool → needs this other tool".

**`entry.dependsOn[i]!`:** The `!` is a TypeScript **non-null assertion**. It tells the compiler "trust me, this value is not undefined." We know it's safe because we're iterating within bounds.

**`title`:** The hover tooltip on the edge — shows the reason why this dependency exists.

**`arrows: "to"`:** Draw an arrowhead at the `to` end of the edge.

---

#### The Placeholder Injection Pattern

```typescript
const html = `...
  <script>VISJS_PLACEHOLDER</script>
...`;

const finalHtml = html.split("VISJS_PLACEHOLDER").join(visJsSource);
```

**Why this pattern:**
1. The template literal (backtick string) would break if vis.js source contained backticks
2. `.replace()` interprets `$` in the replacement (vis.js uses `$` heavily)
3. `.split(x).join(y)` is a safe literal substitution — no special characters interpreted

**How it works:**
- `.split("VISJS_PLACEHOLDER")` breaks the string into two parts at the placeholder
- `.join(visJsSource)` glues them back together with vis.js in the middle
- Result: the full HTML with vis.js embedded

---

#### Browser-Side JavaScript (inside the HTML)

```javascript
const nodesDS = new vis.DataSet(ALL_NODES);
const edgesDS = new vis.DataSet(ALL_EDGES);
```
`vis.DataSet` is a reactive data store from vis.js. When you call `.update()`, `.add()`, or `.clear()` on it, the graph automatically re-renders. Think of it like React state for graph data.

```javascript
const network = new vis.Network(container, { nodes: nodesDS, edges: edgesDS }, options);
```
Creates the network. `container` is the DOM element where the graph renders. `options` controls physics, appearance, and interaction.

```javascript
const options = {
  physics: {
    solver: "forceAtlas2Based",
    forceAtlas2Based: {
      gravitationalConstant: -50,   // negative = nodes repel each other
      springLength: 100,            // preferred edge length in pixels
      springConstant: 0.05          // how stiff the edges are
    },
    stabilization: { iterations: 150 }
  }
};
```
**Physics simulation:** vis.js simulates a physical system where nodes repel each other (like magnets) and edges act as springs pulling connected nodes together. The graph "stabilizes" when forces balance out, creating natural clusters.

```javascript
network.on("click", (params) => {
  if (params.nodes.length === 0) return;
  const slug = params.nodes[0];
  const entry = GRAPH.find((e) => e.tool === slug);
  ...
  panel.innerHTML = html;
});
```
**Click handler:** When you click a node, vis.js fires a `click` event with `params.nodes` containing the IDs of clicked nodes. We find that tool's entry in our GRAPH data and render the dependency details into the right panel.

```javascript
function toggleFilter(which) {
  ...
  const visibleIds = new Set(visible.map((n) => n.id));
  nodesDS.clear(); edgesDS.clear();
  nodesDS.add(visible);
  edgesDS.add(ALL_EDGES.filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to)));
}
```
**Filter function:** When toggling Google Super or GitHub visibility:
1. Compute which nodes should be visible
2. Clear both DataSets
3. Re-add only visible nodes
4. Re-add only edges where BOTH endpoints are visible (an edge between a visible and hidden node would be dangling — we remove those)

---

## 8. Software Engineering Principles Applied

### Single Responsibility Principle (SRP)
Each file does exactly one thing:
- `index.ts` → fetch data only
- `analyze.ts` → detect dependencies only
- `visualize.ts` → render HTML only

If you need to change how data is fetched, you only touch `index.ts`. If you want a different visualization, you only touch `visualize.ts`. Changes are isolated.

### DRY (Don't Repeat Yourself)
The same pattern (fetch → write to JSON) was applied for both Google Super and GitHub in `index.ts` with just different parameters — not duplicated logic.

### KISS (Keep It Simple, Stupid)
Rather than using a complex ML model to detect dependencies, we used two simple heuristics (text search + name matching) that produce accurate, explainable results. The simplest solution that works is always preferred.

### YAGNI (You Aren't Gonna Need It)
We didn't build a database, a REST API, a caching layer, or a real-time update system. The assessment needed a graph visualization — we built exactly that and nothing more.

### Separation of Concerns
- Data fetching (API layer) is completely separate from analysis logic
- Analysis logic is completely separate from rendering
- Each layer can be tested or replaced independently

### Data Quality Over Data Quantity
Reducing from 1006 noisy dependencies to 211 high-confidence ones. A smaller, accurate dataset is always more valuable than a large, noisy one.

### Build-time vs Runtime Dependencies
Embedding vis.js at build time (when generating HTML) rather than loading it at runtime (when browser opens). This makes the file portable, offline-capable, and immune to CDN failures.

---

## 9. Key Concepts Glossary

| Term | Definition |
|------|------------|
| **API** | Application Programming Interface — a way for software to talk to other software |
| **SDK** | Software Development Kit — pre-built code to make using an API easier |
| **Schema** | The structure/shape of data — what fields exist and what types they are |
| **Dependency** | Something that must exist or run before something else can run |
| **Graph** | A data structure of nodes (things) connected by edges (relationships) |
| **Directed Graph** | A graph where edges have direction (arrows, not just lines) |
| **Leaf Node** | A node with no outgoing edges — no dependencies |
| **Hub Node** | A node many others point to — widely depended upon |
| **Set** | A data structure that stores only unique values, with O(1) lookup |
| **Map** | A key-value data structure with guaranteed insertion order |
| **Optional Chaining `?.`** | Safe property access that returns undefined instead of crashing |
| **Nullish Coalescing `??`** | "Use the right side if the left side is null/undefined" |
| **Spread Operator `...`** | Unpacks an array or object into individual elements |
| **Type Annotation** | TypeScript syntax to declare what type a variable holds |
| **Template Literal** | Backtick strings in JS that allow embedded expressions `${...}` |
| **Physics Simulation** | vis.js feature that positions nodes using simulated forces |
| **DataSet** | vis.js reactive data store — changes trigger automatic re-renders |
| **False Positive** | A match that appears correct but isn't — noise in detection |
| **O(1) lookup** | Constant time — doesn't get slower as data grows |
| **PATH variable** | Shell environment variable listing directories to search for executables |
| **CDN** | Content Delivery Network — servers that host files for fast global access |
| **Self-contained HTML** | An HTML file with all dependencies embedded, needs no server |

---

## 10. How to Re-run the Project from Scratch

If you ever need to regenerate everything from scratch:

```bash
# 1. Make sure .env exists with your API key
cat .env  # should show COMPOSIO_API_KEY=...

# 2. Fetch fresh tool data
bun run src/index.ts
# → generates googlesuper_tools.json and github_tools.json

# 3. Analyze dependencies
bun run src/analyze.ts
# → generates dependency_graph.json

# 4. Generate visualization
bun run src/visualize.ts
# → generates graph.html

# 5. Open in browser
open graph.html
```

**Order matters:** Each step depends on the output of the previous step. You cannot run step 3 without first running step 2.

---

## Final Summary

| What we built | How |
|---------------|-----|
| Fetched 1,295 tool schemas | Composio SDK + `getRawComposioTools()` |
| Detected 211 dependency relationships | Explicit (description text) + Implicit (param name matching) |
| Reduced noise from 1006 → 211 | GENERIC_PARAMS blocklist + `_id`/`_sha` suffix heuristic |
| Generated interactive graph | vis.js Network with 248 nodes, 634 edges |
| Made it portable (no server) | Embedded vis.js inline via `split().join()` pattern |
| Submitted | Moved large data files out, ran `upload.sh` |

---

*Document written as a knowledge transfer guide. Every problem, decision, and line of code is explained so that you can understand not just what was done, but why — and how to apply these patterns in future projects.*
