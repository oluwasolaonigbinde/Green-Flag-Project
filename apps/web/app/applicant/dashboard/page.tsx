import { applicantDashboardFixture, applicationSubmissionFixture, paymentSummaryFixture } from "@green-flag/contracts";

export default function ApplicantDashboardPage() {
  return (
    <main className="app-shell">
      <section className="page-heading">
        <p className="eyebrow">Applicant dashboard</p>
        <h1>My applications</h1>
      </section>

      <section className="application-grid" aria-label="Applicant application cards">
        {applicantDashboardFixture.items.map((item) => (
          <article className="application-card" key={item.episodeId}>
            <div>
              <p className="eyebrow">{item.cycleYear}</p>
              <h2>{item.parkName}</h2>
            </div>
            <span className="status-pill">
              {item.applicationId === applicationSubmissionFixture.applicationId
                ? applicationSubmissionFixture.applicationStatus
                : item.displayStatus}
            </span>
            <div className="progress-track" aria-label={`${item.completionPercent}% complete`}>
              <span style={{ width: `${item.completionPercent}%` }} />
            </div>
            <dl>
              <div>
                <dt>Progress</dt>
                <dd>{item.completionPercent}%</dd>
              </div>
              <div>
                <dt>Invoice</dt>
                <dd>
                  {item.applicationId === paymentSummaryFixture.applicationId
                    ? paymentSummaryFixture.invoice.status
                    : item.invoice.status}
                </dd>
              </div>
              <div>
                <dt>Payment</dt>
                <dd>
                  {item.applicationId === paymentSummaryFixture.applicationId
                    ? paymentSummaryFixture.invoice.amount
                    : "not_available"}
                </dd>
              </div>
              <div>
                <dt>Result</dt>
                <dd>{item.result.status}</dd>
              </div>
            </dl>
            {item.allowedActions.length > 0 ? (
              <a className="button-link" href={`/applicant/applications/${item.applicationId}`}>
                Continue
              </a>
            ) : (
              <span className="muted-note">No applicant action available</span>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}
