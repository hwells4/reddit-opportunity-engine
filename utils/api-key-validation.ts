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
 * Throws an error if the API key is not valid
 * @param apiKey - The API key to validate
 * @param serviceName - The name of the service for error messages
 */
export function requireValidApiKey(apiKey: string | undefined | null, serviceName: string): asserts apiKey is string {
  if (!isValidApiKey(apiKey)) {
    throw new Error(`${serviceName} API key is not properly configured`)
  }
}