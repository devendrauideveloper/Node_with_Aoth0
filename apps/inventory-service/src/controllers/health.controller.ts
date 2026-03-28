export async function healthController() {
  return { status: "ok", service: "inventory-service" };
}

