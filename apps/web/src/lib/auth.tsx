import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import type { PropsWithChildren } from "react";

export const authDisabled = import.meta.env.VITE_AUTH_DISABLED === "true";
export const auth0Configured = Boolean(
  import.meta.env.VITE_AUTH0_DOMAIN && import.meta.env.VITE_AUTH0_CLIENT_ID && import.meta.env.VITE_AUTH0_AUDIENCE
);

export function AuthProvider({ children }: PropsWithChildren) {
  if (authDisabled) {
    return children;
  }

  return (
    <Auth0Provider
      domain={import.meta.env.VITE_AUTH0_DOMAIN}
      clientId={import.meta.env.VITE_AUTH0_CLIENT_ID}
      authorizationParams={{
        audience: import.meta.env.VITE_AUTH0_AUDIENCE,
        redirect_uri: window.location.origin
      }}
    >
      {children}
    </Auth0Provider>
  );
}

export function useAppAuth() {
  if (authDisabled) {
    return {
      isAuthenticated: true,
      isLoading: false,
      user: { name: "Local Developer", email: "dev@olivechat.local" },
      loginWithRedirect: async () => undefined,
      logout: () => undefined,
      getAccessTokenSilently: async () => ""
    };
  }
  return useAuth0();
}
