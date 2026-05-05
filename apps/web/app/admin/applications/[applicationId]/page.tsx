import Link from "next/link";
import { adminApplicationDetailFixture } from "@green-flag/contracts";

export default function AdminApplicationDetailPage() {
  const detail = adminApplicationDetailFixture;

  return (
    <main className="admin-shell">
      <section className="page-heading admin-heading-row">
        <div>
          <p className="eyebrow">Application detail</p>
          <h1>{detail.application.parkName}</h1>
        </div>
        <Link className="button-link" href="/admin/queues">
          Queues
        </Link>
      </section>

      <section className="detail-grid">
        <article className="panel form-panel">
          <p className="eyebrow">Package</p>
          <h2>{detail.application.applicationStatus}</h2>
          <dl>
            <div>
              <dt>Organisation</dt>
              <dd>{detail.application.organisationName}</dd>
            </div>
            <div>
              <dt>Cycle</dt>
              <dd>{detail.application.cycleYear}</dd>
            </div>
            <div>
              <dt>Display status</dt>
              <dd>{detail.application.displayStatus}</dd>
            </div>
            <div>
              <dt>Attention</dt>
              <dd>{detail.application.attentionFlags.join(", ") || "none"}</dd>
            </div>
          </dl>
        </article>

        <article className="panel form-panel">
          <p className="eyebrow">Payment</p>
          <h2>{detail.invoice.status}</h2>
          <dl>
            <div>
              <dt>Amount</dt>
              <dd>{detail.invoice.amount}</dd>
            </div>
            <div>
              <dt>Due</dt>
              <dd>{detail.invoice.dueAt}</dd>
            </div>
            <div>
              <dt>Manual paid</dt>
              <dd>{detail.payment.manuallyMarkedPaid ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt>Override</dt>
              <dd>{detail.payment.overrideApplied ? "Applied" : "None"}</dd>
            </div>
          </dl>
        </article>

        <article className="panel form-panel">
          <p className="eyebrow">Documents</p>
          <h2>{detail.application.documentStatus}</h2>
          <div className="document-list">
            {detail.documents.map((document) => (
              <div className="document-card" key={document.documentId}>
                <h3>{document.documentType}</h3>
                <span className="status-pill">{document.status}</span>
                <p className="muted-note">
                  {document.visibility} · v{document.version} · archived {document.archivedVersionCount}
                </p>
              </div>
            ))}
          </div>
        </article>

        <article className="panel form-panel">
          <p className="eyebrow">Allocation readiness</p>
          <h2>{detail.allocationReadiness.readiness}</h2>
          <dl>
            <div>
              <dt>Reason codes</dt>
              <dd>{detail.allocationReadiness.reasonCodes.join(", ")}</dd>
            </div>
            <div>
              <dt>Candidate generation</dt>
              <dd>{detail.allocationReadiness.candidateGenerationAvailable ? "Available" : "Unavailable"}</dd>
            </div>
            <div>
              <dt>Results</dt>
              <dd>{detail.result.displayLabel}</dd>
            </div>
          </dl>
        </article>
      </section>
    </main>
  );
}
