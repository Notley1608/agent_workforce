import type { ZodType } from "zod";

async function request<T>(path: string, schema: ZodType<T>, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
  if (!res.ok) {
    throw new Error(`${init?.method ?? "GET"} /api${path} failed: ${res.status} ${await res.text()}`);
  }
  return schema.parse(await res.json());
}

export function apiGet<T>(path: string, schema: ZodType<T>): Promise<T> {
  return request(path, schema);
}

export function apiPost<T>(path: string, schema: ZodType<T>, body?: unknown): Promise<T> {
  return request(path, schema, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined });
}

export function apiDelete<T>(path: string, schema: ZodType<T>): Promise<T> {
  return request(path, schema, { method: "DELETE" });
}
