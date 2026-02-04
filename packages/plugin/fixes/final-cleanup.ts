#!/usr/bin/env bun
/**
 * Final cleanup script
 * Fixes:
 * 1. Triple dots (.../) → double dots (../)
 * 2. Malformed paths with 'servicess/services' → correct paths
 * 3. Other common issues
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

console.log('🧹 Final cleanup of import paths...\n');

const allFiles = getAllTsFiles(FULL_SRC_PATH);
let totalFixes = 0;

const globalFixes = [
  // Fix triple dots
  [/from ["']\.\.\.+\//g, 'from "../'],
  [/import\(["']\.\.\.+\//g, 'import("../'],
  
  // Fix malformed service paths
  [/\/servicess\/services/g, '/services'],
  [/\/features\/files\/servicess\/services/g, '/features/files/routes/fileRoutes'],
  [/\/features\/projects\/servicess\/services/g, '/features/projects/routes/projectRoutes'],
  [/\/features\/providers\/servicess\/services/g, '/features/providers/routes/providerRoutes'],
  [/\/features\/questions\/servicess\/services/g, '/features/questions/routes/questionRoutes'],
  [/\/features\/permissions\/servicess\/services/g, '/features/permissions/routes/permissionRoutes'],
  [/\/features\/skills\/servicess\/services/g, '/features/skills/services/skill'],
  
  // Fix double slashes
  [/\/\//g, '/'],
  
  // Fix specific module paths
  [/"\.\.\/\.\.\/\.\.\/session\/message-v2"/g, '"./message-v2"'],
  [/"\.\.\/\.\.\/\.\.\/shared\/config\/config"/g, '"../../shared/config/config"'],
  
  // Fix @/ alias paths that shouldn't use it
  [/@\/shared/g, '../shared'], // Most files should use relative
] as [RegExp, string][];

for (const file of allFiles) {
  let content = fs.readFileSync(file, 'utf-8');
  let originalContent = content;
  
  for (const [pattern, replacement] of globalFixes) {
    content = content.replace(pattern, replacement);
  }
  
  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf-8');
    const relativePath = path.relative(FULL_SRC_PATH, file).replace(/\\/g, '/');
    const changes = originalContent.split('\n').filter((line, i) => line !== content.split('\n')[i]).length;
    if (changes > 0) {
      console.log(`✅ Fixed ${changes} lines in ${relativePath}`);
      totalFixes += changes;
    }
  }
}

console.log(`\n✅ Total: ${totalFixes} lines fixed\n`);
console.log('🧪 Next: cd v5/branches/main/packages/opencode_P3 && bunx tsc --noEmit');
