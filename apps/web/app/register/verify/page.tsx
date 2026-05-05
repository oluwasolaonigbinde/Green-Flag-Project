export default function VerifyRegistrationPage() {
  return (
    <main className="app-shell narrow-shell">
      <section className="panel verification-panel">
        <p className="eyebrow">Email verification</p>
        <h1>Registration email verified</h1>
        <p className="lead">
          The registration can now move into structured KBT admin review. This route is a
          functional placeholder until the exact verification screen is exported.
        </p>
        <dl>
          <div>
            <dt>State</dt>
            <dd>VERIFIED_PENDING_REVIEW</dd>
          </div>
          <div>
            <dt>Next step</dt>
            <dd>Admin review</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
