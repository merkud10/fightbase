import type { Article, Event, Fight, Fighter, Promotion, Source, Tag } from "@/lib/types";

export const promotions: Promotion[] = [
  { id: "ufc", name: "Ultimate Fighting Championship", shortName: "UFC", slug: "ufc" },
  { id: "pfl", name: "Professional Fighters League", shortName: "PFL", slug: "pfl" },
  { id: "one", name: "ONE Championship", shortName: "ONE", slug: "one" }
];

export const tags: Tag[] = [
  { id: "announcements", label: "Announcements", slug: "announcements" },
  { id: "results", label: "Results", slug: "results" },
  { id: "injuries", label: "Injuries", slug: "injuries" },
  { id: "rumors", label: "Rumors", slug: "rumors" },
  { id: "preview", label: "Preview", slug: "preview" },
  { id: "post-fight", label: "Post-fight", slug: "post-fight" }
];

export const sources: Source[] = [
  {
    id: "src-ufc-announce",
    label: "Official UFC announcement",
    type: "official",
    url: "https://www.ufc.com"
  },
  {
    id: "src-presser",
    label: "Post-event press conference",
    type: "interview",
    url: "https://www.youtube.com"
  },
  {
    id: "src-social",
    label: "Fighter social post",
    type: "social",
    url: "https://x.com"
  }
];

export const fighters: Fighter[] = [
  {
    id: "f-islam-makhachev",
    slug: "islam-makhachev",
    name: "Islam Makhachev",
    nickname: undefined,
    country: "Russia",
    promotionId: "ufc",
    weightClass: "Lightweight",
    status: "champion",
    record: "27-1",
    age: 34,
    heightCm: 178,
    reachCm: 179,
    team: "American Kickboxing Academy",
    style: "Sambo",
    bio: "Elite control grappler with layered striking and champion-level composure."
  },
  {
    id: "f-alex-pereira",
    slug: "alex-pereira",
    name: "Alex Pereira",
    nickname: "Poatan",
    country: "Brazil",
    promotionId: "ufc",
    weightClass: "Light Heavyweight",
    status: "active",
    record: "12-3",
    age: 38,
    heightCm: 193,
    reachCm: 201,
    team: "Teixeira MMA",
    style: "Kickboxing",
    bio: "A devastating counter striker whose power changes the geometry of every fight."
  },
  {
    id: "f-shavkat-rakhmonov",
    slug: "shavkat-rakhmonov",
    name: "Shavkat Rakhmonov",
    country: "Kazakhstan",
    promotionId: "ufc",
    weightClass: "Welterweight",
    status: "prospect",
    record: "19-0",
    age: 31,
    heightCm: 185,
    reachCm: 196,
    team: "Dar Team",
    style: "Well-rounded",
    bio: "Pressure, finishing instincts, and composure make him one of the division's biggest threats."
  },
  {
    id: "f-anatoly-malykhin",
    slug: "anatoly-malykhin",
    name: "Anatoly Malykhin",
    country: "Russia",
    promotionId: "one",
    weightClass: "Heavyweight",
    status: "champion",
    record: "15-1",
    age: 37,
    heightCm: 180,
    reachCm: 190,
    team: "Golden Team",
    style: "Wrestle-boxing",
    bio: "Compact heavyweight champion with pressure and layered finishing ability."
  }
];

export const events: Event[] = [
  {
    id: "e-ufc-314",
    slug: "ufc-314",
    name: "UFC 314",
    promotionId: "ufc",
    date: "2026-04-12",
    city: "Las Vegas",
    venue: "T-Mobile Arena",
    status: "upcoming",
    mainEventFightId: "fight-main-ufc-314",
    summary: "A high-leverage card with title implications across multiple divisions."
  },
  {
    id: "e-pfl-champions-series",
    slug: "pfl-champions-series",
    name: "PFL Champions Series",
    promotionId: "pfl",
    date: "2026-04-18",
    city: "Riyadh",
    venue: "Kingdom Arena",
    status: "upcoming",
    mainEventFightId: "fight-main-pfl",
    summary: "A showcase event built around contender movement and international market expansion."
  },
  {
    id: "e-one-fight-night",
    slug: "one-fight-night",
    name: "ONE Fight Night",
    promotionId: "one",
    date: "2026-03-22",
    city: "Tokyo",
    venue: "Ariake Arena",
    status: "completed",
    mainEventFightId: "fight-main-one",
    summary: "A completed event feeding the rankings, post-fight quotes, and next-fight matchmaking."
  }
];

