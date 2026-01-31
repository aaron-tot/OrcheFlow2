#!/usr/bin/env bun

/**
 * Ollama Model Updater for OpenCode
 * 
 * This script fetches your installed Ollama models and updates opencode.jsonc
 * 
 * Usage:
 *   bun update-ollama-models.ts [ollama-url] [config-file]
 * 
 * Examples:
 *   bun update-ollama-models.ts
 *   bun update-ollama-models.ts http://localhost:11434
 *   bun update-ollama-models.ts http://192.168.1.100:11434 ./opencode.jsonc
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const OLLAMA_URL = process.argv[2] || 'http://localhost:11434';
const CONFIG_FILE = process.argv[3] || join(process.cwd(), 'opencode.jsonc');

interface OllamaModel {
  name: string;
  model: string;
  size: number;
  digest: string;
  details: {
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
  };
}

interface OllamaResponse {
  models: OllamaModel[];
}

// Model size to context window mapping (rough estimates)
function estimateContextWindow(paramSize: string): number {
  const sizeMatch = paramSize.match(/(\d+(\.\d+)?)[bB]/i);
  if (!sizeMatch) return 4096;
  
  const size = parseFloat(sizeMatch[1]);
  if (size <= 1) return 32768;
  if (size <= 3) return 128000;
  if (size <= 7) return 32768;
  if (size <= 13) return 16384;
  if (size <= 70) return 8192;
  return 4096;
}

async function fetchOllamaModels(): Promise<OllamaModel[]> {
  try {
    console.log(`Fetching models from ${OLLAMA_URL}/api/tags...`);
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(5000)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data: OllamaResponse = await response.json();
    console.log(`✓ Found ${data.models.length} models`);
    return data.models;
  } catch (error) {
    console.error(`✗ Failed to fetch models from Ollama:`, error.message);
    console.error(`  Make sure Ollama is running at ${OLLAMA_URL}`);
    process.exit(1);
  }
}

function convertToOpencodeModel(ollamaModel: OllamaModel) {
  const modelId = ollamaModel.name;
  const family = ollamaModel.details.family || 'unknown';
  const paramSize = ollamaModel.details.parameter_size || '7B';
  const contextWindow = estimateContextWindow(paramSize);
  
  // Check if model supports reasoning (DeepSeek R1 series)
  const hasReasoning = modelId.toLowerCase().includes('deepseek') && 
                       (modelId.toLowerCase().includes('-r1') || modelId.toLowerCase().includes('r1:'));
  
  return {
    id: modelId,
    name: modelId.charAt(0).toUpperCase() + modelId.slice(1).replace(/[-:]/g, ' '),
    family: family,
    cost: {
      input: 0,
      output: 0,
      cache_read: 0,
      cache_write: 0
    },
    limit: {
      context: contextWindow,
      input: Math.floor(contextWindow * 0.8),
      output: 8192
    },
    attachment: true,
    reasoning: hasReasoning,
    temperature: true,
    tool_call: true
  };
}

async function updateConfig() {
  // Fetch Ollama models
  const ollamaModels = await fetchOllamaModels();
  
  if (ollamaModels.length === 0) {
    console.warn('⚠ No models found in Ollama');
    process.exit(1);
  }
  
  // Convert to OpenCode format
  const opencodeModels: Record<string, any> = {};
  for (const model of ollamaModels) {
    opencodeModels[model.name] = convertToOpencodeModel(model);
  }
  
  // Read existing config
  let config: any;
  try {
    const configText = readFileSync(CONFIG_FILE, 'utf-8');
    // Strip comments for JSON parsing
    const jsonText = configText.replace(/\/\/[^\n]*/g, '').replace(/,(\s*[}\]])/g, '$1');
    config = JSON.parse(jsonText);
  } catch (error) {
    console.error(`✗ Failed to read config file: ${CONFIG_FILE}`);
    console.error(`  Error: ${error.message}`);
    process.exit(1);
  }
  
  // Update Ollama provider models
  if (!config.provider) config.provider = {};
  if (!config.provider['ollama-local']) {
    config.provider['ollama-local'] = {
      name: 'Ollama Local',
      env: [],
      options: {
        baseURL: OLLAMA_URL + '/v1',
        apiKey: 'ollama'
      },
      provider: '@ai-sdk/openai-compatible',
      models: {}
    };
  }
  
  config.provider['ollama-local'].models = opencodeModels;
  config.provider['ollama-local'].options.baseURL = OLLAMA_URL + '/v1';
  
  // Set default model to first Ollama model if not set or if it's an ollama model
  const firstModelId = Object.keys(opencodeModels)[0];
  if (!config.model || config.model.startsWith('ollama-local/')) {
    config.model = `ollama-local/${firstModelId}`;
  }
  
  // Write back with pretty formatting and comments
  const output = JSON.stringify(config, null, 2)
    .replace(/"\/\/ ([^"]+)": "[^"]*",?\n/g, '// $1\n')
    .replace(/"\/\/ ([^"]+)": /g, '// $1: ');
  
  writeFileSync(CONFIG_FILE, output, 'utf-8');
  
  console.log(`\n✓ Updated ${CONFIG_FILE} with ${Object.keys(opencodeModels).length} models:`);
  for (const modelId of Object.keys(opencodeModels)) {
    console.log(`  - ${modelId}`);
  }
  console.log(`\n✓ Default model set to: ollama-local/${firstModelId}`);
  console.log(`✓ Ollama base URL: ${OLLAMA_URL}/v1`);
}

// Run the updater
updateConfig().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
