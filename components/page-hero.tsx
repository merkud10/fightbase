export function PageHero({
  eyebrow,
  title,
  description
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <section className="page-hero">
      <div className="page-hero-topline">
        <span>{eyebrow}</span>
        <span>FightBase Media</span>
      </div>
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="copy">{description}</p>
      <div className="page-hero-accent" />
    </section>
  );
}
