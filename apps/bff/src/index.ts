import { env } from "@repo/config";
import { buildApp } from "./app.js";

const app = await buildApp();

await app.listen({
  port: env.BFF_PORT,
  host: "0.0.0.0"
});

