# Using Ollama Local with OpenCode

This OpenCode installation is configured to use **Ollama Local** as a provider, allowing you to run AI models locally without API keys.

## Quick Start

### 1. Make Sure Ollama is Running

```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# If not running, start Ollama
ollama serve
```

### 2. Pull Models (if needed)

```bash
# Install some recommended models
ollama pull llama3.2:3b           # Fast, good for coding
ollama pull qwen2.5-coder:7b      # Excellent code model
ollama pull deepseek-r1:7b        # Reasoning model
```

### 3. Update Model List

After installing new Ollama models, run the updater script to automatically add them to your OpenCode configuration:

```bash
# Update models from local Ollama
bun update-ollama-models.ts

# Or specify custom Ollama URL
bun update-ollama-models.ts http://192.168.1.100:11434
```

### 4. Start OpenCode

```bash
bun run dev
```

## Configuration

Your Ollama configuration is in `opencode.jsonc`:

```jsonc
{
  "model": "ollama-local/llama3.2:3b",
  "provider": {
    "ollama-local": {
      "name": "Ollama Local",
      "options": {
        "baseURL": "http://localhost:11434/v1",
        "apiKey": "ollama"
      },
      "provider": "@ai-sdk/openai-compatible",
      "models": {
        // Your installed models appear here
      }
    }
  }
}
```

## Changing Ollama URL/Port

### Option 1: Edit opencode.jsonc

Manually edit the `baseURL` in `opencode.jsonc`:

```jsonc
{
  "provider": {
    "ollama-local": {
      "options": {
        "baseURL": "http://192.168.1.100:11434/v1"
      }
    }
  }
}
```

### Option 2: Use the Update Script

```bash
# Automatically update config with new URL
bun update-ollama-models.ts http://192.168.1.100:11434
```

## Selecting Models in OpenCode

Once OpenCode is running:

1. Press `Ctrl+T` to open model variants
2. Select from your available Ollama models
3. Or press `Tab` to switch between agents with different models

## Adding Custom Models

### Manually Add to Config

Edit `opencode.jsonc` and add your model under `provider.ollama-local.models`:

```jsonc
{
  "provider": {
    "ollama-local": {
      "models": {
        "your-model:tag": {
          "id": "your-model:tag",
          "name": "Your Model Name",
          "family": "llama",
          "cost": { "input": 0, "output": 0, "cache_read": 0, "cache_write": 0 },
          "limit": { "context": 32768, "input": 24000, "output": 8192 },
          "attachment": true,
          "reasoning": false,
          "temperature": true,
          "tool_call": true
        }
      }
    }
  }
}
```

### Or Use the Auto-Updater

Simply run `bun update-ollama-models.ts` and all your installed Ollama models will be automatically detected and added!

## Recommended Models for Coding

| Model | Size | Best For | Command |
|-------|------|----------|---------|
| `llama3.2:3b` | 3B | Fast responses, general coding | `ollama pull llama3.2:3b` |
| `qwen2.5-coder:7b` | 7B | Code generation & understanding | `ollama pull qwen2.5-coder:7b` |
| `deepseek-r1:7b` | 7B | Complex reasoning, debugging | `ollama pull deepseek-r1:7b` |
| `llama3.1:8b` | 8B | Balanced performance | `ollama pull llama3.1:8b` |
| `codellama:13b` | 13B | Advanced code tasks (slower) | `ollama pull codellama:13b` |

## Troubleshooting

### "Cannot connect to Ollama"

```bash
# Check Ollama status
ollama list

# Restart Ollama
pkill ollama
ollama serve
```

### "No models found"

```bash
# List installed models
ollama list

# Pull a model if none installed
ollama pull llama3.2:3b

# Update OpenCode config
bun update-ollama-models.ts
```

### Models Not Appearing in OpenCode

1. Verify models are in `opencode.jsonc` under `provider.ollama-local.models`
2. Restart OpenCode: `Ctrl+C` then `bun run dev`
3. Run update script: `bun update-ollama-models.ts`

### Change Default Model

Edit the `model` field in `opencode.jsonc`:

```jsonc
{
  "model": "ollama-local/qwen2.5-coder:7b"
}
```

## Benefits of Local Ollama

✅ **No API costs** - All models run locally for free  
✅ **Privacy** - Your code never leaves your machine  
✅ **Offline** - Works without internet connection  
✅ **Fast** - No network latency (with good GPU)  
✅ **Customizable** - Use any Ollama-compatible model  

## Advanced Configuration

### Multiple Ollama Instances

You can configure multiple Ollama providers:

```jsonc
{
  "provider": {
    "ollama-local": {
      "options": { "baseURL": "http://localhost:11434/v1" }
    },
    "ollama-remote": {
      "name": "Ollama Remote",
      "options": { "baseURL": "http://server.lan:11434/v1" },
      "provider": "@ai-sdk/openai-compatible",
      "models": { /* ... */ }
    }
  }
}
```

### Model-Specific Settings

Override settings per model:

```jsonc
{
  "provider": {
    "ollama-local": {
      "models": {
        "llama3.2:3b": {
          "options": {
            "temperature": 0.7,
            "num_ctx": 8192
          }
        }
      }
    }
  }
}
```

---

## Need Help?

- **Ollama Docs**: https://ollama.ai/docs
- **OpenCode Docs**: https://opencode.ai/docs
- **Model Library**: https://ollama.ai/library

Enjoy using OpenCode with local AI models! 🚀
