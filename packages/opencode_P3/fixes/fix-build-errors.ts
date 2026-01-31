import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const baseDir = "./opencode_P3/src";

function getAllTsFiles(dir: string): string[] {
  const files: string[] = [];
  try {
    const items = readdirSync(dir);
    for (const item of items) {
      const fullPath = join(dir, item);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        files.push(...getAllTsFiles(fullPath));
      } else if (item.endsWith(".ts")) {
        files.push(fullPath);
      }
    }
  } catch (e) {}
  return files;
}

const files = getAllTsFiles(baseDir);
let totalFixed = 0;

for (const file of files) {
  let content = readFileSync(file, "utf-8");
  const originalContent = content;
  
  const relativePath = file.replace(/\\/g, "/").split("/src/")[1];
  const depth = relativePath.split("/").length - 1;
  const pathToSrc = "../".repeat(depth);
  
  // Fix MCP services imports (from routes)
  if (file.includes("/mcp/routes/")) {
    content = content.replace(
      /from ["']\.\.\/\.\.\/features\/mcp\/services["']/g,
      'from "../services"'
    );
  }
  
  // Fix error imports in routes folders
  if (file.includes("/routes/") && !file.includes("/app/")) {
    content = content.replace(
      /from ["']\.\.\/error["']/g,
      `from "${pathToSrc}app/error"`
    );
  }
  
  // Fix agents infrastructure imports - should use index
  content = content.replace(
    /from ["']\.\.\/\.\.\/features\/agents\/infrastructure\/message-v2["']/g,
    `from "${pathToSrc}features/agents/infrastructure"`
  );
  
  content = content.replace(
    /from ["']\.\.\/\.\.\/features\/agents\/infrastructure\/prompt["']/g,
    `from "${pathToSrc}features/agents/infrastructure"`
  );
  
  content = content.replace(
    /from ["']\.\.\/\.\.\/features\/agents\/infrastructure\/compaction["']/g,
    `from "${pathToSrc}features/agents/infrastructure"`
  );
  
  content = content.replace(
    /from ["']\.\.\/\.\.\/features\/agents\/infrastructure\/revert["']/g,
    `from "${pathToSrc}features/agents/infrastructure"`
  );
  
  content = content.replace(
    /from ["']\.\.\/\.\.\/features\/agents\/infrastructure\/todo["']/g,
    `from "${pathToSrc}features/agents/infrastructure"`
  );
  
  content = content.replace(
    /from ["']\.\.\/\.\.\/features\/agents\/infrastructure["']/g,
    `from "${pathToSrc}features/agents/infrastructure"`
  );
  
  // Fix doubled infrastructure paths
  content = content.replace(
    /infrastructure\/cloud\/infrastructure\/cloud\//g,
    "infrastructure/cloud/"
  );
  
  content = content.replace(
    /infrastructure\/runtime\/infrastructure\/runtime\//g,
    "infrastructure/runtime/"
  );
  
  // Fix questions services
  content = content.replace(
    /from ["']\.\.\/\.\.\/features\/questions\/services["']/g,
    `from "${pathToSrc}features/questions/services"`
  );
  
  // Fix project services from routes
  if (file.includes("/projects/routes/")) {
    content = content.replace(
      /from ["']\.\.\/\.\.\/features\/projects\/services\/project["']/g,
      'from "../services/project"'
    );
  }
  
  // Fix runtime imports
  content = content.replace(
    /from ["']\.\.\/infrastructure\/runtime\/infrastructure\/runtime\/bun["']/g,
    `from "${pathToSrc}infrastructure/runtime/bun"`
  );
  
  // Fix auth imports from shared
  if (file.includes("/shared/")) {
    content = content.replace(
      /from ["']\.\.\/infrastructure\/auth["']/g,
      `from "${pathToSrc}infrastructure/auth"`
    );
  }
  
  // Fix env imports
  content = content.replace(
    /from ["']\.\.\/shared\/config\/env["']/g,
    `from "${pathToSrc}shared/config/env"`
  );
  
  // Fix flag imports
  content = content.replace(
    /from ["']\.\.\/shared\/config\/flags\/flag["']/g,
    `from "${pathToSrc}shared/config/flags/flag"`
  );
  
  if (content !== originalContent) {
    writeFileSync(file, content, "utf-8");
    totalFixed++;
    console.log(`Fixed: ${relativePath}`);
  }
}

console.log(`\n✅ Total files fixed: ${totalFixed}`);
