export async function healthController() {
  return { status: "ok", service: "api-gateway" };
}

