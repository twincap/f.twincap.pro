import {
  authenticateCredentials,
  createSessionToken,
  setSessionCookie,
} from "@/server/auth";
import {
  ApiRequestError,
  assertSameOrigin,
  jsonNoStore,
  readJsonObject,
  toErrorResponse,
} from "@/server/http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJsonObject(request);
    const username = body.username;
    const password = body.password;

    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      username.length > 128 ||
      password.length > 512
    ) {
      throw new ApiRequestError(
        400,
        "invalid_credentials",
        "아이디와 비밀번호를 확인해 주세요.",
      );
    }

    const user = authenticateCredentials(username, password);
    if (!user) {
      throw new ApiRequestError(
        401,
        "invalid_credentials",
        "아이디 또는 비밀번호가 올바르지 않습니다.",
      );
    }

    const response = jsonNoStore({ user });
    setSessionCookie(response, createSessionToken(user));
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}
