export class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

type TokenGetter = () => string | null;
type TokenSetter = (token: string | null) => void;
type OnAuthFailure = () => void;

let _getToken: TokenGetter = () => null;
let _setToken: TokenSetter = () => {};
let _onAuthFailure: OnAuthFailure = () => {};

export function configureApi(opts: {
  getToken: TokenGetter;
  setToken: TokenSetter;
  onAuthFailure: OnAuthFailure;
}) {
  _getToken = opts.getToken;
  _setToken = opts.setToken;
  _onAuthFailure = opts.onAuthFailure;
}

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") return body.detail;
    return res.statusText || `HTTP ${res.status}`;
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}

interface RawOpts {
  method?: string;
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
}

async function rawRequest(path: string, opts: RawOpts): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.auth) {
    const token = _getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  return fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "include",
    signal: opts.signal,
  });
}

let refreshInflight: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  if (!refreshInflight) {
    refreshInflight = (async () => {
      try {
        const res = await rawRequest("/api/v1/auth/refresh", { method: "POST" });
        if (!res.ok) return null;
        const data = (await res.json()) as { access_token: string };
        _setToken(data.access_token);
        return data.access_token;
      } catch {
        return null;
      } finally {
        setTimeout(() => {
          refreshInflight = null;
        }, 0);
      }
    })();
  }
  return refreshInflight;
}

export interface RequestOpts extends RawOpts {
  retry?: boolean;
}

export async function apiRequest<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const authed = opts.auth ?? true;
  let res = await rawRequest(path, { ...opts, auth: authed });

  if (res.status === 401 && authed && opts.retry !== false) {
    const newToken = await tryRefresh();
    if (newToken) {
      res = await rawRequest(path, { ...opts, auth: true });
    } else {
      _onAuthFailure();
      throw new ApiError(401, "Not authenticated");
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, await parseError(res));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
