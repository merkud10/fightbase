import type { Metadata } from "next";

import { adminLoginAction } from "@/app/admin/login/actions";

type AdminLoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "Admin Login | FightBase Media",
  robots: {
    index: false,
    follow: false
  }
};

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  const params = (await searchParams) ?? {};
  const nextPath = readParam(params.next) ?? "/admin";
  const error = readParam(params.error);

  return (
    <main className="container admin-login-shell">
      <section className="admin-login-card editorial-surface">
        <div className="admin-login-copy">
          <p className="eyebrow">Admin access</p>
          <h1>Вход в редакционную панель</h1>
          <p className="copy">
            Используйте редакционные учетные данные, чтобы получить доступ к управлению
            материалами, ingestion и публикациям.
          </p>
        </div>

        <form action={adminLoginAction} className="admin-login-form">
          <input type="hidden" name="next" value={nextPath} />

          <label className="admin-login-field">
            <span>Email</span>
            <input type="email" name="email" autoComplete="username" required />
          </label>

          <label className="admin-login-field">
            <span>Password</span>
            <input type="password" name="password" autoComplete="current-password" required />
          </label>

          {error === "invalid" ? (
            <p className="admin-login-error">Неверные учетные данные. Проверь email и пароль.</p>
          ) : null}

          <button type="submit" className="button">
            Войти
          </button>
        </form>
      </section>
    </main>
  );
}
