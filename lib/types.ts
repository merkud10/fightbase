export type PromotionKey = "ufc" | "pfl" | "one";

export type ArticleCategory =
  | "news"
  | "analysis"
  | "interview"
  | "feature"
  | "video";

export type EventStatus = "upcoming" | "live" | "completed";

export type FighterStatus = "active" | "champion" | "retired" | "prospect";

export interface Promotion {
  id: string;
  name: string;
  shortName: string;
  slug: string;
}

export interface Source {
  id: string;
  label: string;
  type: "official" | "interview" | "social" | "press-release" | "stats";
  url: string;
}

export interface Tag {
  id: string;
  label: string;
  slug: string;
}

export interface Fighter {
  id: string;
  slug: string;
  name: string;
  nickname?: string;
  country: string;
  promotionId: string;
  weightClass: string;
  status: FighterStatus;
  record: string;
  age: number;
  heightCm: number;
  reachCm: number;
  team: string;
  style: string;
  bio: string;
  nextFightId?: string;
}

export interface Fight {
  id: string;
  eventId: string;
  stage: "main-card" | "prelims" | "early-prelims";
  fighterAId: string;
  fighterBId: string;
  weightClass: string;
  status: "scheduled" | "completed";
  result?: {
    winnerId: string;
    method: string;
    round: number;
    time: string;
  };
}

export interface Event {
  id: string;
  slug: string;
  name: string;
  promotionId: string;
  date: string;
  city: string;
  venue: string;
  status: EventStatus;
  mainEventFightId: string;
  summary: string;
}

export interface Article {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  category: ArticleCategory;
  promotionId?: string;
  publishedAt: string;
  tagIds: string[];
  fighterIds: string[];
  eventId?: string;
  sourceIds: string[];
  meaning: string;
  sections: Array<{
    heading: string;
    body: string;
  }>;
}
