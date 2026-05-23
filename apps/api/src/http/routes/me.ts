import { Router } from "express";
import { asyncHandler } from "../middleware/async-handler.js";
import { currentUser, requireAuth } from "../middleware/auth.js";

export const meRouter = Router();

meRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: currentUser(req) });
  })
);
