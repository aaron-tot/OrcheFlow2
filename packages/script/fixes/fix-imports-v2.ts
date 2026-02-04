#!/usr/bin/env bun
/**
 * Comprehensive Import Fixer V2
 * 
 * This script:
 * 1. Scans all .ts files in opencode_P3/src
 * 2. Builds a map of all exported symbols to their file locations
 * 3. Analyzes all imports and fixes broken paths
 * 4. Handles special cases (external packages, runtime paths, etc.)
 */

import fs from 'fs';
import path from 'path';

const SRC_DIR = 'opencode_P3/src';
const ROOT_DIR = process.cwd();
const FULL_SRC_PATH = path.join(ROOT_DIR, SRC_DIR);

interface FileInfo {
  absolutePath: string;
  relativePath: string; // Relative to src/
  exports: string[];
}

interface ImportInfo {
  file: string;
  line: number;
  original: string;
  importPath: string;
  imported: string[];
}

// Build index of all files and their exports
const fileIndex: Map<string, FileInfo> = new Map();
const exportToFiles: Map<string, string[]> = new Map();

console.log('🔍 Step 1: Scanning all TypeScript files...');

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

function extractExports(content: string): string[] {
  const exports: string[] = [];
  
  // Match: export class/interface/type/const/function/enum Name
  const namedExportRegex = /export\s+(?:class|interface|type|const|function|enum|async\s+function)\s+([A-Z][a-zA-Z0-9_]*)/g;
  let match;
  while ((match = namedExportRegex.exec(content)) !== null) {
    exports.push(match[1]);
  }
  
  // Match: export { Name1, Name2 }
  const exportListRegex = /export\s*\{\s*([^}]+)\s*\}/g;
  while ((match = exportListRegex.exec(content)) !== null) {
    const names = match[1].split(',').map(n => {
      const trimmed = n.trim();
      // Handle "Name as Alias" - we want the original name
      const asMatch = trimmed.match(/^(\w+)\s+as\s+\w+$/);
      return asMatch ? asMatch[1] : trimmed;
    });
    exports.push(...names);
  }
  
  return exports;
}

// Build file index
const allFiles = getAllTsFiles(FULL_SRC_PATH);
console.log(`   Found ${allFiles.length} TypeScript files`);

for (const file of allFiles) {
  const relativePath = path.relative(FULL_SRC_PATH, file).replace(/\\/g, '/');
  const content = fs.readFileSync(file, 'utf-8');
  const exports = extractExports(content);
  
  fileIndex.set(relativePath, {
    absolutePath: file,
    relativePath,
    exports
  });
  
  // Index exports
  for (const exp of exports) {
    if (!exportToFiles.has(exp)) {
      exportToFiles.set(exp, []);
    }
    exportToFiles.get(exp)!.push(relativePath);
  }
}

console.log(`   Indexed ${exportToFiles.size} unique exports`);

// Special mappings for known issues
const SPECIAL_MAPPINGS: Record<string, string> = {
  // External packages that should use workspace reference
  '@opencode-ai/shared/utils/error': '@opencode-ai/util',
  
  // Hono runtime paths
  'hono/infrastructure/runtime/infrastructure/runtime/bun': 'hono/bun',
  'hono/runtime/bun': 'hono/bun',
  
  // Malformed paths from previous migration
  './routes/features/projects/servicess/services': '../features/projects/routes/projectRoutes',
  './routes/features/agents/infrastructure': '../features/agents/routes/agentRoutes',
  './routes/features/cli/services/infrastructure/pty': '../features/cli/infrastructure/pty/ptyRoutes',
  './routes/features/mcp/services': '../features/mcp/routes/mcpRoutes',
  './routes/features/files/servicess/services': '../features/files/routes/fileRoutes',
  './routes/shared/config': '../shared/config/configRoutes',
  './routes/experimental': './experimentalRoutes',
  './routes/features/providers/servicess/services': '../features/providers/routes/providerRoutes',
  './routes/features/questions/servicess/services': '../features/questions/routes/questionRoutes',
  './routes/features/permissions/servicess/services': '../features/permissions/routes/permissionRoutes',
  './routes/shared/utils/global': '../shared/utils/globalRoutes',
  './routes/tui': '../features/cli/infrastructure/tuiRoutes',
};

// Common old -> new path patterns
const PATH_PATTERNS: Array<[RegExp, string]> = [
  // CLI commands paths
  [/\.\/features\/cli\/services\/commands\/(.+)/, './features/cli/commands/$1'],
  [/\.\/cli\/cmd\/features\/mcp\/services/, './features/mcp/services/mcp'],
  [/\.\/cli\/cmd\/features\/acp\/services/, './features/acp/services/agent'],
  [/\.\/features\/cli\/commands\/features\/agents\/infrastructure/, './features/agents/infrastructure'],
  [/\.\/features\/cli\/services\/infrastructure\/(.+)/, './features/cli/infrastructure/$1'],
  [/\.\/features\/cli\/services\/ui/, './features/cli/services/ui'],
  [/\.\/features\/cli\/services\/error/, './features/cli/services/error'],
];

console.log('\n🔧 Step 2: Analyzing and fixing imports...');

function findExportFile(exportName: string, currentFile: string): string | null {
  const files = exportToFiles.get(exportName);
  if (!files || files.length === 0) return null;
  
  // If only one file exports it, return that
  if (files.length === 1) return files[0];
  
  // Multiple files export it - prefer closest one
  const currentDir = path.dirname(currentFile);
  let closestFile = files[0];
  let shortestDistance = Number.MAX_VALUE;
  
  for (const file of files) {
    const fileDir = path.dirname(file);
    const distance = Math.abs(currentDir.split('/').length - fileDir.split('/').length);
    if (distance < shortestDistance) {
      shortestDistance = distance;
      closestFile = file;
    }
  }
  
  return closestFile;
}

