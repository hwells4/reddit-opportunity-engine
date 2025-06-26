/**
 * Utility functions for API key validation
 * Ensures consistent validation across the entire codebase
 */

/**
 * Validates that an API key is properly set and not empty
 * @param apiKey - The API key to validate
 * @returns true if the API key is valid, false otherwise
 */
export function isValidApiKey(apiKey: string | undefined | null): boolean {
  return Boolean(apiKey && apiKey.trim() !== '')
}

/**
 * Gets and validates an environment variable API key
 * @param envVarName - The name of the environment variable
 * @returns The API key if valid, null if invalid
 */
export function getValidatedApiKey(envVarName: string): string | null {
  const apiKey = process.env[envVarName]
  return isValidApiKey(apiKey) ? apiKey! : null
}

/**
 * Check if a specific API key is required for an operation
 * @param envVarName - The environment variable name
 * @param operationName - Name of the operation requiring the key
 * @returns The API key if valid
 * @throws Error with helpful message if key is missing
 */
export function requireApiKeyForOperation(envVarName: string, operationName: string): string {
  const apiKey = getValidatedApiKey(envVarName)
  
  if (!apiKey) {
    const config = API_KEY_CONFIGS.find(c => c.envVar === envVarName)
    const serviceName = config?.service || envVarName
    
    throw new Error(
      `${serviceName} API key required for ${operationName}.\n\n` +
      `Please set ${envVarName}:\n` +
      `  export ${envVarName}="your-key-here"\n\n` +
      `Or pull from Railway:\n` +
      `  railway variables --kv > .env\n` +
      `  source .env`
    )
  }
  
  return apiKey
}

/**
 * Throws an error if the API key is not valid
 * @param apiKey - The API key to validate
 * @param serviceName - The name of the service for error messages
 */
export function requireValidApiKey(apiKey: string | undefined | null, serviceName: string): asserts apiKey is string {
  if (!isValidApiKey(apiKey)) {
    throw new Error(`${serviceName} API key is not properly configured`)
  }
}

/**
 * Configuration for required API keys
 */
interface ApiKeyConfig {
  envVar: string
  service: string
  required: boolean
  description: string
}

const API_KEY_CONFIGS: ApiKeyConfig[] = [
  {
    envVar: 'GUMLOOP_API_KEY',
    service: 'Gumloop',
    required: true,
    description: 'Required for sending analyses to Gumloop pipeline'
  },
  {
    envVar: 'OPENAI_API_KEY',
    service: 'OpenAI',
    required: false,
    description: 'Required for AI-powered content analysis'
  },
  {
    envVar: 'DATABASE_URL',
    service: 'Database',
    required: false,
    description: 'Required for storing analysis results'
  }
]

/**
 * Check all required API keys and provide helpful feedback
 * @param requireAll - If true, throws error if any required keys are missing
 * @returns Object with missing keys and validation results
 */
export function validateAllApiKeys(requireAll: boolean = false): {
  isValid: boolean
  missing: string[]
  available: string[]
  validationResults: { [key: string]: boolean }
} {
  const missing: string[] = []
  const available: string[] = []
  const validationResults: { [key: string]: boolean } = {}

  for (const config of API_KEY_CONFIGS) {
    const isValid = Boolean(getValidatedApiKey(config.envVar))
    validationResults[config.envVar] = isValid
    
    if (isValid) {
      available.push(config.service)
    } else if (config.required) {
      missing.push(config.service)
    }
  }

  const isValid = missing.length === 0
  
  if (requireAll && !isValid) {
    const errorMessage = `Missing required API keys: ${missing.join(', ')}\n\nTo set up your environment:\n` +
      API_KEY_CONFIGS
        .filter(config => missing.includes(config.service))
        .map(config => `  export ${config.envVar}="your-key-here"  # ${config.description}`)
        .join('\n') +
      '\n\nAlternatively, pull keys from Railway:\n  railway variables --kv > .env\n  source .env'
    
    throw new Error(errorMessage)
  }

  return { isValid, missing, available, validationResults }
}

/**
 * Print API key status in a user-friendly format
 */
export function printApiKeyStatus(): void {
  const validation = validateAllApiKeys(false)
  
  console.log('\n🔑 API Key Status:')
  
  for (const config of API_KEY_CONFIGS) {
    const isValid = validation.validationResults[config.envVar]
    const status = isValid ? '✅' : '❌'
    const requiredText = config.required ? ' (required)' : ' (optional)'
    
    console.log(`  ${status} ${config.service}${requiredText}`)
    if (!isValid && config.required) {
      console.log(`      Missing: ${config.envVar}`)
    }
  }
  
  if (validation.missing.length > 0) {
    console.log('\n📋 To fix missing keys:')
    console.log('  Option 1: Set manually')
    API_KEY_CONFIGS
      .filter(config => validation.missing.includes(config.service))
      .forEach(config => {
        console.log(`    export ${config.envVar}="your-key-here"`)
      })
    
    console.log('\n  Option 2: Pull from Railway')
    console.log('    railway variables --kv > .env')
    console.log('    source .env')
  }
  
  console.log('')
}