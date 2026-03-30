import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHero } from "@/components/page-hero";
import { getFighterPageData } from "@/lib/db";
import { formatFightStatus, formatWeightClass } from "@/lib/display";
import { getLocale } from "@/lib/i18n";

const countryLocaleMap: Record<string, { ru: string; en: string }> = {
  "США": { ru: "США", en: "United States" },
  "Россия": { ru: "Россия", en: "Russia" },
  "Румыния": { ru: "Румыния", en: "Romania" },
  "Бразилия": { ru: "Бразилия", en: "Brazil" },
  "Сингапур": { ru: "Сингапур", en: "Singapore" },
  "Казахстан": { ru: "Казахстан", en: "Kazakhstan" },
  "Китай": { ru: "Китай", en: "China" },
  "Грузия": { ru: "Грузия", en: "Georgia" },
  "Великобритания": { ru: "Великобритания", en: "United Kingdom" },
  "Англия": { ru: "Англия", en: "England" },
  "Ирландия": { ru: "Ирландия", en: "Ireland" },
  "Франция": { ru: "Франция", en: "France" },
  "Япония": { ru: "Япония", en: "Japan" },
  "ЮАР": { ru: "ЮАР", en: "South Africa" },
  "Нидерланды": { ru: "Нидерланды", en: "Netherlands" },
  "Испания": { ru: "Испания", en: "Spain" },
  "Армения": { ru: "Армения", en: "Armenia" },
  "Канада": { ru: "Канада", en: "Canada" },
  "Эквадор": { ru: "Эквадор", en: "Ecuador" },
  "Украина": { ru: "Украина", en: "Ukraine" },
  "Узбекистан": { ru: "Узбекистан", en: "Uzbekistan" },
  "Кыргызстан": { ru: "Кыргызстан", en: "Kyrgyzstan" },
  "Мексика": { ru: "Мексика", en: "Mexico" },
  "Филиппины": { ru: "Филиппины", en: "Philippines" },
  "Таиланд": { ru: "Таиланд", en: "Thailand" },
  "Южная Корея": { ru: "Южная Корея", en: "South Korea" },
  "Швеция": { ru: "Швеция", en: "Sweden" },
  "Норвегия": { ru: "Норвегия", en: "Norway" },
  "Польша": { ru: "Польша", en: "Poland" },
  "Чехия": { ru: "Чехия", en: "Czechia" },
  "Беларусь": { ru: "Беларусь", en: "Belarus" },
  "Германия": { ru: "Германия", en: "Germany" },
  "Швейцария": { ru: "Швейцария", en: "Switzerland" },
  "Австралия": { ru: "Австралия", en: "Australia" },
  "Новая Зеландия": { ru: "Новая Зеландия", en: "New Zealand" },
  "Израиль": { ru: "Израиль", en: "Israel" },
  "Италия": { ru: "Италия", en: "Italy" },
  "Турция": { ru: "Турция", en: "Turkey" },
  "Камерун": { ru: "Камерун", en: "Cameroon" },
  "Нигерия": { ru: "Нигерия", en: "Nigeria" },
  "Перу": { ru: "Перу", en: "Peru" },
  "Молдова": { ru: "Молдова", en: "Moldova" },
  "Тайвань": { ru: "Тайвань", en: "Taiwan" },
  "ОАЭ": { ru: "ОАЭ", en: "United Arab Emirates" },
  "Австрия": { ru: "Австрия", en: "Austria" },
  "Болгария": { ru: "Болгария", en: "Bulgaria" },
  "Дания": { ru: "Дания", en: "Denmark" },
  "Чили": { ru: "Чили", en: "Chile" },
  "Колумбия": { ru: "Колумбия", en: "Colombia" },
  "Куба": { ru: "Куба", en: "Cuba" },
  "Сенегал": { ru: "Сенегал", en: "Senegal" }
};

