export * from "./client.js"

// Only export server functionality in Node.js environments
// @ts-ignore
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  // @ts-ignore
  export * from "./server.js"
}
