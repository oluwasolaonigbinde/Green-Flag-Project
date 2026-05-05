import { adminRegistrationReviewQueueFixture } from "@green-flag/contracts";

export default function AdminRegistrationsPage() {
  return (
    <main className="admin-shell">
      <section className="page-heading">
        <p className="eyebrow">Admin queue</p>
        <h1>Registration review</h1>
      </section>

      <section className="queue-table" aria-label="Registration review queue">
        <div className="queue-row queue-row--head">
          <span>Park</span>
          <span>Organisation</span>
          <span>Status</span>
          <span>Duplicate</span>
          <span>Decision</span>
        </div>
        {adminRegistrationReviewQueueFixture.items.map((item) => (
          <div className="queue-row" key={item.registrationId}>
            <span>{item.parkName}</span>
            <span>{item.organisationName}</span>
            <span>{item.status}</span>
            <span>{item.duplicateWarning.hasPotentialDuplicate ? "Acknowledged" : "None"}</span>
            <span className="button-pair">
              <button type="button">Approve</button>
              <button type="button" className="secondary-button">
                Reject
              </button>
            </span>
          </div>
        ))}
      </section>
    </main>
  );
}
