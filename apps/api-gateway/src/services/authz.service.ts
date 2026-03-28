import { getUserAuthorizations, verifyAccessToken } from "@repo/auth";

export async function authorize(request: any, reply: any) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return reply.code(401).send({ message: "Missing bearer token" });
  }

  const payload = await verifyAccessToken(authHeader.slice("Bearer ".length));
  const auth0Sub = String(payload.sub);
  const authorizations = await getUserAuthorizations(auth0Sub);

  request.auth = {
    sub: auth0Sub,
    privileges: authorizations.privileges,
    groups: authorizations.groups
  };
}

export function requirePrivilege(privilege: string) {
  return async (request: any, reply: any) => {
    if (!request.auth?.privileges.includes(privilege)) {
      return reply.code(403).send({ message: `Missing privilege: ${privilege}` });
    }
  };
}

