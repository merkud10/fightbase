"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="container">
      <section className="filter-empty-state" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <h1>Что-то пошло не так</h1>
        <p className="copy">Произошла непредвиденная ошибка. Попробуйте обновить страницу.</p>
        <button type="button" className="button-secondary" onClick={() => reset()}>
          Попробовать снова
        </button>
      </section>
    </main>
  );
}
