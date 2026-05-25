export const ACCESS_TOKEN_KEY = "queuely.accessToken";
export const REFRESH_TOKEN_KEY = "queuely.refreshToken";

export type TokenState = { accessToken: string; refreshToken: string };

export function readTokens(): TokenState {
  if (typeof window === "undefined") return { accessToken: "", refreshToken: "" };
  try {
    return {
      accessToken: window.localStorage.getItem(ACCESS_TOKEN_KEY) ?? "",
      refreshToken: window.localStorage.getItem(REFRESH_TOKEN_KEY) ?? "",
    };
  } catch {
    return { accessToken: "", refreshToken: "" };
  }
}

export function writeTokens(tokens: TokenState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    window.localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  } catch {
    // ignore
  }
}

export function clearTokens() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    // ignore
  }
}

