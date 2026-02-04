import { readFileSync, writeFileSync } from "fs";

const files = [
  "./opencode_P3/src/features/agents/infrastructure/system.ts",
  "./opencode_P3/src/features/cli/infrastructure/lsp/client.ts",
  "./opencode_P3/src/features/cli/infrastructure/lsp/server.ts",
  "./opencode_P3/src/features/tools/native/apply_patch.ts",
  "./opencode_P3/src/features/tools/native/edit.ts",
  "./opencode_P3/src/features/tools/native/write.ts",
  "./opencode_P3/src/infrastructure/runtime/bun/index.ts",
  "./opencode_P3/src/infrastructure/storage/storage.ts",
  "./opencode_P3/src/shared/config/config.ts",
  "./opencode_P3/src/shared/utils/format/formatter.ts",
];

for (const file of files) {
  let content = readFileSync(file, "utf-8");
  
  // Calculate the correct depth to reach src/ from this file
  const relativePath = file.replace(/\\/g, "/").split("/src/")[1];
  const depth = relativePath.split("/").length - 1;
  const correctPrefix = "../".repeat(depth);
  
  // Replace the corrupted import
  content = content.replace(
    /from ["']\.\.\/util\/features\/files\/servicessystem["']/g,
    `from "${correctPrefix}features/files/domain/filesystem"`
  );
  
  writeFileSync(file, content, "utf-8");
  console.log(`Fixed: ${relativePath}`);
}

console.log(`\nTotal files fixed: ${files.length}`);
