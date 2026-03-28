import type { Request, Response } from "express";
import { getUserAuthorizations } from "@repo/auth";
import { upsertUserGroupMembership } from "../repositories/session.repository.js";
import { requireCsrf } from "../services/session.service.js";

export async function assignGroupMembershipController(req: Request, res: Response) {
  if (!requireCsrf(req, res)) return;

  const authorizations = await getUserAuthorizations(req.session.auth0_sub);
  if (!authorizations.privileges.includes("MODIFY")) {
    res.status(403).json({ message: "Insufficient privileges" });
    return;
  }

  await upsertUserGroupMembership(req.body);
  res.json({ ok: true });
}
