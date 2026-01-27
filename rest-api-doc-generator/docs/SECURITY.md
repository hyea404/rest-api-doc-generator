# Security Implementation

## API Key Storage

### Storage Method
- **Platform:** VS Code SecretStorage API
- **Encryption:** System-level encryption
  - macOS: Keychain
  - Windows: Credential Manager
  - Linux: Secret Service API

### Storage Key
- Key name: `openrouter_api_key`
- Format: `sk-or-v1-...`

### Security Features
1. ✅ API keys never stored in plain text
2. ✅ No API keys in source code
3. ✅ No API keys in logs or telemetry
4. ✅ Password-masked input UI
5. ✅ Validation before storage
6. ✅ Secure deletion

### Commands
- `REST API Docs: Set OpenRouter API Key` - Store API key
- `REST API Docs: Check API Key Status` - Verify key exists
- `REST API Docs: Delete API Key` - Remove key from storage

### Best Practices
- Never commit API keys to git
- Never share API keys
- Regenerate keys if compromised
- Use different keys for dev/prod