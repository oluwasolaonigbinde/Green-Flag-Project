import { assessorSelfProfileFixture } from "@green-flag/contracts";

export default function AssessorProfilePage() {
  const profile = assessorSelfProfileFixture.profile;
  const capacity = profile.capacity[0];

  return (
    <main className="admin-shell">
      <section className="page-heading">
        <p className="eyebrow">Assessor profile</p>
        <h1>{profile.displayName}</h1>
        <p className="lead">Manage profile readiness, preferences, availability, and capacity.</p>
      </section>

      <section className="metric-grid">
        <article className="metric-card">
          <span>Profile</span>
          <strong>{profile.profileStatus}</strong>
          <small>Self-service state</small>
        </article>
        <article className="metric-card">
          <span>Accreditation</span>
          <strong>{profile.accreditationStatus}</strong>
          <small>{profile.accreditationProvider}</small>
        </article>
        <article className="metric-card">
          <span>Capacity</span>
          <strong>{capacity?.maxAssignments ?? 0}</strong>
          <small>{capacity?.capacityStatus ?? "unavailable"}</small>
        </article>
      </section>

      <section className="detail-grid">
        <article className="panel form-panel">
          <p className="eyebrow">Preferences</p>
          <h2>{profile.primaryRegion}</h2>
          <dl>
            <div>
              <dt>Regions</dt>
              <dd>{profile.preferences.preferredRegions.join(", ")}</dd>
            </div>
            <div>
              <dt>Tracks</dt>
              <dd>{profile.preferences.preferredAwardTrackCodes.join(", ")}</dd>
            </div>
            <div>
              <dt>Mystery shop</dt>
              <dd>{profile.preferences.acceptsMysteryShop ? "Available" : "Not declared"}</dd>
            </div>
          </dl>
        </article>

        <article className="panel form-panel">
          <p className="eyebrow">Availability</p>
          <h2>Declared windows</h2>
          <div className="document-list">
            {profile.availability.map((window) => (
              <div className="document-card" key={window.availabilityId}>
                <h3>{window.availabilityType}</h3>
                <p className="muted-note">
                  {window.startsAt} to {window.endsAt}
                </p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="panel form-panel">
        <p className="eyebrow">Deferred workflow</p>
        <div className="deferred-actions">
          <button type="button">Save preferences</button>
          <button type="button">Save availability</button>
          <button type="button">Save capacity</button>
          <button type="button" className="secondary-button" disabled>
            Visit schedule deferred
          </button>
        </div>
      </section>
    </main>
  );
}
