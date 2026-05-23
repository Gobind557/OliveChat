class CancellationRegistry {
  private readonly controllers = new Map<string, AbortController>();

  register(conversationId: string) {
    const controller = new AbortController();
    this.controllers.set(conversationId, controller);
    return controller;
  }

  cancel(conversationId: string) {
    const controller = this.controllers.get(conversationId);
    controller?.abort(new Error("Conversation cancelled"));
  }

  release(conversationId: string) {
    this.controllers.delete(conversationId);
  }
}

export const cancellationRegistry = new CancellationRegistry();
