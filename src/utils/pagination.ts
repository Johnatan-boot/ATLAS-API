import { z } from "zod";
export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(100),
});
export interface Page<T> { data: T[]; page: number; pageSize: number; total: number }
export const offsetOf = (page: number, pageSize: number) => (page - 1) * pageSize;
