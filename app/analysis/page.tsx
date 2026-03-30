import { redirect } from "next/navigation";

import { getLocale } from "@/lib/i18n";
import { localizePath } from "@/lib/locale-path";

export default async function AnalysisPage() {
  const locale = await getLocale();

  redirect(localizePath("/predictions", locale));
}
