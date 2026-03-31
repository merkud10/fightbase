"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ru">
      <body>
        <main className="container">
          <section className="filter-empty-state" style={{ paddingTop: 80, paddingBottom: 80 }}>
            <h1>Критическая ошибка</h1>
            <p>Произошла серьёзная ошибка. Попробуйте обновить страницу.</p>
            <button type="button" onClick={() => reset()}>
              Попробовать снова
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
