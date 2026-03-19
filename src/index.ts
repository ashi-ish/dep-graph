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
