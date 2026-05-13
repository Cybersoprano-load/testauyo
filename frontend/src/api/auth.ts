import { apiRequest } from "./client";

export interface UserPublic {
  id: string;
  email: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: UserPublic;
}

export interface AuthCredentials {
  email: string;
  password: string;
}

export const authApi = {
  register: (creds: AuthCredentials) =>
    apiRequest<TokenResponse>("/api/v1/auth/register", {
      method: "POST",
      body: creds,
      auth: false,
    }),
  login: (creds: AuthCredentials) =>
    apiRequest<TokenResponse>("/api/v1/auth/login", {
      method: "POST",
      body: creds,
      auth: false,
    }),
  refresh: () =>
    apiRequest<TokenResponse>("/api/v1/auth/refresh", {
      method: "POST",
      auth: false,
      retry: false,
    }),
  logout: () =>
    apiRequest<{ message: string }>("/api/v1/auth/logout", {
      method: "POST",
      auth: false,
    }),
  me: () => apiRequest<UserPublic>("/api/v1/auth/me"),
};
