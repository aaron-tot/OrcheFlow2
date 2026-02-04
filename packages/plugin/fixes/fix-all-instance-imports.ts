#!/usr/bin/env bun
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, 'opencode_P3/src');

console.log('🔧 Fixing ALL Instance imports to point to core/instance...\n');

// Recursively find all TypeScript files
function findTsFiles(dir: string): string[] {
  const results: string[] = [];
  const items = readdirSync(dir);
  
  for (const item of items) {
    const path = join(dir, item);
    const stat = statSync(path);
    
    if (stat.isDirectory()) {
      results.push(...findTsFiles(path));
    } else if (item.endsWith('.ts')) {
      results.push(path);
    }
  }
  
  return results;
}

const files = findTsFiles(ROOT);
let fixedCount = 0;

for (const file of files) {
  let content = readFileSync(file, 'utf-8');
  const original = content;
  
  // Calculate relative path from file to core/instance
  const filePath = file.replace(ROOT, 'src').replace(/\\/g, '/');
  
  // Skip if already importing from core/instance
  if (content.includes('from "../instance"') && filePath.includes('src/core/bus')) {
    continue; // This is the correct core-to-core import
  }
  
  const parts = filePath.split('/');
  const depth = parts.length - 2; // src/app/server.ts = depth 1
  const prefix = '../'.repeat(depth);
  const targetPath = `${prefix}core/instance`;
  
  // Replace instance imports from old locations
  // Pattern 1: from projects/services/instance
  content = content.replace(
    /from ['"]\.\.\/\.\.\/projects\/services\/instance['"]/g,
    `from "${targetPath}"`
  );
  content = content.replace(
    /from ['"]\.\.\/\.\.\/\.\.\/projects\/services\/instance['"]/g,
    `from "${targetPath}"`
  );
  
  // Pattern 2: from ../services/instance (within projects routes)
  if (filePath.includes('/projects/routes/')) {
    content = content.replace(
      /from ['"]\.\.\/services\/instance['"]/g,
      `from "${targetPath}"`
    );
  }
  
  // Pattern 3: from ./instance (within projects services, but not in core)
  if (filePath.includes('/projects/services/') && !filePath.includes('/core/')) {
    content = content.replace(
      /from ['"]\.\/instance['"]/g,
      `from "${targetPath}"`
    );
  }
  
  if (content !== original) {
    writeFileSync(file, content, 'utf-8');
    console.log(`✅ Fixed: ${filePath}`);
    fixedCount++;
  }
}

console.log(`\n✨ Fixed ${fixedCount} files!`);