function formatDate(date: Date | string, locale: "ru" | "en") {
  return new Date(date).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US");
}

function formatVitalNumber(value: number, suffix: string, locale: "ru" | "en") {
  if (!value) {
    return locale === "ru" ? "Нет данных" : "No data";
  }

  return `${value} ${suffix}`;
}

function ordinalRoundToRu(value: string) {
  return value
    .replace(/\bfirst\b/i, "первом")
    .replace(/\bsecond\b/i, "втором")
    .replace(/\bthird\b/i, "третьем")
    .replace(/\bfourth\b/i, "четвертом")
    .replace(/\bfifth\b/i, "пятом");
}

function translateFightMethod(method: string | null | undefined, locale: "ru" | "en") {
  const value = String(method || "").trim();
  if (!value || locale !== "ru") {
    return value;
  }

  if (/^Decision - Unanimous$/i.test(value)) return "Решение судей - единогласное";
  if (/^Decision - Split$/i.test(value)) return "Решение судей - раздельное";
  if (/^Decision - Majority$/i.test(value)) return "Решение судей - большинством";
  if (/^KO\/TKO$/i.test(value)) return "KO/TKO";
  if (/^Submission$/i.test(value)) return "Сабмишен";
  if (/^Strikes$/i.test(value)) return "Остановка ударами";
  if (/^rear naked choke$/i.test(value)) return "Удушение сзади";
  if (/^armbar$/i.test(value)) return "Армбар";
  if (/^arm triangle choke$/i.test(value)) return "Треугольник руками";
  if (/^arm-triangle choke$/i.test(value)) return "Треугольник руками";
  if (/^brabo choke$/i.test(value)) return "Брабо-чоук";
  if (/^guillotine choke$/i.test(value)) return "Гильотина";
  if (/^kimura$/i.test(value)) return "Кимура";
  if (/^triangle choke$/i.test(value)) return "Треугольник";
  if (/^TKO \(Doctor stoppage\)$/i.test(value)) return "TKO (остановка врачом)";

  const decisionMatch = value.match(/^(three|five)\s+round\s+(unanimous|split|majority)\s+decision$/i);
  if (decisionMatch) {
    const roundLabel = decisionMatch[1].toLowerCase() === "five" ? "пятираундовое" : "трехраундовое";
    const decisionType =
      decisionMatch[2].toLowerCase() === "split"
        ? "раздельное решение"
        : decisionMatch[2].toLowerCase() === "majority"
          ? "решение большинством"
          : "единогласное решение";
    return `${roundLabel} ${decisionType}`;
  }

  if (/strikes/i.test(value)) {
    return "Остановка ударами";
  }

  return value;
}

