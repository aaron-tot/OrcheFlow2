import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, dirname, relative } from "path";

const baseDir = "./opencode_P3/src";

// Map of common module patterns to their correct locations
const MODULE_LOCATIONS = {
  // Core modules
  "core/bus": "core/bus",
  "core/bus/bus-event": "core/bus/bus-event",
  "core/scheduler": "core/scheduler",
  
  // Shared modules
  "shared/config/config": "shared/config/config",
  "shared/config/markdown": "shared/config/markdown",
  "shared/config/env": "shared/config/env",
  "shared/config/flags/flag": "shared/config/flags/flag",
  "shared/utils/log": "shared/utils/log",
  "shared/utils/global": "shared/utils/global",
  "shared/utils/lazy": "shared/utils/lazy",
  "shared/utils/filesystem": "shared/utils/filesystem",
  "shared/utils/slug": "shared/utils/slug",
  "shared/types": "shared/types",
  
  // Infrastructure
  "infrastructure/auth": "infrastructure/auth",
  "infrastructure/storage/storage": "infrastructure/storage/storage",
  "infrastructure/runtime/bun": "infrastructure/runtime/bun",
  "infrastructure/cloud/snapshot": "infrastructure/cloud/snapshot",
  
  // App
  "app/error": "app/error",
  "app/cli": "app/cli",
};

function getAllTsFiles(dir: string): string[] {
  const files: string[] = [];
  try {
    const items = readdirSync(dir);
    for (const item of items) {
      const fullPath = join(dir, item);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        files.push(...getAllTsFiles(fullPath));
      } else if (item.endsWith(".ts") || item.endsWith(".tsx")) {
        files.push(fullPath);
      }
    }
  } catch (e) {}
  return files;
}

function calculateRelativePath(from: string, to: string): string {
  // Convert to forward slashes
  from = from.replace(/\\/g, "/");
  to = to.replace(/\\/g, "/");
  
  // Get directories
  const fromDir = dirname(from);
  const toFile = to;
  
  // Calculate relative path
  let rel = relative(fromDir, toFile).replace(/\\/g, "/");
  
  // Ensure it starts with ./  or ../
  if (!rel.startsWith("..") && !rel.startsWith(".")) {
    rel = "./" + rel;
  }
  
  // Remove .ts extension if present
  rel = rel.replace(/\.tsx?$/, "");
  
  return rel;
}

