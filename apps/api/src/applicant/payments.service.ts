
import { ApiError } from "../auth.js";
import type { ApplicantStore } from "./store.js";

export function applicationInvoice(store: ApplicantStore, applicationId: string) {
  return [...store.invoices.values()].find((invoice) => invoice.applicationId === applicationId);
}

export function requireInvoice(store: ApplicantStore, invoiceId: string) {
  const invoice = store.invoices.get(invoiceId);
  if (!invoice) {
    throw new ApiError("dependency_missing", 404, "Invoice was not found.");
  }
  return invoice;
}
