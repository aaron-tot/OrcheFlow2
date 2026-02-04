import { readFileSync, writeFileSync } from "fs";

const files = [
  "./opencode_P3/src/features/agents/routes/agentRoutes.ts",
  "./opencode_P3/src/features/cli/infrastructure/pty/ptyRoutes.ts",
  "./opencode_P3/src/features/cli/infrastructure/tuiRoutes.ts",
  "./opencode_P3/src/features/mcp/routes/mcpRoutes.ts",
  "./opencode_P3/src/features/permissions/routes/permissionRoutes.ts",
  "./opencode_P3/src/features/projects/routes/projectRoutes.ts",
];

let totalFixed = 0;

for (const file of files) {
  let content = readFileSync(file, "utf-8");
  const originalContent = content;
  
  // Calculate the correct depth
  const relativePath = file.replace(/\\/g, "/").split("/src/")[1];
  const depth = relativePath.split("/").length - 1;
  const pathToSrc = "../".repeat(depth);
  
  // Fix error import
  content = content.replace(
    /from ["']\.\.\/error["']/g,
    `from "${pathToSrc}app/error"`
  );
  
  if (content !== originalContent) {
    writeFileSync(file, content, "utf-8");
    totalFixed++;
    console.log(`Fixed: ${relativePath}`);
  }
}

console.log(`\n✅ Total files fixed: ${totalFixed}`);