function fixImportPath(filePath: string, importPath: string): string {
  // If it's already a correct relative path or external module, return as-is
  if (importPath.startsWith("@") || !importPath.includes("/")) {
    return importPath;
  }
  
  // Extract the module being imported (remove leading ../ or ./)
  let modulePath = importPath.replace(/^(\.\.\/)+/, "").replace(/^\.\//, "");
  
  // Check if this is a known module location
  for (const [pattern, location] of Object.entries(MODULE_LOCATIONS)) {
    if (modulePath.startsWith(pattern) || modulePath === pattern) {
      // Calculate correct relative path from current file to the module
      const targetPath = join(baseDir, location + ".ts");
      return calculateRelativePath(filePath, targetPath);
    }
  }
  
  // Handle feature-relative imports (e.g., from routes to services in same feature)
  const filePathParts = filePath.replace(/\\/g, "/").split("/src/")[1].split("/");
  const isInFeature = filePathParts[0] === "features";
  
  if (isInFeature && filePathParts.length >= 2) {
    const featureName = filePathParts[1];
    
    // Check if import is within the same feature
    if (modulePath.includes(`features/${featureName}/`)) {
      // Calculate path from current location to the target within the feature
      const targetWithinFeature = modulePath.replace(`features/${featureName}/`, "");
      const currentDepth = filePathParts.length - 1; // -1 for the file itself
      const backtrackToFeature = "../".repeat(currentDepth - 2); // -2 to get to feature root
      return backtrackToFeature + targetWithinFeature;
    }
  }
  
  // Return the original if we can't determine a better path
  return importPath;
}

const files = getAllTsFiles(baseDir);
let totalFixed = 0;
let fixedFiles: string[] = [];

for (const file of files) {
  let content = readFileSync(file, "utf-8");
  const originalContent = content;
  
  // Calculate the correct depth from the file to src/
  const relativePath = file.replace(/\\/g, "/").split("/src/")[1];
  const depth = relativePath.split("/").length - 1;
  const pathToSrc = "../".repeat(depth);
  
  // Fix import statements using regex
  content = content.replace(
    /from\s+["']([^"']+)["']/g,
    (match, importPath) => {
      // Skip external modules
      if (!importPath.startsWith(".") && !importPath.startsWith("@opencode")) {
        return match;
      }
      
      // Convert @opencode-ai/util references
      if (importPath.includes("@opencode-ai/util")) {
        return `from "${pathToSrc}../../util/src/error"`;
      }
      
      // Fix paths that go through features incorrectly
      if (importPath.includes("/features/") && !importPath.startsWith("../features/")) {
        const cleanPath = importPath.replace(/^\.\.\/+/, "");
        const fixed = pathToSrc + cleanPath;
        return `from "${fixed}"`;
      }
      
      // Fix error imports in routes
      if (file.includes("/routes/") && importPath === "../error") {
        return `from "${pathToSrc}app/error"`;
      }
      
      // Fix infrastructure imports from features
      if (importPath.includes("../infrastructure/") && !file.includes("/infrastructure/")) {
        const cleanPath = importPath.replace(/^(\.\.\/)+infrastructure\//, "");
        return `from "${pathToSrc}infrastructure/${cleanPath}"`;
      }
      
      // Fix core imports
      if (importPath.includes("../core/") && !file.includes("/core/")) {
        const cleanPath = importPath.replace(/^(\.\.\/)+core\//, "");
        return `from "${pathToSrc}core/${cleanPath}"`;
      }
      
      // Fix shared imports with wrong depth
      if (importPath.includes("/shared/")) {
        const cleanPath = importPath.replace(/^(\.\.\/)+shared\//, "");
        return `from "${pathToSrc}shared/${cleanPath}"`;
      }
      
      // Fix same-feature imports (e.g., routes importing from services in same feature)
      if (relativePath.includes("/features/")) {
        const featureParts = relativePath.split("/");
        const featureIndex = featureParts.indexOf("features");
        if (featureIndex >= 0 && featureParts.length > featureIndex + 1) {
          const featureName = featureParts[featureIndex + 1];
          
          // If importing from same feature with wrong path
          if (importPath.includes(`/features/${featureName}/`) || importPath.includes(`../../features/${featureName}/`)) {
            const targetPath = importPath.replace(/^.*\/features\/[^/]+\//, "");
            const currentSubfolder = featureParts[featureIndex + 2]; // routes, services, etc.
            if (currentSubfolder && targetPath) {
              return `from "../${targetPath}"`;
            }
          }
        }
      }
      
      return match;
    }
  );
  
  // Fix specific corrupted patterns
  content = content.replace(/\/util\/features\/files\/servicessystem/g, "/shared/utils/filesystem");
  content = content.replace(/\/cli\/servicesent/g, "/lsp/client");
  content = content.replace(/infrastructure\/cloud\/infrastructure\/cloud\//g, "infrastructure/cloud/");
  content = content.replace(/infrastructure\/runtime\/infrastructure\/runtime\//g, "infrastructure/runtime/");
  
  // Fix regex patterns that got broken
  content = content.replace(/refs\\\/heads\\,/g, "refs\\/heads\\/");
  content = content.replace(/refs\\\/remotes\\,/g, "refs\\/remotes\\/");
  
  // Fix broken comments
  content = content.replace(/,\s*\/\s+([^\n]+)/g, ", // $1");
  content = content.replace(/\)\s*\/\s+([^\n]+)/g, ") // $1");
  content = content.replace(/\}\s*\/\s+([^\n]+)/g, "} // $1");
  content = content.replace(/continue\s+\/\s+/g, "continue // ");
  content = content.replace(/break\s+\/\s+/g, "break // ");
  
  if (content !== originalContent) {
    writeFileSync(file, content, "utf-8");
    totalFixed++;
    fixedFiles.push(relativePath);
    console.log(`✓ Fixed: ${relativePath}`);
  }
}

console.log(`\n${"=".repeat(60)}`);
console.log(`✅ COMPREHENSIVE FIX COMPLETE`);
console.log(`${"=".repeat(60)}`);
console.log(`📊 Total files scanned: ${files.length}`);
console.log(`🔧 Total files fixed: ${totalFixed}`);
console.log(`${"=".repeat(60)}\n`);

if (totalFixed > 0) {
  console.log("Fixed files by category:");
  const categories = {
    features: fixedFiles.filter(f => f.startsWith("features/")).length,
    shared: fixedFiles.filter(f => f.startsWith("shared/")).length,
    infrastructure: fixedFiles.filter(f => f.startsWith("infrastructure/")).length,
    app: fixedFiles.filter(f => f.startsWith("app/")).length,
    core: fixedFiles.filter(f => f.startsWith("core/")).length,
  };
  
  Object.entries(categories).forEach(([cat, count]) => {
    if (count > 0) console.log(`  ${cat}: ${count} files`);
  });
}
