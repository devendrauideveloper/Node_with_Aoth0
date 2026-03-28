import { getUserAuthorizations } from "@repo/auth";
import { upsertUserGroupMembership } from "../repositories/session.repository.js";
import { requireCsrf } from "../services/session.service.js";

export async function assignGroupMembershipController(request: any, reply: any) {
  if (!requireCsrf(request, reply)) {
    return;
  }

  const authorizations = await getUserAuthorizations(request.session.auth0_sub);
  if (!authorizations.privileges.includes("MODIFY")) {
    return reply.code(403).send({ message: "Insufficient privileges" });
  }

  await upsertUserGroupMembership(request.body);
  return { ok: true };
}

