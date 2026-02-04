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
  
  // Calculate the correct depth from the file to src/
  const relativePath = file.replace(/\\/g, "/").split("/src/")[1];
  const depth = relativePath.split("/").length - 1;
  const pathToSrc = "../".repeat(depth);
  
  // Replace @/ with the correct relative path to src
  content = content.replace(
    /@\//g,
    pathToSrc
  );
  
  if (content !== originalContent) {
    writeFileSync(file, content, "utf-8");
    totalFixed++;
    console.log(`Fixed: ${relativePath}`);
  }
}

console.log(`\nTotal files fixed: ${totalFixed}`);
