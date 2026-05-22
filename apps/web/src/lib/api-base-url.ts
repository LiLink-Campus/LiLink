const DEFAULT_API_BASE_URL = "http://localhost:4000/v1";

function resolveApiBaseUrl() {
  const configuredApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

  if (configuredApiBaseUrl) {
    return configuredApiBaseUrl;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL is required in production runtime.",
    );
  }

  return DEFAULT_API_BASE_URL;
}

export const apiBaseUrl = resolveApiBaseUrl();
