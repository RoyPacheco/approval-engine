import { get as apiFetch, post } from "./client.js";

/** Exchange OAuth credentials for an access token (uses connection_id or .env creds). */
export const getToken       = (connectionId) =>
  post("/api/coupa/token" + (connectionId ? `?connection_id=${connectionId}` : ""), {});

/** Fetch chain types — falls back to static list if Coupa is unreachable. */
export const getChainTypes  = ()             => apiFetch("/api/coupa/chain-types");

/** Proxy a GET request to the Coupa API through the secure backend. */
export const proxy          = (path, connectionId) =>
  apiFetch(`/api/coupa/proxy/${path}` + (connectionId ? `?connection_id=${connectionId}` : ""));