function translateFightNote(note: string | null | undefined, locale: "ru" | "en", fighterName: string) {
  const value = String(note || "").trim();
  if (!value || locale !== "ru") {
    return value;
  }

  const surname = fighterName.split(/\s+/).filter(Boolean).slice(-1)[0] || fighterName;
  const escapedName = fighterName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedSurname = surname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fighterPattern = `(?:${escapedName}|${escapedSurname})`;

  const decisionWinMatch = value.match(
    new RegExp(`^${fighterPattern} won a (three|five) round (unanimous|split|majority) decision over (.+)$`, "i")
  );
  if (decisionWinMatch) {
    const rounds = decisionWinMatch[1].toLowerCase() === "five" ? "пятираундовым" : "трехраундовым";
    const decisionType =
      decisionWinMatch[2].toLowerCase() === "split"
        ? "раздельным решением"
        : decisionWinMatch[2].toLowerCase() === "majority"
          ? "решением большинством"
          : "единогласным решением";
    return `${fighterName} победил${/а$/i.test(fighterName) ? "а" : ""} ${decisionType} по итогам ${rounds} боя против ${decisionWinMatch[3]}.`;
  }

  const decisionLossMatch = value.match(
    new RegExp(`^${fighterPattern} lost a (three|five) round (unanimous|split|majority) decision to (.+)$`, "i")
  );
  if (decisionLossMatch) {
    const rounds = decisionLossMatch[1].toLowerCase() === "five" ? "пятираундового" : "трехраундового";
    const decisionType =
      decisionLossMatch[2].toLowerCase() === "split"
        ? "раздельным решением"
        : decisionLossMatch[2].toLowerCase() === "majority"
          ? "решением большинством"
          : "единогласным решением";
    return `${fighterName} проиграл${/а$/i.test(fighterName) ? "а" : ""} ${decisionType} по итогам ${rounds} боя против ${decisionLossMatch[3]}.`;
  }

  const strikeWinMatch = value.match(
    new RegExp(`^${fighterPattern} stopped (.+) via strikes at (\\d:\\d{2}) of the (first|second|third|fourth|fifth) round$`, "i")
  );
  if (strikeWinMatch) {
    return `${fighterName} остановил${/а$/i.test(fighterName) ? "а" : ""} ${strikeWinMatch[1]} ударами на отметке ${strikeWinMatch[2]} ${ordinalRoundToRu(strikeWinMatch[3])} раунда.`;
  }

  const submissionWinMatch = value.match(
    new RegExp(`^${fighterPattern} submitted (.+) via (.+) at (\\d:\\d{2}) of the (first|second|third|fourth|fifth) round$`, "i")
  );
  if (submissionWinMatch) {
    return `${fighterName} победил${/а$/i.test(fighterName) ? "а" : ""} ${submissionWinMatch[1]} приёмом ${translateFightMethod(
      submissionWinMatch[2],
      "ru"
    ).toLowerCase()} на отметке ${submissionWinMatch[3]} ${ordinalRoundToRu(submissionWinMatch[4])} раунда.`;
  }

  const stoppedLossMatch = value.match(
    new RegExp(`^${fighterPattern} was stopped by (.+) via (.+) at (\\d:\\d{2}) of the (first|second|third|fourth|fifth) round$`, "i")
  );
  if (stoppedLossMatch) {
    return `${fighterName} проиграл${/а$/i.test(fighterName) ? "а" : ""} ${stoppedLossMatch[1]} после остановки ${translateFightMethod(stoppedLossMatch[2], "ru").toLowerCase()} на отметке ${stoppedLossMatch[3]} ${ordinalRoundToRu(stoppedLossMatch[4])} раунда.`;
  }

  const submittedLossMatch = value.match(
    new RegExp(`^${fighterPattern} was submitted by (.+) via (.+) at (\\d:\\d{2}) of the (first|second|third|fourth|fifth) round$`, "i")
  );
  if (submittedLossMatch) {
    return `${fighterName} проиграл${/а$/i.test(fighterName) ? "а" : ""} ${submittedLossMatch[1]} приёмом ${translateFightMethod(submittedLossMatch[2], "ru").toLowerCase()} на отметке ${submittedLossMatch[3]} ${ordinalRoundToRu(submittedLossMatch[4])} раунда.`;
  }

  const genericLossMatch = value.match(
    new RegExp(`^${fighterPattern} lost(?: a)?(?: (three|five)-?round)?(?: (unanimous|split|majority))? ?decision to (.+)$`, "i")
  );
  if (genericLossMatch) {
    const roundLabel = genericLossMatch[1]
      ? genericLossMatch[1].toLowerCase() === "five"
        ? "пятираундового"
        : "трехраундового"
      : "судейского";
    const decisionType =
      genericLossMatch[2]?.toLowerCase() === "split"
        ? "раздельного решения"
        : genericLossMatch[2]?.toLowerCase() === "majority"
          ? "решения большинством"
          : "единогласного решения";
    return `${fighterName} проиграл${/а$/i.test(fighterName) ? "а" : ""} ${genericLossMatch[3]} по итогам ${roundLabel} ${decisionType}.`;
  }

  const genericMethodLossMatch = value.match(
    new RegExp(`^${fighterPattern} lost to (.+) via (.+) at (\\d:\\d{2}) of the (first|second|third|fourth|fifth) round$`, "i")
  );
  if (genericMethodLossMatch) {
    return `${fighterName} проиграл${/а$/i.test(fighterName) ? "а" : ""} ${genericMethodLossMatch[1]} после ${translateFightMethod(
      genericMethodLossMatch[2],
      "ru"
    ).toLowerCase()} на отметке ${genericMethodLossMatch[3]} ${ordinalRoundToRu(genericMethodLossMatch[4])} раунда.`;
  }

  return value;
}

