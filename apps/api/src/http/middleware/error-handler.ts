import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "../../config/logger.js";

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = "HTTP_ERROR"
  ) {
    super(message);
  }
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  if (res.headersSent) {
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid request", issues: error.issues } });
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.statusCode).json({ error: { code: error.code, message: error.message } });
    return;
  }

  logger.error({ err: error, path: req.path }, "unhandled request error");
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unexpected server error" } });
}
