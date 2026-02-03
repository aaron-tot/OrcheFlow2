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
  
  // Calculate the correct depth from the file to src/shared
  const relativePath = file.replace(/\\/g, "/").split("/src/")[1];
  const depth = relativePath.split("/").length - 1;
  const correctPrefix = "../".repeat(depth);
  
  // Fix various incorrect import patterns for config
  content = content.replace(
    /from ["']\.\.\/shared\/config\/config["']/g,
    `from "${correctPrefix}shared/config/config"`
  );
  
  content = content.replace(
    /from ["']\.\.\/\.\.\/shared\/config\/config["']/g,
    `from "${correctPrefix}shared/config/config"`
  );
  
  content = content.replace(
    /from ["']\.\.\/\.\.\/\.\.\/\.\.\/shared\/config\/config["']/g,
    `from "${correctPrefix}shared/config/config"`
  );
  
  // Fix shared/utils imports
  content = content.replace(
    /from ["']\.\.\/shared\/utils\/(.*?)["']/g,
    `from "${correctPrefix}shared/utils/$1"`
  );
  
  content = content.replace(
    /from ["']\.\.\/\.\.\/shared\/utils\/(.*?)["']/g,
    `from "${correctPrefix}shared/utils/$1"`
  );
  
  if (content !== originalContent) {
    writeFileSync(file, content, "utf-8");
    totalFixed++;
    console.log(`Fixed: ${relativePath}`);
  }
}

console.log(`\nTotal files fixed: ${totalFixed}`);