function cleanOpponentName(value: string | null | undefined) {
  return String(value || "")
    .replace(/^by\s+/i, "")
    .trim();
}

function hasCyrillic(value: string | null | undefined) {
  return /[А-Яа-яЁё]/.test(String(value || ""));
}

function formatCountry(value: string | null | undefined, locale: "ru" | "en") {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  const direct = countryLocaleMap[normalized];
  if (direct) {
    return direct[locale];
  }

  const reverse = Object.values(countryLocaleMap).find((item) => item.en === normalized);
  if (reverse) {
    return reverse[locale];
  }

  return normalized;
}

function buildEnglishFighterBio(fighter: {
  name: string;
  nickname: string | null;
  country: string;
  weightClass: string;
  status: string;
  record: string;
  team: string;
  promotion?: { shortName?: string | null; name?: string | null } | null;
}) {
  const promotionLabel = fighter.promotion?.shortName || fighter.promotion?.name || "MMA";
  const parts = [
    `${fighter.name} is a professional ${promotionLabel} fighter competing at ${formatWeightClass(fighter.weightClass, "en").toLowerCase()}.`
  ];

  if (fighter.nickname) {
    parts.push(`Known by the nickname "${fighter.nickname}".`);
  }

  if (fighter.record && !/^0-0(?:-0)?$/.test(fighter.record.trim())) {
    parts.push(`Career record: ${fighter.record}.`);
  }

  if (fighter.country && !hasCyrillic(fighter.country) && !/^unknown$/i.test(fighter.country.trim())) {
    parts.push(`Represents ${fighter.country}.`);
  }

  if (fighter.team && !hasCyrillic(fighter.team) && !/^unknown$/i.test(fighter.team.trim())) {
    parts.push(`Fight team: ${fighter.team}.`);
  }

  if (fighter.status === "champion") {
    parts.push("Current divisional champion.");
  } else if (fighter.status === "prospect") {
    parts.push("Considered one of the notable prospects in the division.");
  } else if (fighter.status === "retired") {
    parts.push("Currently listed outside active competition.");
  }

  return parts.join(" ");
}

