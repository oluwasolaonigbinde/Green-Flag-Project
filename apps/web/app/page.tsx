import { contractMetadataFixture } from "@green-flag/contracts";

export default function Page() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Green Flag foundation scaffold</p>
        <h1>Slice 0 is live as a safe contract and build baseline.</h1>
        <p className="lead">
          This Next.js shell proves the repo can build and serve a foundation status page
          without exposing later workflow behavior.
        </p>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Contract metadata</h2>
          <dl>
            <div>
              <dt>Slice</dt>
              <dd>{contractMetadataFixture.slice}</dd>
            </div>
            <div>
              <dt>Episode-first</dt>
              <dd>{String(contractMetadataFixture.episodeFirst)}</dd>
            </div>
          </dl>
        </article>

        <article className="card">
          <h2>Safe display statuses</h2>
          <ul>
            {contractMetadataFixture.safeDisplayStatuses.map((status) => (
              <li key={status}>{status}</li>
            ))}
          </ul>
        </article>

        <article className="card card--wide">
          <h2>Forbidden production values</h2>
          <p>Foundation scope keeps production-only values out of the scaffold, including:</p>
          <ul className="inline-list">
            {contractMetadataFixture.forbiddenProductionValues.map((value) => (
              <li key={value}>{value}</li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
