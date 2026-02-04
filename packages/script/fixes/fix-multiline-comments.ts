#!/usr/bin/env bun
/**
 * Fix broken multi-line comments
 * Pattern: / * → /*
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

console.log('🔧 Fixing broken multi-line comments...\n');

const allFiles = getAllTsFiles(FULL_SRC_PATH);
let totalFixes = 0;

for (const file of allFiles) {
  let content = fs.readFileSync(file, 'utf-8');
  let originalContent = content;
  
  // Fix / * → /*
  content = content.replace(/\/\s+\*/g, '/*');
  
  // Fix * / → */
  content = content.replace(/\*\s+\//g, '*/');
  
  // Fix / *ANYTHING* / → /*ANYTHING*/
  content = content.replace(/\/\s+(\*[^*]+\*)\s+\//g, '/$1/');
  
  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf-8');
    const relativePath = path.relative(FULL_SRC_PATH, file).replace(/\\/g, '/');
    totalFixes++;
    console.log(`✅ Fixed ${relativePath}`);
  }
}

console.log(`\n✅ Total: ${totalFixes} files fixed\n`);
console.log('🧪 Next: cd v5/branches/main/packages/opencode_P3 && bunx tsc --noEmit');