export default async function FighterPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getLocale();
  const data = await getFighterPageData(slug);

  if (!data) {
    notFound();
  }

  const { fighter, recentFights, profileRecentFights, relatedArticles } = data;
  const displayName = locale === "ru" ? fighter.nameRu ?? fighter.name : fighter.name;
  const localizedBio =
    locale === "ru"
      ? fighter.bio
      : fighter.bioEn
        ? fighter.bioEn
        : hasCyrillic(fighter.bio)
        ? buildEnglishFighterBio(fighter)
        : fighter.bio;
  const descriptionBits = [
    fighter.record || null,
    formatWeightClass(fighter.weightClass, locale),
    fighter.style || null,
    fighter.team || null
  ].filter(Boolean);

  const hasVitals = Boolean(fighter.age || fighter.heightCm || fighter.reachCm || fighter.country);
  const hasProfileRecentFights = profileRecentFights.length > 0;
  const hasStructuredRecentFights = recentFights.length > 0;
  const hasOfficialStats =
    fighter.sigStrikesLandedPerMin != null ||
    fighter.strikeAccuracy != null ||
    fighter.sigStrikesAbsorbedPerMin != null ||
    fighter.strikeDefense != null ||
    fighter.takedownAveragePer15 != null ||
    fighter.takedownAccuracy != null ||
    fighter.takedownDefense != null ||
    fighter.submissionAveragePer15 != null ||
    fighter.winsByKnockout != null ||
    fighter.winsBySubmission != null ||
    fighter.winsByDecision != null;

  return (
    <main className="container">
      <PageHero eyebrow={`/fighters/${fighter.slug}`} title={displayName} description={descriptionBits.join(" - ")} />

      <section className="detail-grid">
        <article className="stack">
          <div className="policy-card">
            {fighter.photoUrl ? (
              <img src={fighter.photoUrl} alt={displayName} className="fighter-profile-photo" />
            ) : (
              <div className="fighter-avatar fighter-avatar-large" />
            )}
          </div>

          <div className="policy-card">
            <h3>{locale === "ru" ? "Профиль бойца" : "Profile summary"}</h3>
            <p className="copy">{localizedBio}</p>
          </div>

          {hasProfileRecentFights || hasStructuredRecentFights ? (
            <div className="table-card">
              <h3>{locale === "ru" ? "Последние бои" : "Recent fights"}</h3>

              {hasProfileRecentFights ? (
                <div className="recent-fight-cards">
                  {profileRecentFights.map((fight) => (
                    <article key={fight.id} className="recent-fight-card">
                      <div className="recent-fight-head">
                        <div>
                          <p className="recent-fight-opponent">
                            {locale === "ru"
                              ? cleanOpponentName(fight.opponentNameRu ?? fight.opponentName)
                              : cleanOpponentName(fight.opponentName)}
                          </p>
                          <p className="recent-fight-meta">
                            {fight.eventName} • {formatDate(fight.date, locale)}
                          </p>
                        </div>
                        <span className={`status-pill ${fight.result === "Победа" ? "is-live" : ""}`}>{fight.result}</span>
                      </div>

                      <div className="recent-fight-grid">
                        <div>
                          <span className="eyebrow">{locale === "ru" ? "Метод" : "Method"}</span>
                          <p className="copy">
                            {translateFightMethod(fight.method, locale) || (locale === "ru" ? "Нет данных" : "No data")}
                          </p>
                        </div>
                        <div>
                          <span className="eyebrow">{locale === "ru" ? "Раунд / время" : "Round / time"}</span>
                          <p className="copy">
                            {fight.round || fight.time
                              ? `${fight.round ? `R${fight.round}` : ""}${fight.round && fight.time ? " • " : ""}${fight.time ?? ""}`
                              : locale === "ru"
                                ? "Нет данных"
                                : "No data"}
                          </p>
                        </div>
                      </div>

                    </article>
                  ))}
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{locale === "ru" ? "Турнир" : "Event"}</th>
                        <th>{locale === "ru" ? "Вес" : "Weight"}</th>
                        <th>{locale === "ru" ? "Статус" : "Status"}</th>
                        <th>{locale === "ru" ? "Итог" : "Result"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentFights.map((fight) => (
                        <tr key={fight.id}>
                          <td>{fight.event.name}</td>
                          <td>{formatWeightClass(fight.weightClass, locale)}</td>
                          <td>{formatFightStatus(fight.status, locale)}</td>
                          <td>
                            {fight.method && fight.resultRound
                              ? `${fight.method} R${fight.resultRound}`
                              : locale === "ru"
                                ? "Назначен"
                                : "Scheduled"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </article>

        <aside className="stack">
          {hasVitals ? (
            <div className="policy-card">
              <h3>{locale === "ru" ? "Параметры" : "Vitals"}</h3>
              {fighter.age ? (
                <p className="copy">
                  {locale === "ru" ? "Возраст" : "Age"}: {fighter.age}
                </p>
              ) : null}
              {fighter.heightCm ? (
                <p className="copy">
                  {locale === "ru" ? "Рост" : "Height"}: {formatVitalNumber(fighter.heightCm, locale === "ru" ? "см" : "cm", locale)}
                </p>
              ) : null}
              {fighter.reachCm ? (
                <p className="copy">
                  {locale === "ru" ? "Размах рук" : "Reach"}: {formatVitalNumber(fighter.reachCm, locale === "ru" ? "см" : "cm", locale)}
                </p>
              ) : null}
              {fighter.country ? <p className="copy">{formatCountry(fighter.country, locale)}</p> : null}
            </div>
          ) : null}

          {hasOfficialStats ? (
            <div className="policy-card">
              <h3>{locale === "ru" ? "Официальная статистика UFC" : "Official UFC stats"}</h3>
              <div className="recent-fight-grid">
                <div>
                  <span className="eyebrow">SLpM</span>
                  <p className="copy">{fighter.sigStrikesLandedPerMin ?? "—"}</p>
                </div>
                <div>
                  <span className="eyebrow">{locale === "ru" ? "Точность ударов" : "Strike accuracy"}</span>
                  <p className="copy">{fighter.strikeAccuracy != null ? `${fighter.strikeAccuracy}%` : "—"}</p>
                </div>
                <div>
                  <span className="eyebrow">SApM</span>
                  <p className="copy">{fighter.sigStrikesAbsorbedPerMin ?? "—"}</p>
                </div>
                <div>
                  <span className="eyebrow">{locale === "ru" ? "Защита в стойке" : "Strike defense"}</span>
                  <p className="copy">{fighter.strikeDefense != null ? `${fighter.strikeDefense}%` : "—"}</p>
                </div>
                <div>
                  <span className="eyebrow">{locale === "ru" ? "Тейкдауны / 15 мин" : "TD avg / 15 min"}</span>
                  <p className="copy">{fighter.takedownAveragePer15 ?? "—"}</p>
                </div>
                <div>
                  <span className="eyebrow">{locale === "ru" ? "Точность тейкдаунов" : "TD accuracy"}</span>
                  <p className="copy">{fighter.takedownAccuracy != null ? `${fighter.takedownAccuracy}%` : "—"}</p>
                </div>
                <div>
                  <span className="eyebrow">{locale === "ru" ? "Защита от тейкдаунов" : "TD defense"}</span>
                  <p className="copy">{fighter.takedownDefense != null ? `${fighter.takedownDefense}%` : "—"}</p>
                </div>
                <div>
                  <span className="eyebrow">{locale === "ru" ? "Сабмишены / 15 мин" : "Sub avg / 15 min"}</span>
                  <p className="copy">{fighter.submissionAveragePer15 ?? "—"}</p>
                </div>
                <div>
                  <span className="eyebrow">{locale === "ru" ? "Побед KO/TKO" : "Wins by KO/TKO"}</span>
                  <p className="copy">{fighter.winsByKnockout ?? "—"}</p>
                </div>
                <div>
                  <span className="eyebrow">{locale === "ru" ? "Побед сабмишеном" : "Wins by submission"}</span>
                  <p className="copy">{fighter.winsBySubmission ?? "—"}</p>
                </div>
                <div>
                  <span className="eyebrow">{locale === "ru" ? "Побед решением" : "Wins by decision"}</span>
                  <p className="copy">{fighter.winsByDecision ?? "—"}</p>
                </div>
                <div>
                  <span className="eyebrow">{locale === "ru" ? "Среднее время боя" : "Average fight time"}</span>
                  <p className="copy">{fighter.averageFightTime ?? "—"}</p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="policy-card">
            <h3>{locale === "ru" ? "Связанные материалы" : "Related stories"}</h3>
            <ul>
              {relatedArticles.map((article) => (
                <li key={article.id}>
                  <Link href={`/news/${article.slug}`}>{article.title}</Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </section>
    </main>
  );
}
