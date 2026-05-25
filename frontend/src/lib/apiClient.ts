import type { TokenState } from "./authStorage";

type ApiResponse<T> = {
  success: boolean;
  data: T;
  request_id?: string | null;
};

async function readApiError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    return payload.error?.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

export async function apiFetch<T>(
  baseUrl: string,
  tokenState: TokenState,
  setTokenState: (next: TokenState) => void,
  path: string,
  init?: RequestInit
): Promise<T> {
  const doFetch = async (accessToken: string) => {
    return fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.headers ?? {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });
  };

  let response = await doFetch(tokenState.accessToken);

  if (response.status === 401 && tokenState.refreshToken) {
    const refreshResp = await fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: tokenState.refreshToken }),
    });
    if (refreshResp.ok) {
      const refreshPayload = (await refreshResp.json()) as ApiResponse<{
        tokens: { access_token: string; refresh_token: string };
      }>;
      const next = {
        accessToken: refreshPayload.data.tokens.access_token,
        refreshToken: refreshPayload.data.tokens.refresh_token,
      };
      setTokenState(next);
      response = await doFetch(next.accessToken);
    }
  }

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
  return (await response.json()) as T;
}

