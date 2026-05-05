import Link from "next/link";
import { adminAssessorListFixture } from "@green-flag/contracts";

export default function AdminAssessorsPage() {
  return (
    <main className="admin-shell">
      <section className="page-heading admin-heading-row">
        <div>
          <p className="eyebrow">Super Admin</p>
          <h1>Assessor management</h1>
        </div>
        <Link className="button-link" href="/admin">
          Dashboard
        </Link>
      </section>

      <section className="queue-tabs" aria-label="Assessor filters">
        {adminAssessorListFixture.page.availableFilters.map((filter) => (
          <a href="#assessors" key={filter}>
            {filter}
          </a>
        ))}
      </section>

      <section className="queue-table" id="assessors" aria-label="Assessor management table">
        <div className="queue-row assessor-row queue-row--head">
          <span>Name</span>
          <span>Profile</span>
          <span>Accreditation</span>
          <span>Region</span>
          <span>Capacity</span>
          <span>Detail</span>
        </div>
        {adminAssessorListFixture.items.map((item) => (
          <div className="queue-row assessor-row" key={item.assessorId}>
            <span>{item.displayName}</span>
            <span>{item.profileStatus}</span>
            <span>{item.accreditationStatus}</span>
            <span>{item.primaryRegion}</span>
            <span>
              {item.currentAssignedCount}/{item.maxAssignments} {item.capacityStatus}
            </span>
            <Link href={`/admin/assessors/${item.assessorId}`}>Open</Link>
          </div>
        ))}
      </section>
    </main>
  );
}
