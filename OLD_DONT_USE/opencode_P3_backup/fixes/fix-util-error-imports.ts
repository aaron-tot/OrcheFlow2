import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const baseDir = "./opencode_P3/src";

function getAllTsFiles(dir: string): string[] {
  const files: string[] = [];
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
  
  return files;
}

const files = getAllTsFiles(baseDir);

let totalFixed = 0;

for (const file of files) {
  let content = readFileSync(file, "utf-8");
  const originalContent = content;
  
  // Fix imports from util/src to util/src/error for NamedError
  content = content.replace(
    /from ["']([^"']+util\/src)["']/g,
    `from "$1/error"`
  );
  
  // Fix imports from util/src/error to util/src/error/error (if they were doubled)
  content = content.replace(
    /from ["']([^"']+util\/src\/error\/error)["']/g,
    `from "$1"`
  );
  
  if (content !== originalContent) {
    writeFileSync(file, content, "utf-8");
    totalFixed++;
    const relativePath = file.replace(/\\/g, "/").split("/src/")[1];
    console.log(`Fixed: ${relativePath}`);
  }
}

console.log(`\nTotal files fixed: ${totalFixed}`);
