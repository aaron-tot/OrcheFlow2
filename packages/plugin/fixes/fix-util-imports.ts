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
  
  // Calculate the depth from the file to the root
  const relativePath = file.replace(/\\/g, "/").split("/src/")[1];
  const depth = relativePath.split("/").length - 1;
  const pathToRoot = "../".repeat(depth);
  
  // Replace @opencode-ai/util imports with relative path to ../util package
  const pathToUtil = pathToRoot + "../../util/src";
  
  content = content.replace(
    /@opencode-ai\/util\/error/g,
    `${pathToUtil}/error`
  );
  
  content = content.replace(
    /@opencode-ai\/util/g,
    `${pathToUtil}`
  );
  
  content = content.replace(
    /@opencode-ai\/shared\/utils\/fn/g,
    `${pathToUtil}/fn`
  );
  
  if (content !== originalContent) {
    writeFileSync(file, content, "utf-8");
    totalFixed++;
    console.log(`Fixed: ${relativePath}`);
  }
}

console.log(`\nTotal files fixed: ${totalFixed}`);
