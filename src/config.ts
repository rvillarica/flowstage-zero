// Configuration for flowstage-zero

// API URLs - locked to production
export const FLOWSTAGE_API_URL = 'https://api.theflowstage.com';
export const FLOWSTAGE_APP_URL = 'https://app.theflowstage.com';

// OAuth/Authorization URLs
export const FLOWSTAGE_AUTH_URL = `${FLOWSTAGE_APP_URL}/authorize-app`;

// PostMessage origins (for security checks)
// Includes both localhost (for development) and production origins
export const ALLOWED_POSTMESSAGE_ORIGINS = [
  'https://app.theflowstage.com',
];

// Security configuration
export const SECURITY_CONFIG = {
  // Maximum time to wait for auth response (5 minutes)
  AUTH_TIMEOUT_MS: 300000,

  // API key prefix pattern for validation
  API_KEY_PREFIX: 'fs_',

  // Minimum API key length
  MIN_API_KEY_LENGTH: 51, // 'fs_' + 48 hex chars

  // Enable strict origin checking
  STRICT_ORIGIN_CHECK: true,

  // Log security events (set to false to disable in production)
  LOG_SECURITY_EVENTS: false,
};

// Validate API key format
export function isValidApiKeyFormat(apiKey: string): boolean {
  if (!apiKey) return false;
  if (apiKey.length < SECURITY_CONFIG.MIN_API_KEY_LENGTH) return false;
  if (!apiKey.startsWith(SECURITY_CONFIG.API_KEY_PREFIX)) return false;

  // Check if the rest is hex
  const hexPart = apiKey.substring(SECURITY_CONFIG.API_KEY_PREFIX.length);
  const hexRegex = /^[a-f0-9]+$/i;
  return hexRegex.test(hexPart);
}

// Check if origin is allowed
export function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_POSTMESSAGE_ORIGINS.includes(origin);
}

// Sanitize sensitive data for logging
export function sanitizeApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 11) return '***';
  return apiKey.substring(0, 11) + '***';
}