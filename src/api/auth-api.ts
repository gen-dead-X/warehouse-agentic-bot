import { apiRequest } from "./http-client";

export interface LoginRequestBody {
  email: string;
  password: string;
}

export type LoginResponse = {
  message: string;
  success: boolean;
  data: {
    accessToken: string;
    refreshToken: string;
  };
};

export async function loginWithEmailPassword(
  payload: LoginRequestBody,
): Promise<LoginResponse> {
  return apiRequest<LoginResponse>({
    url: "/user/auth/login",
    method: "POST",
    data: payload,
  });
}
