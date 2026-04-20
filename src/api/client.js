/**
 * Base API client.
 * All requests go to /api/* which Vite proxies to the Python backend in dev,
 * and the production reverse-proxy routes in prod.
 */

const BASE = import.meta.env.VITE_API_URL ?? "";

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  return res.status === 204 ? null : res.json();
}

export const get   = (path)        => request("GET",    path);
export const post  = (path, body)  => request("POST",   path, body);
export const put   = (path, body)  => request("PUT",    path, body);
export const patch = (path, body)  => request("PATCH",  path, body);
export const del   = (path)        => request("DELETE", path);