export const fights: Fight[] = [
  {
    id: "fight-main-ufc-314",
    eventId: "e-ufc-314",
    stage: "main-card",
    fighterAId: "f-shavkat-rakhmonov",
    fighterBId: "f-alex-pereira",
    weightClass: "Catchweight",
    status: "scheduled"
  },
  {
    id: "fight-main-pfl",
    eventId: "e-pfl-champions-series",
    stage: "main-card",
    fighterAId: "f-anatoly-malykhin",
    fighterBId: "f-shavkat-rakhmonov",
    weightClass: "Openweight",
    status: "scheduled"
  },
  {
    id: "fight-main-one",
    eventId: "e-one-fight-night",
    stage: "main-card",
    fighterAId: "f-anatoly-malykhin",
    fighterBId: "f-alex-pereira",
    weightClass: "Light Heavyweight",
    status: "completed",
    result: {
      winnerId: "f-anatoly-malykhin",
      method: "TKO",
      round: 3,
      time: "2:41"
    }
  }
];

export const articles: Article[] = [
  {
    id: "a-title-eliminator",
    slug: "title-eliminator-reframes-welterweight-picture",
    title: "Title eliminator reframes the welterweight picture",
    excerpt:
      "A newly confirmed contender bout changes the title queue and creates immediate ranking pressure.",
    category: "news",
    promotionId: "ufc",
    publishedAt: "2026-03-29T09:00:00.000Z",
    tagIds: ["announcements", "preview"],
    fighterIds: ["f-shavkat-rakhmonov", "f-alex-pereira"],
    eventId: "e-ufc-314",
    sourceIds: ["src-ufc-announce", "src-social"],
    meaning:
      "This matters because the winner jumps from contender status into probable title-shot territory.",
    sections: [
      {
        heading: "What happened",
        body: "The promotion locked in a fight with direct title implications and immediate traffic value for news, rankings, and fighter pages."
      },
      {
        heading: "Context",
        body: "The division has been stalled by injuries, so a clean official booking restores narrative momentum and simplifies the contender ladder."
      },
      {
        heading: "What comes next",
        body: "The winner likely becomes the next obvious challenger, while the loser still anchors high-value matchmaking content."
      }
    ]
  },
  {
    id: "a-pressure-breakdown",
    slug: "why-pressure-boxing-disrupts-elite-strikers",
    title: "Why pressure boxing disrupts elite strikers",
    excerpt:
      "A tactical breakdown of cage-cutting, clinch layering, and the timing traps that flatten favorite narratives.",
    category: "analysis",
    publishedAt: "2026-03-28T16:00:00.000Z",
    tagIds: ["preview"],
    fighterIds: ["f-alex-pereira", "f-anatoly-malykhin"],
    sourceIds: ["src-presser"],
    meaning:
      "This content makes the site feel like a newsroom with a point of view rather than a passive aggregator.",
    sections: [
      {
        heading: "The pressure problem",
        body: "Pressure is not just forward movement. It is pace control, stance disruption, and forcing bad reads under fatigue."
      },
      {
        heading: "Style against style",
        body: "When a long-range striker loses the first beat, defensive choices narrow quickly and the clinch becomes a trap instead of a reset."
      }
    ]
  },
  {
    id: "a-postfight-quote",
    slug: "champion-signals-interest-in-superfight",
    title: "Champion signals interest in a superfight",
    excerpt:
      "A post-fight quote created instant promotional energy and opened several new storylines.",
    category: "interview",
    promotionId: "one",
    publishedAt: "2026-03-27T14:00:00.000Z",
    tagIds: ["post-fight"],
    fighterIds: ["f-anatoly-malykhin"],
    eventId: "e-one-fight-night",
    sourceIds: ["src-presser", "src-social"],
    meaning:
      "The quote is useful because it creates a bridge from completed event coverage into future event pages and fighter timelines.",
    sections: [
      {
        heading: "What was said",
        body: "The champion publicly floated a bigger matchup, giving the promotion and media a clear follow-up hook."
      },
      {
        heading: "Why it matters",
        body: "It turns a completed event into an ongoing story cluster touching interviews, rankings, and future previews."
      }
    ]
  }
];

export function getPromotionById(id?: string) {
  return promotions.find((promotion) => promotion.id === id);
}

export function getFighterBySlug(slug: string) {
  return fighters.find((fighter) => fighter.slug === slug);
}

export function getEventBySlug(slug: string) {
  return events.find((event) => event.slug === slug);
}

export function getArticleBySlug(slug: string) {
  return articles.find((article) => article.slug === slug);
}

export function getFightById(id: string) {
  return fights.find((fight) => fight.id === id);
}

export function getTagById(id: string) {
  return tags.find((tag) => tag.id === id);
}

export function getSourceById(id: string) {
  return sources.find((source) => source.id === id);
}

export function getArticlesForFighter(fighterId: string) {
  return articles.filter((article) => article.fighterIds.includes(fighterId));
}

export function getArticlesForEvent(eventId: string) {
  return articles.filter((article) => article.eventId === eventId);
}
