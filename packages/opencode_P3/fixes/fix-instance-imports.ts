#!/usr/bin/env bun
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, 'opencode_P3/src');

console.log('🔧 Fixing Instance imports to point to core/instance...\n');

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
  const depth = filePath.split('/').length - 2; // src/app/server.ts = depth 1
  const prefix = '../'.repeat(depth);
  const targetPath = `${prefix}core/instance`;
  
  // Replace old instance imports - handle all possible depths
  const patterns = [
    /from ['"]\.\.\/\.\.\/\.\.\/features\/projects\/services\/instance['"]/g,
    /from ['"]\.\.\/features\/projects\/services\/instance['"]/g,
    /from ['"]\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/features\/projects\/services\/instance['"]/g,
    /from ['"]\.\.\/\.\.\/\.\.\/\.\.\/features\/projects\/services\/instance['"]/g,
    /from ['"]\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/features\/projects\/services\/instance['"]/g,
  ];
  
  for (const pattern of patterns) {
    content = content.replace(pattern, `from "${targetPath}"`);
  }
  
  if (content !== original) {
    writeFileSync(file, content, 'utf-8');
    console.log(`✅ Fixed: ${filePath}`);
    fixedCount++;
  }
}

console.log(`\n✨ Fixed ${fixedCount} files!`);
