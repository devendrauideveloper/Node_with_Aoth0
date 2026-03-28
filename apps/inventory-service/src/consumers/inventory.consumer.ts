import { consumeTopics } from "@repo/messaging";
import { routingKeys, topics } from "@repo/shared";
import { handleInventoryCommand } from "../services/inventory.service.js";

export async function startInventoryConsumer() {
  await consumeTopics({
    groupId: "inventory-service-commands",
    topics: [topics.inventory],
    routingKeys: [routingKeys.reserveInventory, routingKeys.releaseInventory],
    handler: handleInventoryCommand
  });
}

