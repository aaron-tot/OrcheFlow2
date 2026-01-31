#!/usr/bin/env bun
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, 'opencode_P3/src');

console.log('🔧 Fixing same-feature imports in routes...\n');

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
  
  // Only fix files in routes/ subdirectories
  if (!filePath.includes('/routes/')) {
    continue;
  }
  
  // Extract feature name from path like src/features/agents/routes/agentRoutes.ts
  const match = filePath.match(/src\/features\/([^\/]+)\/routes\//);
  if (!match) continue;
  
  const featureName = match[1];
  
  // Fix imports to same feature - routes importing from their own feature's services/infrastructure/etc
  // Pattern: from "../../features/agents/services" → from "../services"
  const regex1 = new RegExp(`from ['"]\\.\\.\\/\\.\\.\\/features\\/${featureName}\\/([^'"]+)['"]`, 'g');
  content = content.replace(regex1, 'from "../$1"');
  
  if (content !== original) {
    writeFileSync(file, content, 'utf-8');
    console.log(`✅ Fixed: ${filePath}`);
    fixedCount++;
  }
}

console.log(`\n✨ Fixed ${fixedCount} files!`);
