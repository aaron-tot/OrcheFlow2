#!/usr/bin/env bun
/**
 * Fix import paths in core/ and infrastructure/ directories
 * These directories are at depth 2-3 and need correct relative paths to reach shared/ and features/
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

console.log('🔧 Fixing core/ and infrastructure/ import paths...\n');

const coreDir = path.join(FULL_SRC_PATH, 'core');
const infraDir = path.join(FULL_SRC_PATH, 'infrastructure');

const coreFiles = fs.existsSync(coreDir) ? getAllTsFiles(coreDir) : [];
const infraFiles = fs.existsSync(infraDir) ? getAllTsFiles(infraDir) : [];

const allFiles = [...coreFiles, ...infraFiles];

console.log(`   Found ${coreFiles.length} files in core/`);
console.log(`   Found ${infraFiles.length} files in infrastructure/`);

let totalFixes = 0;
const filesFixes: string[] = [];

for (const file of allFiles) {
  let content = fs.readFileSync(file, 'utf-8');
  let originalContent = content;
  const relativePath = path.relative(FULL_SRC_PATH, file).replace(/\\/g, '/');
  
  // Calculate depth: core/bus/file.ts = 2, infrastructure/storage/file.ts = 2
  const depth = relativePath.split('/').length - 1;
  
  // For files in core/, infrastructure/ (depth 2), they need:
  // - ../shared/ to reach shared/
  // - ../features/ to reach features/
  // - ../infrastructure/ to reach infrastructure/ (if in core)
  // - ../core/ to reach core/ (if in infrastructure)
  
  // For deeper files (depth 3+), add more ../
  
  const fixes: Array<[RegExp, string]> = [];
  
  if (depth === 1) {
    // core/file.ts or infrastructure/file.ts
    fixes.push(
      [/from ["']\.\/shared\//g, 'from "../shared/'],
      [/from ["']\.\/features\//g, 'from "../features/'],
      [/from ["']\.\/infrastructure\//g, 'from "../infrastructure/'],
      [/from ["']\.\/core\//g, 'from "../core/'],
    );
  } else if (depth === 2) {
    // core/bus/file.ts or infrastructure/storage/file.ts
    fixes.push(
      [/from ["']\.\/shared\//g, 'from "../../shared/'],
      [/from ["']\.\/features\//g, 'from "../../features/'],
      [/from ["']\.\/infrastructure\//g, 'from "../../infrastructure/'],
      [/from ["']\.\/core\//g, 'from "../../core/'],
      [/from ["']\.\.\/shared\//g, 'from "../../shared/'],
      [/from ["']\.\.\/features\//g, 'from "../../features/'],
    );
  } else if (depth === 3) {
    // infrastructure/something/deep/file.ts
    fixes.push(
      [/from ["']\.\/shared\//g, 'from "../../../shared/'],
      [/from ["']\.\/features\//g, 'from "../../../features/'],
      [/from ["']\.\/infrastructure\//g, 'from "../../../infrastructure/'],
      [/from ["']\.\/core\//g, 'from "../../../core/'],
      [/from ["']\.\.\/shared\//g, 'from "../../../shared/'],
      [/from ["']\.\.\/features\//g, 'from "../../../features/'],
    );
  }
  
  // Apply all fixes
  for (const [pattern, replacement] of fixes) {
    content = content.replace(pattern, replacement);
  }
  
  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf-8');
    totalFixes++;
    filesFixes.push(relativePath);
    console.log(`✅ Fixed ${relativePath} (depth ${depth})`);
  }
}

console.log(`\n✅ Total: ${totalFixes} files fixed\n`);

if (filesFixes.length > 0 && filesFixes.length <= 20) {
  console.log('📝 Fixed files:');
  filesFixes.forEach(f => console.log(`   - ${f}`));
}

console.log('\n🧪 Next: cd v5/branches/main/packages/opencode_P3 && bun ./src/app/server.ts');
