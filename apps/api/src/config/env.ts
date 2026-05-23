import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  AUTH_DISABLED: z.coerce.boolean().default(false),
  AUTH0_DOMAIN: z.string().optional(),
  AUTH0_AUDIENCE: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  DEFAULT_LLM_PROVIDER: z.string().default("groq"),
  DEFAULT_LLM_MODEL: z.string().default("llama-3.1-8b-instant"),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(30000)
});

export const env = envSchema.parse(process.env);
