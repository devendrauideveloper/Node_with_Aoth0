export async function healthController() {
  return { status: "ok", service: "payment-service" };
}

