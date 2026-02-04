#!/usr/bin/env bun
/**
 * Fix regex that were broken by previous cleanup
 * The script replaced //g with /g in regex literals
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

console.log('🔧 Fixing broken regex literals...\n');

const allFiles = getAllTsFiles(FULL_SRC_PATH);
let totalFixes = 0;

// Fix patterns that were accidentally replaced
const fixes = [
  // Fix regex flags that were broken: /g → //g in regex context
  [/([^:])\/g([,\s\)])/g, '$1//g$2'],  // Restore //g flag in regex
  [/\.replace\(([^,]+),\s*\/([^/]+)$/gm, '.replace($1, //$2'],  // Fix incomplete regex
];

for (const file of allFiles) {
  let content = fs.readFileSync(file, 'utf-8');
  let originalContent = content;
  
  for (const [pattern, replacement] of fixes) {
    content = content.replace(pattern, replacement);
  }
  
  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf-8');
    const relativePath = path.relative(FULL_SRC_PATH, file).replace(/\\/g, '/');
    totalFixes++;
    console.log(`✅ Fixed regex in ${relativePath}`);
  }
}

console.log(`\n✅ Total: ${totalFixes} files fixed\n`);
