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

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || process.env.API_PORT || '3001', 10),
  host: process.env.API_HOST || '0.0.0.0',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  frontendUrl: process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:3000',
  sessionSecret:
    process.env.SESSION_SECRET || 'dev_session_secret_at_least_32_chars_long_placeholder',
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl:
      process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/auth/google/callback',
  },
  database: {
    url: process.env.DATABASE_URL,
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD,
    name: process.env.POSTGRES_DB || 'campus_stranger',
  },
  redis: {
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },
});
