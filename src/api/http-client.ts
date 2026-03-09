import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";
import {
  clearAuthTokens,
  getAccessToken,
  getRefreshToken,
  saveAuthTokens,
} from "../lib/auth-storage";

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };

type RefreshResponse = {
  data?: {
    accessToken?: string;
    refreshToken?: string;
  };
  accessToken?: string;
  refreshToken?: string;
};

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3030";

let refreshingPromise: Promise<string | null> | null = null;

function parseRefreshPayload(
  payload: RefreshResponse,
): { accessToken: string; refreshToken: string } | null {
  const accessToken = payload.data?.accessToken ?? payload.accessToken;
  const refreshToken = payload.data?.refreshToken ?? payload.refreshToken;

  if (!accessToken || !refreshToken) {
    return null;
  }

  return { accessToken, refreshToken };
}

async function refreshAccessToken(): Promise<string | null> {
  const currentRefreshToken = getRefreshToken();
  if (!currentRefreshToken) {
    return null;
  }

  const response = await axios.post<RefreshResponse>(
    `${API_BASE_URL}/refresh-token`,
    { refreshToken: currentRefreshToken },
    {
      headers: {
        Authorization: `Bearer ${currentRefreshToken}`,
      },
    },
  );

  const tokenPayload = parseRefreshPayload(response.data);
  if (!tokenPayload) {
    return null;
  }

  saveAuthTokens(tokenPayload);
  return tokenPayload.accessToken;
}

function attachInterceptors(client: AxiosInstance): AxiosInstance {
  client.interceptors.request.use((config) => {
    const accessToken = getAccessToken();
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const statusCode = error.response?.status;
      const originalRequest = error.config as RetryConfig | undefined;
      const url = originalRequest?.url ?? "";

      const isRefreshRequest = url.includes("/refresh-token");
      const isLoginRequest = url.includes("/user/auth/login");

      if (
        !originalRequest ||
        statusCode !== 401 ||
        originalRequest._retry ||
        isRefreshRequest ||
        isLoginRequest
      ) {
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      try {
        if (!refreshingPromise) {
          refreshingPromise = refreshAccessToken().finally(() => {
            refreshingPromise = null;
          });
        }

        const nextAccessToken = await refreshingPromise;
        if (!nextAccessToken) {
          clearAuthTokens();
          return Promise.reject(error);
        }

        originalRequest.headers = originalRequest.headers ?? {};
        originalRequest.headers.Authorization = `Bearer ${nextAccessToken}`;
        return client.request(originalRequest);
      } catch (refreshError) {
        clearAuthTokens();
        return Promise.reject(refreshError);
      }
    },
  );

  return client;
}

const rawApiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

export const apiClient = attachInterceptors(rawApiClient);

export function getApiClient(): AxiosInstance {
  return apiClient;
}

export async function apiRequest<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.request<T>(config);
  return response.data;
}
