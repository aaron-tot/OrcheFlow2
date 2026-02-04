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
  
  // Fix broken single-line comments: , / text -> , // text
  content = content.replace(/,\s*\/\s+([^\n]+)/g, ", // $1");
  
  // Fix broken single-line comments at end of line: ) / text -> ) // text
  content = content.replace(/\)\s*\/\s+([^\n]+)/g, ") // $1");
  
  // Fix broken single-line comments with } / text -> } // text
  content = content.replace(/\}\s*\/\s+([^\n]+)/g, "} // $1");
  
  // Fix broken multi-line comment starts: /* text without closing
  // This is trickier - look for /* without a closing */ on same or next line
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // If line has /* but not */
    if (line.includes("/*") && !line.includes("*/")) {
      // Check if it looks like it should be //
      if (line.match(/\/\*\s*\w+/)) {
        lines[i] = line.replace("/*", "//");
      }
    }
  }
  content = lines.join("\n");
  
  if (content !== originalContent) {
    writeFileSync(file, content, "utf-8");
    totalFixed++;
    const relativePath = file.replace(/\\/g, "/").split("/src/")[1];
    console.log(`Fixed: ${relativePath}`);
  }
}

console.log(`\n✅ Total files fixed: ${totalFixed}`);
