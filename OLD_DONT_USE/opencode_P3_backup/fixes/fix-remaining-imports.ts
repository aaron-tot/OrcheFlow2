#!/usr/bin/env bun
/**
 * Fix remaining import issues
 * Specifically targets:
 * 1. app/* files that reference ./features/ → ../features/
 * 2. app/* files that reference ./shared/ → ../shared/
 * 3. experimentalRoutes.ts with old paths
 */

import fs from 'fs';
import path from 'path';

const fixes = [
  // Fix app/cli.ts and app/server.ts paths
  {
    file: 'opencode_P3/src/app/cli.ts',
    replacements: [
      ['./features/', '../features/'],
      ['./shared/', '../shared/'],
    ]
  },
  {
    file: 'opencode_P3/src/app/server.ts',
    replacements: [
      ['./features/', '../features/'],
      ['./shared/', '../shared/'],
      ['./experimentalRoutes', './experimentalRoutes'], // Keep this one as-is
    ]
  },
  {
    file: 'opencode_P3/src/app/event.ts',
    replacements: [
      ['./features/', '../features/'],
      ['./shared/', '../shared/'],
    ]
  },
  {
    file: 'opencode_P3/src/app/mdns.ts',
    replacements: [
      ['./features/', '../features/'],
      ['./shared/', '../shared/'],
    ]
  },
  {
    file: 'opencode_P3/src/app/experimentalRoutes.ts',
    replacements: [
      ['"../../tool/registry"', '"../features/tools/services/ToolRegistry"'],
      ['"../../worktree"', '"../features/cli/infrastructure/worktree"'],
      ['"../../project/instance"', '"../features/projects/services/instance"'],
      ['"../../project/project"', '"../features/projects/services/project"'],
      ['"../../mcp"', '"../features/mcp/services/mcp"'],
      ['"../error"', '"./error"'],
      ['"../../util/lazy"', '"../shared/utils/lazy"'],
    ]
  },
  // Fix log.ts import
  {
    file: 'opencode_P3/src/shared/utils/log.ts',
    replacements: [
      ["'../shared/utils/global'", "'./global'"],
    ]
  },
  // Fix globalRoutes.ts import
  {
    file: 'opencode_P3/src/shared/utils/globalRoutes.ts',
    replacements: [
      ["'../../global'", "'./global'"],
    ]
  }
];

console.log('🔧 Fixing remaining import issues...\n');

let totalFixes = 0;

for (const { file, replacements } of fixes) {
  const filePath = path.join(process.cwd(), file);
  
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  Skipping ${file} (not found)`);
    continue;
  }
  
  let content = fs.readFileSync(filePath, 'utf-8');
  let fileFixed = false;
  let fixCount = 0;
  
  for (const [from, to] of replacements) {
    const occurrences = (content.match(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    if (occurrences > 0) {
      content = content.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), to);
      fixCount += occurrences;
      fileFixed = true;
    }
  }
  
  if (fileFixed) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`✅ Fixed ${fixCount} imports in ${file}`);
    totalFixes += fixCount;
  }
}

console.log(`\n✅ Total: ${totalFixes} imports fixed\n`);
console.log('🧪 Run: cd v5/branches/main/packages/opencode_P3 && bunx tsc --noEmit');
