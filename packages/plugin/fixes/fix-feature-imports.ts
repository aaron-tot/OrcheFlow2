#!/usr/bin/env bun
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, 'opencode_P3/src');

console.log('🔧 Fixing feature-to-feature import paths...\n');

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
  
  const filePath = file.replace(ROOT, 'src').replace(/\\/g, '/');
  
  // Fix imports with excessive ../ going to features
  // Pattern: ../../../../../features/... → ../../features/...
  content = content.replace(
    /from ['"]\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/features\//g,
    'from "../../features/'
  );
  content = content.replace(
    /from ['"]\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/features\//g,
    'from "../../features/'
  );
  content = content.replace(
    /from ['"]\.\.\/\.\.\/\.\.\/\.\.\/features\//g,
    'from "../../features/'
  );
  
  if (content !== original) {
    writeFileSync(file, content, 'utf-8');
    console.log(`✅ Fixed: ${filePath}`);
    fixedCount++;
  }
}

console.log(`\n✨ Fixed ${fixedCount} files!`);