function calculateRelativePath(from: string, to: string): string {
  const fromDir = path.dirname(from);
  let relative = path.relative(fromDir, to.replace(/\.ts$/, '')).replace(/\\/g, '/');
  
  if (!relative.startsWith('.')) {
    relative = './' + relative;
  }
  
  return relative;
}

function fixImportPath(importPath: string, currentFile: string, importedSymbols: string[]): string | null {
  // Skip external packages (unless they're in our special mappings)
  if (!importPath.startsWith('.') && !importPath.startsWith('@/') && !SPECIAL_MAPPINGS[importPath]) {
    // Check if it's a known bad path pattern
    let isBadPath = false;
    for (const [pattern] of PATH_PATTERNS) {
      if (pattern.test(importPath)) {
        isBadPath = true;
        break;
      }
    }
    if (!isBadPath) return null; // Keep external imports as-is
  }
  
  // Apply special mappings first
  if (SPECIAL_MAPPINGS[importPath]) {
    return SPECIAL_MAPPINGS[importPath];
  }
  
  // Apply path pattern replacements
  for (const [pattern, replacement] of PATH_PATTERNS) {
    if (pattern.test(importPath)) {
      return importPath.replace(pattern, replacement);
    }
  }
  
  // Handle @/ alias paths
  if (importPath.startsWith('@/')) {
    const aliasPath = importPath.substring(2); // Remove '@/'
    const targetFile = fileIndex.get(aliasPath + '.ts');
    if (targetFile) {
      return calculateRelativePath(currentFile, targetFile.relativePath);
    }
  }
  
  // Handle relative paths that might be broken
  if (importPath.startsWith('.')) {
    const currentDir = path.dirname(currentFile);
    const resolvedPath = path.join(currentDir, importPath).replace(/\\/g, '/');
    
    // Try with .ts extension
    if (fileIndex.has(resolvedPath + '.ts')) {
      return null; // Path is correct
    }
    
    // Try with /index.ts
    if (fileIndex.has(resolvedPath + '/index.ts')) {
      return null; // Path is correct
    }
    
    // Path is broken - try to find the right file using imported symbols
    if (importedSymbols.length > 0) {
      for (const symbol of importedSymbols) {
        const targetFile = findExportFile(symbol, currentFile);
        if (targetFile) {
          return calculateRelativePath(currentFile, targetFile);
        }
      }
    }
  }
  
  return null;
}

function extractImports(content: string, filePath: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Match: import ... from "path" or import ... from 'path'
    const importRegex = /import\s+(?:type\s+)?(?:\{([^}]+)\}|(\*\s+as\s+\w+)|([A-Z]\w+))\s+from\s+["']([^"']+)["']/;
    const match = line.match(importRegex);
    
    if (match) {
      const [full, namedImports, namespaceImport, defaultImport, importPath] = match;
      const imported: string[] = [];
      
      if (namedImports) {
        imported.push(...namedImports.split(',').map(s => s.trim().split(/\s+/)[0]));
      }
      if (defaultImport) {
        imported.push(defaultImport);
      }
      
      imports.push({
        file: filePath,
        line: i,
        original: line,
        importPath,
        imported
      });
    }
  }
  
  return imports;
}

let fixedCount = 0;
let errorCount = 0;
const fixes: Map<string, string[]> = new Map();

for (const [relativePath, fileInfo] of fileIndex) {
  const content = fs.readFileSync(fileInfo.absolutePath, 'utf-8');
  const imports = extractImports(content, relativePath);
  
  if (imports.length === 0) continue;
  
  const lineFixes: Array<{ line: number; original: string; fixed: string }> = [];
  
  for (const imp of imports) {
    const fixedPath = fixImportPath(imp.importPath, relativePath, imp.imported);
    
    if (fixedPath) {
      const newLine = imp.original.replace(
        new RegExp(`["']${imp.importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`),
        `"${fixedPath}"`
      );
      lineFixes.push({ line: imp.line, original: imp.original, fixed: newLine });
    }
  }
  
  if (lineFixes.length > 0) {
    // Apply fixes to content
    const lines = content.split('\n');
    for (const fix of lineFixes) {
      lines[fix.line] = fix.fixed;
    }
    
    // Write back
    fs.writeFileSync(fileInfo.absolutePath, lines.join('\n'), 'utf-8');
    fixedCount += lineFixes.length;
    
    fixes.set(relativePath, lineFixes.map(f => `Line ${f.line + 1}: ${f.original.trim()} → ${f.fixed.trim()}`));
  }
}

console.log(`   Fixed ${fixedCount} import statements across ${fixes.size} files`);

if (fixes.size > 0) {
  console.log('\n📝 Summary of fixes:');
  let count = 0;
  for (const [file, fileFixes] of fixes) {
    if (count < 10) { // Show first 10 files
      console.log(`\n   ${file}:`);
      fileFixes.slice(0, 3).forEach(fix => console.log(`     - ${fix}`));
      if (fileFixes.length > 3) {
        console.log(`     ... and ${fileFixes.length - 3} more`);
      }
    }
    count++;
  }
  if (fixes.size > 10) {
    console.log(`\n   ... and ${fixes.size - 10} more files`);
  }
}

console.log('\n✅ Import fixing complete!');
console.log('\n🧪 Next steps:');
console.log('   1. Run: cd v5/branches/main/packages/opencode_P3 && bunx tsc --noEmit');
console.log('   2. Check for remaining errors');
console.log('   3. Manual fixes may be needed for complex cases');
