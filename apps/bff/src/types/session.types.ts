export interface AppSession {
  id: string;
  access_token: string;
  access_token_expires_at: string;
  refresh_token_ciphertext: string;
  refresh_token_expires_at: string | null;
  csrf_token: string;
  auth0_sub: string;
  email: string;
  display_name: string | null;
}

export interface GroupMembershipPayload {
  auth0Sub: string;
  email: string;
  displayName?: string;
  groupCode: "ADMIN" | "MANAGER" | "USER";
}

