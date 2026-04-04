export default function Loading() {
  return (
    <main className="container">
      <div style={{ paddingTop: "3rem" }}>
        <div className="skeleton skeleton-heading" style={{ width: "30%" }} />
        <div className="skeleton skeleton-text long" />
        <div className="skeleton skeleton-text medium" />
      </div>
      <div className="skeleton-grid" style={{ marginTop: "2rem" }}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton skeleton-card" />
        ))}
      </div>
    </main>
  );
}
