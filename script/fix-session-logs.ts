/**
 * Fix existing session log JSON files to have readable newlines
 * Replaces escaped \n with actual newlines for better readability
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'fs'
import { join } from 'path'

const rootDir = process.cwd()

// Find all session directories (ses_*)
const sessionDirs = readdirSync(rootDir).filter(name => 
  name.startsWith('ses_') && statSync(join(rootDir, name)).isDirectory()
)

console.log(`Found ${sessionDirs.length} session directories`)

let totalFiles = 0
let fixedFiles = 0

for (const sessionDir of sessionDirs) {
  const sessionPath = join(rootDir, sessionDir)
  const files = readdirSync(sessionPath).filter(f => f.endsWith('.json'))
  
  console.log(`\nProcessing ${sessionDir}: ${files.length} files`)
  
  for (const file of files) {
    totalFiles++
    const filePath = join(sessionPath, file)
    
    try {
      // Read the JSON file
      let content = readFileSync(filePath, 'utf-8')
      
      // Check if it needs fixing (has escaped newlines)
      if (content.includes('\\n')) {
        // Replace escaped newlines with actual newlines
        const fixed = content.replace(/\\n/g, '\n')
        
        // Write back
        writeFileSync(filePath, fixed, 'utf-8')
        fixedFiles++
        console.log(`  ✓ Fixed: ${file}`)
      } else {
        console.log(`  - Skipped: ${file} (already formatted)`)
      }
    } catch (error) {
      console.error(`  ✗ Error processing ${file}:`, error.message)
    }
  }
}

console.log(`\n✅ Done! Fixed ${fixedFiles} of ${totalFiles} files`)
