export async function healthController() {
  return { status: "ok", service: "order-service" };
}

