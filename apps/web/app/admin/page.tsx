import Link from "next/link";
import { adminDashboardSummaryFixture, adminApplicationQueueFixture } from "@green-flag/contracts";

export default function AdminDashboardPage() {
  const counts = adminDashboardSummaryFixture.counts;

  return (
    <main className="admin-shell">
      <section className="page-heading admin-heading-row">
        <div>
          <p className="eyebrow">Super Admin</p>
          <h1>Operational dashboard</h1>
        </div>
        <Link className="button-link" href="/admin/queues">
          View queues
        </Link>
      </section>

      <section className="metric-grid" aria-label="Admin dashboard summary">
        <article className="metric-card">
          <span>Registrations</span>
          <strong>{counts.registrationsPendingReview}</strong>
          <small>Pending review</small>
        </article>
        <article className="metric-card">
          <span>Applications</span>
          <strong>{counts.applicationsSubmitted}</strong>
          <small>Submitted packages</small>
        </article>
        <article className="metric-card">
          <span>Payments</span>
          <strong>{counts.paymentsNeedAttention}</strong>
          <small>Need attention</small>
        </article>
        <article className="metric-card">
          <span>Documents</span>
          <strong>{counts.documentsNeedAttention}</strong>
          <small>Need attention</small>
        </article>
        <article className="metric-card">
          <span>Allocation preview</span>
          <strong>{counts.allocationReadyPreview}</strong>
          <small>No candidates generated</small>
        </article>
        <article className="metric-card">
          <span>Results</span>
          <strong>{counts.resultsUnavailable}</strong>
          <small>Deferred</small>
        </article>
      </section>

      <section className="dashboard-band">
        <div>
          <p className="eyebrow">Attention</p>
          <h2>Work queues</h2>
        </div>
        <div className="attention-list">
          {adminDashboardSummaryFixture.attention.map((item) => (
            <Link href="/admin/queues" key={item.queue}>
              <span>{item.label}</span>
              <strong>{item.count}</strong>
            </Link>
          ))}
        </div>
      </section>

      <section className="queue-table" aria-label="Recent application operations">
        <div className="queue-row admin-application-row queue-row--head">
          <span>Park</span>
          <span>Status</span>
          <span>Payment</span>
          <span>Documents</span>
          <span>Readiness</span>
          <span>Detail</span>
        </div>
        {adminApplicationQueueFixture.items.map((item) => (
          <div className="queue-row admin-application-row" key={item.applicationId}>
            <span>{item.parkName}</span>
            <span>{item.displayStatus}</span>
            <span>{item.paymentStatus}</span>
            <span>{item.documentStatus}</span>
            <span>{item.allocationReadiness}</span>
            <Link href={`/admin/applications/${item.applicationId}`}>Open</Link>
          </div>
        ))}
      </section>
    </main>
  );
}
