export function PageHero({
  eyebrow,
  title,
  description
}: {
  eyebrow?: string;
  title: string;
  description: string;
}) {
  const showEyebrow = Boolean(eyebrow && !eyebrow.startsWith("/"));
  const descriptionParts = description.split(/\s+(?:В·|·)\s+/).filter(Boolean);
  const normalizedDescription =
    descriptionParts.length >= 3 ? descriptionParts.slice(1).join(" · ") : description.replace(/\s+В·\s+/g, " · ");

  return (
    <section className="page-hero">
      <div className="page-hero-topline">
        <span>FightBase Media</span>
      </div>
      {showEyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h1>{title}</h1>
      <p className="copy">{normalizedDescription}</p>
      <div className="page-hero-accent" />
    </section>
  );
}
