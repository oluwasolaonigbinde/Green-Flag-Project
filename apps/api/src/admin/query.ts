import type { FastifyRequest } from "fastify";
import { adminQueueQuerySchema } from "@green-flag/contracts";

export type QueueQuery = ReturnType<typeof adminQueueQuerySchema.parse>;

export const adminQueueFilters = ["status", "cycleYear", "paymentStatus", "documentStatus", "attention"];
export const registrationQueueFilters = ["status", "search"];

export function parseQuery(request: FastifyRequest) {
  return adminQueueQuerySchema.parse(request.query ?? {});
}

export function paginate<T>(items: T[], query: QueueQuery) {
  const start = (query.page - 1) * query.pageSize;
  return items.slice(start, start + query.pageSize);
}

export function pageMeta(totalItems: number, query: QueueQuery, availableFilters = adminQueueFilters) {
  return {
    page: query.page,
    pageSize: query.pageSize,
    totalItems,
    availableFilters
  };
}

export function textMatches(query: QueueQuery, ...values: string[]) {
  if (!query.search) {
    return true;
  }
  const needle = query.search.toLowerCase();
  return values.some((value) => value.toLowerCase().includes(needle));
}
