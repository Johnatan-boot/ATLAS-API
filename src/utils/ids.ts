import { createHash, randomBytes, randomUUID } from "node:crypto";
export const newId = (prefix = "") => prefix + randomUUID().replace(/-/g, "").slice(0, 20);
export const randomToken = (bytes = 48) => randomBytes(bytes).toString("base64url");
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
/** Mesma normalização usada no frontend para comparar nomes (sem acento, minúsculo, espaços simples). */
export const nameKey = (v: string) => String(v ?? "").trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");
export const skuKey = (v: string) => String(v ?? "").trim().toUpperCase();
export const nowISO = () => new Date().toISOString();
