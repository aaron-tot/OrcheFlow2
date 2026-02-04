#!/usr/bin/env bun
/**
 * Fix import paths within features/ directory
 * When features cross-reference each other, they need correct relative paths
 * 
 * Pattern: features/A/services/file.ts importing features/B/services/other.ts
 * Should be: ../../B/services/other
 */

import fs from 'fs';
import path from 'path';

const SRC_DIR = 'opencode_P3/src';
const ROOT_DIR = process.cwd();
const FULL_SRC_PATH = path.join(ROOT_DIR, SRC_DIR);

function getAllTsFiles(dir: string): string[] {
  const files: string[] = [];
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      files.push(...getAllTsFiles(fullPath));
    } else if (item.endsWith('.ts') && !item.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

console.log('🔧 Fixing cross-feature import paths...\n');

const featuresDir = path.join(FULL_SRC_PATH, 'features');
const allFiles = fs.existsSync(featuresDir) ? getAllTsFiles(featuresDir) : [];

console.log(`   Found ${allFiles.length} files in features/`);

let totalFixes = 0;

for (const file of allFiles) {
  let content = fs.readFileSync(file, 'utf-8');
  let originalContent = content;
  const relativePath = path.relative(FULL_SRC_PATH, file).replace(/\\/g, '/');
  
  // Calculate how deep we are: features/agents/services/file.ts = depth 3
  const pathParts = relativePath.split('/');
  const depth = pathParts.length - 1; // -1 for the filename
  
  // Fix patterns like: ../features/X → ../../X (when in features/A/services/)
  // Fix patterns like: ./features/X → ../X (when in features/A/)
  
  if (depth === 2) {
    // features/agents/file.ts
    content = content.replace(/from ["']\.\/features\/([^"']+)["']/g, 'from "../$1"');
    content = content.replace(/from ["']\.\.\/features\/([^"']+)["']/g, 'from "../$1"');
  } else if (depth === 3) {
    // features/agents/services/file.ts
    content = content.replace(/from ["']\.\/features\/([^"']+)["']/g, 'from "../../$1"');
    content = content.replace(/from ["']\.\.\/features\/([^"']+)["']/g, 'from "../../$1"');
  } else if (depth === 4) {
    // features/agents/services/commands/file.ts
    content = content.replace(/from ["']\.\/features\/([^"']+)["']/g, 'from "../../../$1"');
    content = content.replace(/from ["']\.\.\/features\/([^"']+)["']/g, 'from "../../../$1"');
  } else if (depth >= 5) {
    // Even deeper
    const upLevels = '../'.repeat(depth - 1);
    content = content.replace(/from ["']\.\/features\/([^"']+)["']/g, `from "${upLevels}$1"`);
    content = content.replace(/from ["']\.\.\/features\/([^"']+)["']/g, `from "${upLevels}$1"`);
  }
  
  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf-8');
    totalFixes++;
    console.log(`✅ Fixed ${relativePath} (depth ${depth})`);
  }
}

console.log(`\n✅ Total: ${totalFixes} files fixed\n`);
console.log('🧪 Next: cd v5/branches/main/packages/opencode_P3 && bun ./src/app/server.ts');
