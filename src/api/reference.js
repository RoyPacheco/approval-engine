import { get as apiFetch, put } from "./client.js";

export const get    = ()      => apiFetch("/api/reference");
export const update = (data)  => put("/api/reference", data);
