import Link from "next/link";
import { adminAssessorDetailFixture } from "@green-flag/contracts";

export default function AdminAssessorDetailPage() {
  const detail = adminAssessorDetailFixture;
  const profile = detail.profile;
  const capacity = profile.capacity[0];

  return (
    <main className="admin-shell">
      <section className="page-heading admin-heading-row">
        <div>
          <p className="eyebrow">Assessor detail</p>
          <h1>{profile.displayName}</h1>
        </div>
        <Link className="button-link" href="/admin/assessors">
          Assessors
        </Link>
      </section>

      <section className="detail-grid">
        <article className="panel form-panel">
          <p className="eyebrow">Profile</p>
          <h2>{profile.profileStatus}</h2>
          <dl>
            <div>
              <dt>Email</dt>
              <dd>{profile.email}</dd>
            </div>
            <div>
              <dt>Region</dt>
              <dd>{profile.primaryRegion}</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>{profile.version}</dd>
            </div>
          </dl>
        </article>

        <article className="panel form-panel">
          <p className="eyebrow">Accreditation</p>
          <h2>{profile.accreditationStatus}</h2>
          <dl>
            <div>
              <dt>Provider sync</dt>
              <dd>{detail.providerSyncStatus}</dd>
            </div>
            <div>
              <dt>Provider</dt>
              <dd>{profile.accreditationProvider}</dd>
            </div>
          </dl>
        </article>

        <article className="panel form-panel">
          <p className="eyebrow">Capacity</p>
          <h2>{capacity?.capacityStatus ?? "unavailable"}</h2>
          <dl>
            <div>
              <dt>Cycle</dt>
              <dd>{capacity?.cycleYear ?? "Not declared"}</dd>
            </div>
            <div>
              <dt>Load</dt>
              <dd>
                {capacity?.currentAssignedCount ?? 0}/{capacity?.maxAssignments ?? 0}
              </dd>
            </div>
            <div>
              <dt>Allocation candidates</dt>
              <dd>{detail.allocationCandidateGenerationAvailable ? "Available" : "Unavailable"}</dd>
            </div>
          </dl>
        </article>

        <article className="panel form-panel">
          <p className="eyebrow">Preferences</p>
          <h2>{profile.preferences.preferredRegions.join(", ")}</h2>
          <p className="muted-note">{profile.preferences.unavailableNotes}</p>
          <div className="deferred-actions">
            <button type="button">Update profile</button>
            <button type="button" className="secondary-button">
              Disable
            </button>
            <button type="button" className="secondary-button" disabled>
              Allocation deferred
            </button>
          </div>
        </article>
      </section>
    </main>
  );
}
