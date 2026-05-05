import {
  applicationDocumentsFixture,
  applicationDraftFixture,
  applicationSubmissionFixture,
  paymentSummaryFixture
} from "@green-flag/contracts";

const stepLabels = {
  location: "Location",
  site_information: "Site information",
  contact_details: "Contact details",
  publicity: "Publicity",
  optional_information: "Optional information",
  previous_feedback: "Previous feedback",
  documents: "Documents",
  review: "Review"
} as const;

export default function ApplicantApplicationDraftPage() {
  return (
    <main className="app-shell">
      <section className="page-heading">
        <p className="eyebrow">Application draft</p>
        <h1>Continue application</h1>
        <p className="lead">Review the applicant package, submit it, and track the lower-env invoice state.</p>
      </section>

      <section className="wizard-layout">
        <aside className="panel wizard-nav">
          {applicationDraftFixture.sections.map((section) => (
            <a href={`#${section.sectionKey}`} key={section.sectionKey}>
              <span>{stepLabels[section.sectionKey]}</span>
              <strong>{section.completionPercent}%</strong>
            </a>
          ))}
          <a href="#documents">
            <span>{stepLabels.documents}</span>
            <strong>{applicationDocumentsFixture.documentCompletionStatus === "complete" ? "100%" : "0%"}</strong>
          </a>
          <a href="#payment">
            <span>Payment</span>
            <strong>{paymentSummaryFixture.invoice.status}</strong>
          </a>
        </aside>

        <section className="panel form-panel">
          <div className="draft-toolbar">
            <span className="status-pill">{applicationDraftFixture.status}</span>
            <span>{applicationDraftFixture.completionPercent}% complete</span>
          </div>

          {applicationDraftFixture.sections.map((section) => (
            <section className="draft-section" id={section.sectionKey} key={section.sectionKey}>
              <h2>{stepLabels[section.sectionKey]}</h2>
              <p className="muted-note">Section status: {section.status}</p>
              <label>
                Draft notes
                <textarea defaultValue={Object.values(section.fields).join("\n")} />
              </label>
            </section>
          ))}

          <section className="draft-section" id="documents">
            <h2>Documents</h2>
            <p className="muted-note">Management plan upload uses lower-env signed access placeholders.</p>
            <div className="document-list">
              {applicationDocumentsFixture.slots.map((slot) => (
                <article className="document-card" key={slot.documentType}>
                  <div>
                    <p className="eyebrow">{slot.required ? "Required" : "Optional"}</p>
                    <h3>{slot.label}</h3>
                  </div>
                  <span className="status-pill">{slot.completionStatus}</span>
                  {slot.currentDocument ? (
                    <dl>
                      <div>
                        <dt>File</dt>
                        <dd>{slot.currentDocument.filename}</dd>
                      </div>
                      <div>
                        <dt>Version</dt>
                        <dd>v{slot.currentDocument.version}</dd>
                      </div>
                      <div>
                        <dt>Archived</dt>
                        <dd>{slot.archivedVersionCount}</dd>
                      </div>
                      <div>
                        <dt>Access</dt>
                        <dd>{slot.currentDocument.visibility}</dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="muted-note">No document uploaded yet.</p>
                  )}
                  <div className="upload-progress">
                    <div className="progress-track" aria-label={`${slot.completionStatus} document progress`}>
                      <span style={{ width: slot.completionStatus === "uploaded" ? "100%" : "0%" }} />
                    </div>
                    <span>{slot.allowedActions.join(" / ")}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="draft-section" id="review">
            <h2>Review and submit</h2>
            <div className="submission-grid">
              <article className="document-card">
                <p className="eyebrow">Applicant package</p>
                <h3>Full Assessment</h3>
                <dl>
                  <div>
                    <dt>Status</dt>
                    <dd>{applicationSubmissionFixture.applicationStatus}</dd>
                  </div>
                  <div>
                    <dt>Documents</dt>
                    <dd>{applicationSubmissionFixture.documentState}</dd>
                  </div>
                  <div>
                    <dt>Submitted</dt>
                    <dd>{applicationSubmissionFixture.submittedAt}</dd>
                  </div>
                </dl>
              </article>
              <article className="document-card">
                <p className="eyebrow">Purchase order</p>
                <h3>{paymentSummaryFixture.purchaseOrder.purchaseOrderNumber}</h3>
                <p className="muted-note">
                  Applicants can provide a PO number or declare that no purchase order is available.
                </p>
              </article>
            </div>
          </section>

          <section className="draft-section" id="payment">
            <h2>Payment</h2>
            <div className="payment-summary">
              <div>
                <p className="eyebrow">Invoice</p>
                <h3>{paymentSummaryFixture.invoice.status}</h3>
              </div>
              <dl>
                <div>
                  <dt>Amount</dt>
                  <dd>{paymentSummaryFixture.invoice.amount}</dd>
                </div>
                <div>
                  <dt>Due by</dt>
                  <dd>{paymentSummaryFixture.invoice.dueAt}</dd>
                </div>
                <div>
                  <dt>Portal</dt>
                  <dd>{paymentSummaryFixture.invoice.availableInPortal ? "Available" : "Unavailable"}</dd>
                </div>
                <div>
                  <dt>Allocation block</dt>
                  <dd>{paymentSummaryFixture.blockedForAllocation ? "Blocked" : "Clear"}</dd>
                </div>
              </dl>
            </div>
          </section>

          <div className="deferred-actions">
            <button type="button">Save draft</button>
            <button type="button">Start document upload</button>
            <button type="button" className="secondary-button">
              Submit application
            </button>
            <button type="button" className="secondary-button" disabled>
              Online card payment deferred
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}
