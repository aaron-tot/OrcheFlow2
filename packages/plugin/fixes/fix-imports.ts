/**
 * Import Path Fixer for opencode_P3
 * Updates all import paths to reflect new feature-based structure
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join, relative, dirname } from 'path';

const P3_SRC = 'C:\\Users\\Aaron - Main\\Desktop\\_OpenCode_MainWorkSpace\\v5\\branches\\main\\packages\\opencode_P3\\src';

// Mapping of old paths to new paths
const PATH_MAPPINGS: Record<string, string> = {
  // App layer
  '/server/server': '/app/server',
  '/index': '/app/cli',
  
  // Agents
  '/agent/agent': '/features/agents/services/AgentExecutor',
  '/session': '/features/agents/infrastructure',
  '/server/routes/session': '/features/agents/routes/agentRoutes',
  
  // Tools  
  '/tool/registry': '/features/tools/services/ToolRegistry',
  '/tool/tool': '/features/tools/domain/Tool',
  '/tool/truncation': '/features/tools/services/truncation',
  '/tool/batch': '/features/tools/services/batch',
  '/tool/': '/features/tools/native/',
  
  // Providers
  '/provider': '/features/providers/services',
  '/server/routes/provider': '/features/providers/routes/providerRoutes',
  
  // MCP
  '/mcp': '/features/mcp/services',
  '/server/routes/mcp': '/features/mcp/routes/mcpRoutes',
  
  // Projects
  '/project': '/features/projects/services',
  '/server/routes/project': '/features/projects/routes/projectRoutes',
  
  // Permissions
  '/permission': '/features/permissions/services',
  '/server/routes/permission': '/features/permissions/routes/permissionRoutes',
  
  // Files
  '/file': '/features/files/services',
  '/server/routes/file': '/features/files/routes/fileRoutes',
  
  // Questions
  '/question': '/features/questions/services',
  '/server/routes/question': '/features/questions/routes/questionRoutes',
  
  // Skills
  '/skill': '/features/skills/services',
  
  // Plugins
  '/plugin': '/features/plugins/services',
  
  // ACP
  '/acp': '/features/acp/services',
  
  // CLI
  '/cli/cmd': '/features/cli/commands',
  '/cli': '/features/cli/services',
  '/pty': '/features/cli/infrastructure/pty',
  '/ide': '/features/cli/infrastructure/ide',
  '/lsp': '/features/cli/infrastructure/lsp',
  '/installation': '/features/cli/infrastructure/installation',
  '/shell': '/features/cli/infrastructure/shell',
  '/worktree': '/features/cli/infrastructure/worktree',
  '/patch': '/features/cli/infrastructure/patch',
  
  // Core
  '/bus': '/core/bus',
  '/scheduler': '/core/scheduler',
  
  // Shared
  '/util': '/shared/utils',
  '/config': '/shared/config',
  '/format': '/shared/utils/format',
  '/flag': '/shared/config/flags',
  '/env': '/shared/config/env',
  '/id': '/shared/utils/id',
  '/global': '/shared/utils/global',
  '/command': '/shared/utils/command',
  
  // Infrastructure
  '/storage': '/infrastructure/storage',
  '/auth': '/infrastructure/auth',
  '/share': '/infrastructure/cloud/share',
  '/snapshot': '/infrastructure/cloud/snapshot',
  '/bun': '/infrastructure/runtime/bun',
};

function getAllTsFiles(dir: string): string[] {
  const files: string[] = [];
  const items = readdirSync(dir);
  
  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      files.push(...getAllTsFiles(fullPath));
    } else if (item.endsWith('.ts') && !item.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

function fixImportPath(oldImport: string, filePath: string): string {
  // Try to match against our mappings
  for (const [oldPath, newPath] of Object.entries(PATH_MAPPINGS)) {
    if (oldImport.includes(oldPath)) {
      const replaced = oldImport.replace(oldPath, newPath);
      console.log(`  ${oldImport} → ${replaced}`);
      return replaced;
    }
  }
  
  return oldImport;
}

function fixFileImports(filePath: string): number {
  let content = readFileSync(filePath, 'utf-8');
  let changeCount = 0;
  
  // Match import statements
  const importRegex = /import\s+(?:{[^}]+}|[\w*]+)\s+from\s+['"]([^'"]+)['"]/g;
  
  content = content.replace(importRegex, (match, importPath) => {
    const newPath = fixImportPath(importPath, filePath);
    if (newPath !== importPath) {
      changeCount++;
      return match.replace(importPath, newPath);
    }
    return match;
  });
  
  // Match require statements  
  const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
  
  content = content.replace(requireRegex, (match, requirePath) => {
    const newPath = fixImportPath(requirePath, filePath);
    if (newPath !== requirePath) {
      changeCount++;
      return match.replace(requirePath, newPath);
    }
    return match;
  });
  
  if (changeCount > 0) {
    writeFileSync(filePath, content, 'utf-8');
  }
  
  return changeCount;
}

// Main execution
console.log('Starting import path fixes...\n');

const allFiles = getAllTsFiles(P3_SRC);
console.log(`Found ${allFiles.length} TypeScript files\n`);

let totalChanges = 0;

for (const file of allFiles) {
  const relativePath = relative(P3_SRC, file);
  const changes = fixFileImports(file);
  
  if (changes > 0) {
    console.log(`✓ ${relativePath}: ${changes} imports fixed`);
    totalChanges += changes;
  }
}

console.log(`\n✅ Complete! Fixed ${totalChanges} imports across ${allFiles.length} files`);
