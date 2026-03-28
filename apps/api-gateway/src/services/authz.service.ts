import type { Request, Response, NextFunction } from "express";
import { getUserAuthorizations, verifyAccessToken } from "@repo/auth";

declare global {
  namespace Express {
    interface Request {
      auth: {
        sub: string;
        privileges: string[];
        groups: string[];
      };
    }
  }
}

export async function authorize(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Missing bearer token" });
    return;
  }

  const payload = await verifyAccessToken(authHeader.slice("Bearer ".length));
  const auth0Sub = String(payload.sub);
  const authorizations = await getUserAuthorizations(auth0Sub);

  req.auth = {
    sub: auth0Sub,
    privileges: authorizations.privileges,
    groups: authorizations.groups
  };
  next();
}

export function requirePrivilege(privilege: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth?.privileges.includes(privilege)) {
      res.status(403).json({ message: `Missing privilege: ${privilege}` });
      return;
    }
    next();
  };
}
