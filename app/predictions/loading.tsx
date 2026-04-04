export default function Loading() {
  return (
    <main className="container">
      <div style={{ paddingTop: "3rem" }}>
        <div className="skeleton skeleton-heading" />
        <div className="skeleton skeleton-text long" />
      </div>
      <div style={{ marginTop: "2rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton skeleton-card" style={{ minHeight: "10rem" }} />
        ))}
      </div>
    </main>
  );
}
