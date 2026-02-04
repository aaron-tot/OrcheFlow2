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
  } catch (e) {
    console.error(`Error reading ${dir}:`, e);
  }
  return files;
}

const files = getAllTsFiles(baseDir);
let totalFixed = 0;

for (const file of files) {
  let content = readFileSync(file, "utf-8");
  const originalContent = content;
  
  // Calculate the correct depth from the file to src/
  const relativePath = file.replace(/\\/g, "/").split("/src/")[1];
  const depth = relativePath.split("/").length - 1;
  const pathToSrc = "../".repeat(depth);
  
  // Fix error.ts imports - should be in app/error
  if (file.includes("/routes/")) {
    content = content.replace(
      /from ["']\.\.\/error["']/g,
      `from "${pathToSrc}app/error"`
    );
  }
  
  // Fix markdown imports
  content = content.replace(
    /from ["']\.\.\/shared\/config\/markdown["']/g,
    `from "${pathToSrc}shared/config/markdown"`
  );
  
  // Fix corrupted filesystem imports that still exist
  content = content.replace(
    /from ["'][^"']*\/utils\/features\/files\/servicessystem["']/g,
    `from "${pathToSrc}shared/utils/filesystem"`
  );
  
  // Fix project service imports from routes
  if (file.includes("/projects/routes/")) {
    content = content.replace(
      /from ["']\.\.\/\.\.\/features\/projects\/services\/project["']/g,
      `from "../services/project"`
    );
  }
  
  // Fix Installation imports
  content = content.replace(
    /from ["']\.\.\/\.\.\/features\/cli\/services\/infrastructure\/installation["']/g,
    `from "${pathToSrc}features/cli/infrastructure/installation"`
  );
  
  // Fix global imports
  content = content.replace(
    /from ["']\.\.\/\.\.\/global["']/g,
    `from "${pathToSrc}shared/utils/global"`
  );
  
  // Fix MCP services imports from routes
  if (file.includes("/mcp/routes/")) {
    content = content.replace(
      /from ["']\.\.\/\.\.\/features\/mcp\/services["']/g,
      `from "../services"`
    );
  }
  
  if (content !== originalContent) {
    writeFileSync(file, content, "utf-8");
    totalFixed++;
    console.log(`Fixed: ${relativePath}`);
  }
}

console.log(`\n✅ Total files fixed: ${totalFixed}`);
