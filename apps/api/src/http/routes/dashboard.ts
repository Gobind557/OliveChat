import { Router } from "express";
import { dashboardQuerySchema } from "@olivechat/shared";
import { asyncHandler } from "../middleware/async-handler.js";
import { currentUser, requireAuth } from "../middleware/auth.js";
import { prisma } from "../../prisma/client.js";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

dashboardRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const query = dashboardQuerySchema.parse(req.query);
    const from = query.from ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const to = query.to ?? new Date();

    const where = { userId: user.id, createdAt: { gte: from, lte: to } };
    const [totals, byStatus, byProvider, recent] = await Promise.all([
      prisma.inferenceLog.aggregate({
        where,
        _count: true,
        _avg: { latencyMs: true },
        _sum: { inputTokens: true, outputTokens: true, totalTokens: true }
      }),
      prisma.inferenceLog.groupBy({
        by: ["status"],
        where,
        _count: true
      }),
      prisma.inferenceLog.groupBy({
        by: ["provider", "model"],
        where,
        _count: true,
        _avg: { latencyMs: true },
        _sum: { totalTokens: true }
      }),
      prisma.inferenceLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { createdAt: true, latencyMs: true, totalTokens: true, status: true, provider: true, model: true }
      })
    ]);

    res.json({
      window: { from, to },
      totals,
      byStatus,
      byProvider,
      recent
    });
  })
);
