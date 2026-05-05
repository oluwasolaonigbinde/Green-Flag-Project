import {
  registrationLocationSuggestionFixture,
  registrationSubmissionResponseFixture
} from "@green-flag/contracts";

export default function RegisterPage() {
  return (
    <main className="app-shell">
      <section className="page-heading">
        <p className="eyebrow">Park registration</p>
        <h1>Register a park</h1>
        <p className="lead">
          Eligibility, location capture, duplicate acknowledgement, and email verification are
          handled by the Slice 3 API contract.
        </p>
      </section>

      <section className="split-layout">
        <form className="panel form-panel">
          <div className="stepper" aria-label="Registration steps">
            <span className="step step--active">Location</span>
            <span className="step">Details</span>
            <span className="step">Review</span>
          </div>

          <label>
            Park name
            <input defaultValue="Lower Environment Park" />
          </label>
          <label>
            Organisation
            <input defaultValue="Lower Environment Council" />
          </label>
          <label>
            Contact email
            <input defaultValue="park.manager@example.invalid" />
          </label>

          <fieldset>
            <legend>Eligibility</legend>
            <label className="check-row">
              <input type="checkbox" defaultChecked />
              Publicly accessible
            </label>
            <label className="check-row">
              <input type="checkbox" defaultChecked />
              Free to enter
            </label>
            <label className="check-row">
              <input type="checkbox" defaultChecked />
              Minimum size confirmed
            </label>
          </fieldset>

          <div className="map-shell">
            <div>
              <strong>{registrationLocationSuggestionFixture.label}</strong>
              <span>{registrationLocationSuggestionFixture.w3wAddress}</span>
            </div>
          </div>

          <button type="button">Submit registration</button>
        </form>

        <aside className="panel status-panel">
          <h2>Contract response</h2>
          <dl>
            <div>
              <dt>Status</dt>
              <dd>{registrationSubmissionResponseFixture.status}</dd>
            </div>
            <div>
              <dt>Duplicate warning</dt>
              <dd>{registrationSubmissionResponseFixture.duplicateWarning.acknowledged ? "Acknowledged" : "Required"}</dd>
            </div>
            <div>
              <dt>Next step</dt>
              <dd>Email verification</dd>
            </div>
          </dl>
        </aside>
      </section>
    </main>
  );
}
