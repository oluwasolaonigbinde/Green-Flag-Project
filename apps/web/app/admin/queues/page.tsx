import Link from "next/link";
import {
  adminApplicationQueueFixture,
  adminDocumentQueueFixture,
  adminPaymentQueueFixture,
  adminRegistrationQueueFixture
} from "@green-flag/contracts";

export default function AdminQueuesPage() {
  return (
    <main className="admin-shell">
      <section className="page-heading admin-heading-row">
        <div>
          <p className="eyebrow">Admin queues</p>
          <h1>Operational work queues</h1>
        </div>
        <Link className="button-link" href="/admin">
          Dashboard
        </Link>
      </section>

      <section className="queue-tabs" aria-label="Queue filters">
        <a href="#registrations">Registrations</a>
        <a href="#applications">Applications</a>
        <a href="#payments">Payments</a>
        <a href="#documents">Documents</a>
      </section>

      <section className="queue-section" id="registrations">
        <div className="section-title-row">
          <h2>Registrations</h2>
          <span className="status-pill">{adminRegistrationQueueFixture.page.totalItems} item</span>
        </div>
        <div className="queue-table">
          <div className="queue-row queue-row--head">
            <span>Park</span>
            <span>Organisation</span>
            <span>Status</span>
            <span>Duplicate</span>
            <span>Decision</span>
          </div>
          {adminRegistrationQueueFixture.items.map((item) => (
            <div className="queue-row" key={item.registrationId}>
              <span>{item.parkName}</span>
              <span>{item.organisationName}</span>
              <span>{item.status}</span>
              <span>{item.duplicateWarning.hasPotentialDuplicate ? "Acknowledged" : "None"}</span>
              <span>Review</span>
            </div>
          ))}
        </div>
      </section>

      <section className="queue-section" id="applications">
        <div className="section-title-row">
          <h2>Applications</h2>
          <span className="status-pill">{adminApplicationQueueFixture.page.totalItems} items</span>
        </div>
        <div className="queue-table">
          <div className="queue-row admin-application-row queue-row--head">
            <span>Park</span>
            <span>Status</span>
            <span>Payment</span>
            <span>Documents</span>
            <span>Attention</span>
            <span>Detail</span>
          </div>
          {adminApplicationQueueFixture.items.map((item) => (
            <div className="queue-row admin-application-row" key={item.applicationId}>
              <span>{item.parkName}</span>
              <span>{item.applicationStatus}</span>
              <span>{item.paymentStatus}</span>
              <span>{item.documentStatus}</span>
              <span>{item.attentionFlags.join(", ") || "none"}</span>
              <Link href={`/admin/applications/${item.applicationId}`}>Open</Link>
            </div>
          ))}
        </div>
      </section>

      <section className="queue-section" id="payments">
        <div className="section-title-row">
          <h2>Payments</h2>
          <span className="status-pill">{adminPaymentQueueFixture.page.totalItems} item</span>
        </div>
        <div className="queue-table">
          <div className="queue-row admin-payment-row queue-row--head">
            <span>Park</span>
            <span>Status</span>
            <span>Amount</span>
            <span>Due</span>
            <span>PO</span>
          </div>
          {adminPaymentQueueFixture.items.map((item) => (
            <div className="queue-row admin-payment-row" key={item.invoiceId}>
              <span>{item.parkName}</span>
              <span>{item.status}</span>
              <span>{item.amount}</span>
              <span>{item.dueAt}</span>
              <span>{item.purchaseOrder.purchaseOrderNumber ?? "No PO declared"}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="queue-section" id="documents">
        <div className="section-title-row">
          <h2>Documents</h2>
          <span className="status-pill">{adminDocumentQueueFixture.page.totalItems} items</span>
        </div>
        <div className="queue-table">
          <div className="queue-row admin-document-row queue-row--head">
            <span>Park</span>
            <span>Type</span>
            <span>Status</span>
            <span>Visibility</span>
            <span>Version</span>
          </div>
          {adminDocumentQueueFixture.items.map((item) => (
            <div className="queue-row admin-document-row" key={item.documentId}>
              <span>{item.parkName}</span>
              <span>{item.documentType}</span>
              <span>{item.status}</span>
              <span>{item.visibility}</span>
              <span>v{item.version}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
