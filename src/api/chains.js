import { get, put, del } from "./client.js";

export const getAll  = ()        => get("/api/chains");
export const getOne  = (id)      => get(`/api/chains/${id}`);
export const upsert  = (chain)   => put(`/api/chains/${chain.id}`, chain);
export const remove  = (id)      => del(`/api/chains/${id}`);
