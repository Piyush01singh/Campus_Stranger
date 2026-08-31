export interface AppConfig {
  nodeEnv: string;
  port: number;
  host: string;
  corsOrigin: string;
  frontendUrl: string;
  sessionSecret: string;
  google: {
    clientId?: string;
    clientSecret?: string;
    callbackUrl?: string;
  };
  database: {
    url?: string;
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    name?: string;
  };
  redis: {
    url?: string;
    host?: string;
    port?: number;
    password?: string;
  };
}

const cleanEnv = (val?: string): string | undefined => {
  if (!val) return undefined;
  return val.trim().replace(/^["']|["']$/g, '');
};

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || process.env.API_PORT || '3001', 10),
  host: process.env.API_HOST || '0.0.0.0',
  corsOrigin: cleanEnv(process.env.CORS_ORIGIN) || 'http://localhost:3000',
  frontendUrl: cleanEnv(process.env.FRONTEND_URL) || cleanEnv(process.env.CORS_ORIGIN) || 'http://localhost:3000',
  sessionSecret:
    cleanEnv(process.env.SESSION_SECRET) || 'dev_session_secret_at_least_32_chars_long_placeholder',
  google: {
    clientId: cleanEnv(process.env.GOOGLE_CLIENT_ID),
    clientSecret: cleanEnv(process.env.GOOGLE_CLIENT_SECRET),
    callbackUrl:
      cleanEnv(process.env.GOOGLE_CALLBACK_URL) ||
      (cleanEnv(process.env.BACKEND_URL)
        ? `${cleanEnv(process.env.BACKEND_URL)!.replace(/\/+$/, '')}/api/auth/google/callback`
        : cleanEnv(process.env.RENDER_EXTERNAL_URL)
          ? `${cleanEnv(process.env.RENDER_EXTERNAL_URL)!.replace(/\/+$/, '')}/api/auth/google/callback`
          : 'http://localhost:3001/api/auth/google/callback'),
  },
  database: {
    url: cleanEnv(process.env.DATABASE_URL),
    host: cleanEnv(process.env.POSTGRES_HOST) || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: cleanEnv(process.env.POSTGRES_USER) || 'postgres',
    password: cleanEnv(process.env.POSTGRES_PASSWORD),
    name: cleanEnv(process.env.POSTGRES_DB) || 'campus_stranger',
  },
  redis: {
    url: cleanEnv(process.env.REDIS_URL),
    host: cleanEnv(process.env.REDIS_HOST) || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: cleanEnv(process.env.REDIS_PASSWORD),
  },
});
