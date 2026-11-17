import { app } from "./lib/server/http/app";
import type { AppEnv } from "./lib/server/http/env";
import type { PushEvent } from "@edapex/contracts/push";
import { createServiceContext } from "./lib/server/services";
import { deliverEvent } from "./lib/server/services/push/delivery";
import { createSender } from "./lib/server/services/push/fcm";
import { PushService } from "./lib/server/services/push/push.service";

/**
 * The queue consumer.
 *
 * Fan-out happens here, not in the request: a class change is 400 recipients and
 * a request that tries to send them all either times out or silently drops the
 * tail. A message that throws is retried; a message that delivers is acked even
 * if some recipients were skipped, because a skip is a decision, not a failure.
 */
export default {
  fetch: app.fetch,
  async queue(batch, env): Promise<void> {
    const sender = createSender(env);
    for (const message of batch.messages) {
      const event = message.body as PushEvent;
      try {
        const service = new PushService(
          createServiceContext(env, {
            schoolId: Number(event.schoolId),
            userId: null,
            staffId: null,
            designationId: null,
            roleId: null,
            academicId: null,
            classId: null,
            sectionId: null
          })
        );
        const result = await deliverEvent(service, sender, event, Math.floor(Date.now() / 1000));
        console.log("push delivered", {
          eventId: event.id,
          kind: event.kind,
          ...result
        });
        message.ack();
      } catch (error) {
        console.error("push delivery failed", { eventId: event.id, error: String(error) });
        message.retry({ delaySeconds: 30 });
      }
    }
  }
} satisfies ExportedHandler<AppEnv, PushEvent>;
