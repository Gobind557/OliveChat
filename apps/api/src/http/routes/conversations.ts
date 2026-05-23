import { Router } from "express";
import { createConversationSchema, listConversationsSchema } from "@olivechat/shared";
import { asyncHandler } from "../middleware/async-handler.js";
import { currentUser, requireAuth } from "../middleware/auth.js";
import { conversationService } from "../../modules/conversations/conversation-service.js";
import { cancellationRegistry } from "../../modules/chat/cancellation-registry.js";

export const conversationsRouter = Router();

conversationsRouter.use(requireAuth);

conversationsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const body = createConversationSchema.parse(req.body);
    const conversation = await conversationService.create(user.id, body.title);
    res.status(201).json({ conversation });
  })
);

conversationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const query = listConversationsSchema.parse(req.query);
    res.json(await conversationService.list(user.id, query.limit, query.cursor));
  })
);

conversationsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    res.json({ conversation: await conversationService.get(user.id, String(req.params.id)) });
  })
);

conversationsRouter.post(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const conversation = await conversationService.cancel(user.id, String(req.params.id));
    cancellationRegistry.cancel(conversation.id);
    res.json({ conversation });
  })
);
