import { auth } from "express-oauth2-jwt-bearer";
import type { NextFunction, Request, Response } from "express";
import { env } from "../../config/env.js";
import { prisma } from "../../prisma/client.js";
import { HttpError } from "./error-handler.js";

declare global {
  namespace Express {
    interface Request {
      authUser?: {
        id: string;
        auth0Subject: string;
        email?: string;
        name?: string;
      };
    }
  }
}

const jwtGuard =
  !env.AUTH_DISABLED && env.AUTH0_DOMAIN && env.AUTH0_AUDIENCE
    ? auth({
        issuerBaseURL: `https://${env.AUTH0_DOMAIN}`,
        audience: env.AUTH0_AUDIENCE
      })
    : undefined;

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (env.AUTH_DISABLED) {
    req.auth = { payload: { sub: "dev-user", email: "dev@olivechat.local", name: "Local Developer" }, header: {}, token: "" };
    return attachUser(req, res, next);
  }

  if (!jwtGuard) {
    return next(new HttpError(500, "Auth0 is not configured", "AUTH_NOT_CONFIGURED"));
  }

  jwtGuard(req, res, (error) => {
    if (error) {
      next(error);
      return;
    }
    attachUser(req, res, next);
  });
}

async function attachUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const subject = req.auth?.payload.sub;
    if (!subject) {
      throw new HttpError(401, "Missing authenticated subject", "UNAUTHORIZED");
    }

    const email = typeof req.auth?.payload.email === "string" ? req.auth.payload.email : undefined;
    const name = typeof req.auth?.payload.name === "string" ? req.auth.payload.name : undefined;
    const user = await prisma.user.upsert({
      where: { auth0Subject: subject },
      create: { auth0Subject: subject, email, name },
      update: { email, name }
    });

    req.authUser = {
      id: user.id,
      auth0Subject: user.auth0Subject,
      email: user.email ?? undefined,
      name: user.name ?? undefined
    };
    next();
  } catch (error) {
    next(error);
  }
}

export function currentUser(req: Request) {
  if (!req.authUser) {
    throw new HttpError(401, "Authentication required", "UNAUTHORIZED");
  }
  return req.authUser;
}
