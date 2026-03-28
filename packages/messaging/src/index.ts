import { Kafka, logLevel, type Consumer, type EachMessagePayload, type Producer, type SASLOptions } from "kafkajs";
import { env } from "@repo/config";
import { logger } from "@repo/shared";

let producerPromise: Promise<Producer> | null = null;

// SASL is optional locally, but this helper lets the same code work with secured
// managed Kafka clusters in production.
function buildSaslConfig(): SASLOptions | undefined {
  if (!env.KAFKA_SASL_MECHANISM || !env.KAFKA_SASL_USERNAME || !env.KAFKA_SASL_PASSWORD) {
    return undefined;
  }

  if (env.KAFKA_SASL_MECHANISM !== "plain" && env.KAFKA_SASL_MECHANISM !== "scram-sha-256" && env.KAFKA_SASL_MECHANISM !== "scram-sha-512") {
    throw new Error("Unsupported Kafka SASL mechanism");
  }

  return {
    mechanism: env.KAFKA_SASL_MECHANISM,
    username: env.KAFKA_SASL_USERNAME,
    password: env.KAFKA_SASL_PASSWORD
  };
}

const kafka = new Kafka({
  clientId: env.KAFKA_CLIENT_ID,
  brokers: env.KAFKA_BROKERS.split(",").map((broker) => broker.trim()).filter(Boolean),
  ssl: env.KAFKA_SSL,
  sasl: buildSaslConfig(),
  logLevel: logLevel.NOTHING
});

// Services publish often, so we create one shared producer and reuse it for the
// whole process instead of reconnecting for every event.
async function getProducer(): Promise<Producer> {
  if (!producerPromise) {
    producerPromise = (async () => {
      const producer = kafka.producer({
        // Producer-side idempotence reduces duplicate writes when the producer retries.
        allowAutoTopicCreation: true,
        idempotent: true,
        maxInFlightRequests: 1
      });
      await producer.connect();
      return producer;
    })();
  }
  return producerPromise;
}

// All service events go through this helper so we keep a consistent topic/key/header
// format across the saga.
export async function publishEvent(topic: string, routingKey: string, payload: unknown, headers: Record<string, unknown> = {}): Promise<void> {
  const producer = await getProducer();
  const normalizedHeaders = Object.entries({
    routingKey,
    ...headers
  }).reduce<Record<string, Buffer>>((accumulator, [key, value]) => {
    accumulator[key] = Buffer.from(String(value));
    return accumulator;
  }, {});

  await producer.send({
    topic,
    messages: [
      {
        // We partition by orderId when possible so all events for one order stay ordered.
        key: typeof payload === "object" && payload !== null && "orderId" in payload
          ? String((payload as Record<string, unknown>).orderId)
          : routingKey,
        value: Buffer.from(JSON.stringify(payload)),
        headers: normalizedHeaders
      }
    ]
  });
}

// This wrapper hides Kafka consumer setup and gives each service a simple callback.
// The service still owns idempotency and business logic inside the handler.
export async function consumeTopics(input: {
  groupId: string;
  topics: string[];
  routingKeys?: string[];
  handler: (message: EachMessagePayload, payload: any) => Promise<void>;
}): Promise<Consumer> {
  const consumer = kafka.consumer({
    groupId: input.groupId,
    allowAutoTopicCreation: true
  });

  await consumer.connect();
  for (const topic of input.topics) {
    await consumer.subscribe({ topic, fromBeginning: false });
  }

  await consumer.run({
    eachMessage: async (messagePayload) => {
      const routingKey = messagePayload.message.headers?.routingKey?.toString();
      const correlationId = messagePayload.message.headers?.correlationId?.toString();

      try {
        // We use routingKey headers to emulate command/event filtering without creating
        // one Kafka topic per single event type.
        if (input.routingKeys?.length && (!routingKey || !input.routingKeys.includes(routingKey))) {
          return;
        }

        logger.info({ correlationId, routingKey, groupId: input.groupId, topic: messagePayload.topic }, "processing message");

        const payload = JSON.parse(messagePayload.message.value?.toString("utf8") ?? "{}");
        await input.handler(messagePayload, payload);
      } catch (error) {
        logger.error({ err: error, correlationId, routingKey, groupId: input.groupId, topic: messagePayload.topic }, "message handling failed");
        throw error;
      }
    }
  });

  return consumer;
}
