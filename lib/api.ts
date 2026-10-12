import { AppError, errorBody, toAppError } from "./errors";
import { logger } from "./logger";

export function jsonError(err: unknown, extraHeaders?: Record<string, string>) {
  const appErr = toAppError(err);
  if (appErr.code === "INTERNAL") logger.error({ err }, "unhandled error");
  return Response.json(errorBody(appErr), {
    status: appErr.status,
    headers: { "Cache-Control": "no-store", ...extraHeaders },
  });
}

export function noStoreJson(body: unknown, init?: ResponseInit) {
  return Response.json(body, {
    ...init,
    headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) },
  });
}

export { AppError };
