// Configuration management for OpenCode
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

export interface EnvironmentConfig {
  backendPort: number
  frontendPort: number
}

export interface MainConfig {
  environments: {
    development: EnvironmentConfig
    production: EnvironmentConfig
  }
}

// Environment detection with fallback
export function detectEnvironment(): string {
  // Check environment variable
  if (process.env.NODE_ENV) {
    return process.env.NODE_ENV
  }
  
  // Check app suffix
  if (process.env.OPENCODE_APP_SUFFIX) {
    return process.env.OPENCODE_APP_SUFFIX === '_dev' ? 'development' : 'production'
  }
  
  // Default to development with warning
  console.warn('⚠️  NODE_ENV not set, defaulting to development')
  return 'development'
}

// Load main configuration
export function loadMainConfig(): MainConfig | null {
  const configPath = process.env.OPENCODE_MAIN_CONFIG_PATH || 'mainConfig.json'
  // Look for config in the same directory as mainConfig.ts first, then fall back to project root
  const configFilePath = existsSync(resolve(__dirname, configPath))
    ? resolve(__dirname, configPath)
    : resolve(__dirname, '..', configPath)
  
  console.log('🔧 Loading config from:', configFilePath)
  
  if (!existsSync(configFilePath)) {
    console.error('❌ Configuration file not found:', configFilePath)
    console.error('   Expected location: packages/opencode/src/config/mainConfig.json')
    console.error('   Create it from mainConfig.example.json')
    process.exit(1)
  }
  
  try {
    const configContent = readFileSync(configFilePath, 'utf-8')
    return JSON.parse(configContent) as MainConfig
  } catch (error) {
    console.error('❌ Error reading configuration file:', error)
    process.exit(1)
  }
}

// Get environment-specific configuration
export function getEnvironmentConfig(): EnvironmentConfig {
  const config = loadMainConfig()
  const environment = detectEnvironment()
  
  // Environment variable override support
  const backendPort = parseInt(process.env.OPENCODE_BACKEND_PORT?.toString() || '') || 
                      config.environments[environment as keyof typeof config.environments].backendPort
  const frontendPort = parseInt(process.env.OPENCODE_FRONTEND_PORT?.toString() || '') || 
                        config.environments[environment as keyof typeof config.environments].frontendPort
  
  return {
    backendPort,
    frontendPort
  }
}

// Validate configuration
export function validateConfig(): void {
  const config = getEnvironmentConfig()
  const environment = detectEnvironment()
  
  console.log(`🔧 Environment: ${environment}`)
  console.log(`🔧 Backend Port: ${config.backendPort}`)
  console.log(`🔧 Frontend Port: ${config.frontendPort}`)
  
  // Validate port ranges
  if (config.backendPort < 1 || config.backendPort > 65535) {
    console.error('❌ Invalid backend port:', config.backendPort)
    process.exit(1)
  }
  
  if (config.frontendPort < 1 || config.frontendPort > 65535) {
    console.error('❌ Invalid frontend port:', config.frontendPort)
    process.exit(1)
  }
  
  // Check for conflicts
  if (config.backendPort === config.frontendPort) {
    console.error('❌ Backend and frontend ports cannot be the same:', config.backendPort)
    process.exit(1)
  }
  
  console.log('✅ Configuration validated')
}

export default {
  detectEnvironment,
  loadMainConfig,
  getEnvironmentConfig,
  validateConfig
}
