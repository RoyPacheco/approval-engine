import { get, put, del } from "./client.js";

export const getAll  = ()       => get("/api/connections");
export const getOne  = (id)     => get(`/api/connections/${id}`);
export const upsert  = (conn)   => put(`/api/connections/${conn.id}`, conn);
export const remove  = (id)     => del(`/api/connections/${id}`);
