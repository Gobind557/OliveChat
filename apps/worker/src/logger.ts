import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: ["*.token", "*.apiKey", "*.authorization"],
    censor: "[redacted]"
  }
});
