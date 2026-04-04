export default function Loading() {
  return (
    <main className="container">
      <div style={{ paddingTop: "3rem" }}>
        <div className="skeleton skeleton-heading" />
        <div className="skeleton skeleton-text long" />
      </div>
      <div className="skeleton-grid" style={{ marginTop: "2rem" }}>
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="skeleton skeleton-card" style={{ minHeight: "16rem" }} />
        ))}
      </div>
    </main>
  );
}
