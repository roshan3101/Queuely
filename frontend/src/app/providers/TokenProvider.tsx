import { createContext, useContext, useState, ReactNode } from "react";
import { readTokens, writeTokens, clearTokens, type TokenState } from "@/lib/authStorage";

type TokenContextProps = {
  tokenState: TokenState;
  setTokenState: (next: TokenState) => void;
  logout: () => void;
};

const TokenContext = createContext<TokenContextProps | undefined>(undefined);

export function TokenProvider({ children }: { children: ReactNode }) {
  const [tokenState, setTokenState] = useState<TokenState>(readTokens());

  const logout = () => {
    clearTokens();
    setTokenState({ accessToken: "", refreshToken: "" });
  };

  return (
    <TokenContext.Provider value={{ tokenState, setTokenState, logout }}>
      {children}
    </TokenContext.Provider>
  );
}

export function useToken(): TokenContextProps {
  const ctx = useContext(TokenContext);
  if (!ctx) throw new Error("useToken must be used within TokenProvider");
  return ctx;
}
