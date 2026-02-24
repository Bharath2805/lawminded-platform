interface EnvConfig {
  NODE_ENV?: string;
  PORT?: string;
  OPENAI_API_KEY: string;
  VECTOR_STORE_ID?: string;
  TAVILY_API_KEY?: string;
  DATABASE_URL: string;
  DIRECT_URL?: string;
  REDIS_URL: string;
  RESEND_API_KEY?: string;
  CORS_ORIGIN?: string;
  SESSION_SECRET: string;
  CSRF_SECRET?: string;
  ADMIN_EMAIL?: string;
  COOKIE_DOMAIN?: string;
  SESSION_COOKIE_NAME?: string;
  SESSION_TTL_HOURS?: string;
  WEB_APP_URL?: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET?: string;
  PRIVACY_POLICY_VERSION?: string;
  PREMIUM_PLAN_KEYS?: string;
  STORAGE_BUCKET?: string;
  STORAGE_REGION?: string;
  STORAGE_ENDPOINT?: string;
  STORAGE_ACCESS_KEY_ID?: string;
  STORAGE_SECRET_ACCESS_KEY?: string;
  STORAGE_FORCE_PATH_STYLE?: string;
  STORAGE_SIGNED_URL_TTL_SECONDS?: string;
  STORAGE_KEY_PREFIX?: string;
}

const REQUIRED_KEYS: Array<keyof EnvConfig> = [
  'OPENAI_API_KEY',
  'DATABASE_URL',
  'REDIS_URL',
  'SESSION_SECRET',
  'STRIPE_SECRET_KEY',
];

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const missing = REQUIRED_KEYS.filter((key) => !config[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }

  return config as unknown as EnvConfig;
}
