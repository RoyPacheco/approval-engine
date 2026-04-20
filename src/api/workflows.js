import { get, put, del } from "./client.js";

export const getAll  = ()          => get("/api/workflows");
export const getOne  = (id)        => get(`/api/workflows/${id}`);
export const upsert  = (workflow)  => put(`/api/workflows/${workflow.id}`, workflow);
export const remove  = (id)        => del(`/api/workflows/${id}`);
