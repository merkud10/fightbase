// Обёртка задаёт область `.admin-scope`: в редизайне (app/redesign.css) общим
// блокам сайта убраны рамки и отступы, а формам и таблицам админки они нужны.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="admin-scope">{children}</div>;
}
