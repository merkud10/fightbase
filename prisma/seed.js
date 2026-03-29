const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  await prisma.articleSource.deleteMany();
  await prisma.articleFighter.deleteMany();
  await prisma.articleTag.deleteMany();
  await prisma.articleSection.deleteMany();
  await prisma.fight.deleteMany();
  await prisma.article.deleteMany();
  await prisma.event.deleteMany();
  await prisma.fighter.deleteMany();
  await prisma.source.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.promotion.deleteMany();

  const [ufc, pfl, one] = await Promise.all([
    prisma.promotion.create({ data: { slug: "ufc", name: "Ultimate Fighting Championship", shortName: "UFC" } }),
    prisma.promotion.create({ data: { slug: "pfl", name: "Professional Fighters League", shortName: "PFL" } }),
    prisma.promotion.create({ data: { slug: "one", name: "ONE Championship", shortName: "ONE" } })
  ]);

  const [tagAnnouncements, tagResults, tagPreview, tagPostFight] = await Promise.all([
    prisma.tag.create({ data: { slug: "announcements", label: "Announcements" } }),
    prisma.tag.create({ data: { slug: "results", label: "Results" } }),
    prisma.tag.create({ data: { slug: "preview", label: "Preview" } }),
    prisma.tag.create({ data: { slug: "post-fight", label: "Post-fight" } })
  ]);

  const [srcOfficial, srcPress, srcSocial] = await Promise.all([
    prisma.source.create({
      data: { slug: "official-ufc-announcement", label: "Official UFC announcement", type: "official", url: "https://www.ufc.com" }
    }),
    prisma.source.create({
      data: { slug: "post-event-press-conference", label: "Post-event press conference", type: "interview", url: "https://www.youtube.com" }
    }),
    prisma.source.create({
      data: { slug: "fighter-social-post", label: "Fighter social post", type: "social", url: "https://x.com" }
    })
  ]);

  const [islam, alex, shavkat, anatoly] = await Promise.all([
    prisma.fighter.create({
      data: {
        slug: "islam-makhachev",
        name: "Islam Makhachev",
        country: "Russia",
        weightClass: "Lightweight",
        status: "champion",
        record: "27-1",
        age: 34,
        heightCm: 178,
        reachCm: 179,
        team: "American Kickboxing Academy",
        style: "Sambo",
        bio: "Elite control grappler with layered striking and champion-level composure.",
        promotionId: ufc.id
      }
    }),
    prisma.fighter.create({
      data: {
        slug: "alex-pereira",
        name: "Alex Pereira",
        nickname: "Poatan",
        country: "Brazil",
        weightClass: "Light Heavyweight",
        status: "active",
        record: "12-3",
        age: 38,
        heightCm: 193,
        reachCm: 201,
        team: "Teixeira MMA",
        style: "Kickboxing",
        bio: "A devastating counter striker whose power changes the geometry of every fight.",
        promotionId: ufc.id
      }
    }),
    prisma.fighter.create({
      data: {
        slug: "shavkat-rakhmonov",
        name: "Shavkat Rakhmonov",
        country: "Kazakhstan",
        weightClass: "Welterweight",
        status: "prospect",
        record: "19-0",
        age: 31,
        heightCm: 185,
        reachCm: 196,
        team: "Dar Team",
        style: "Well-rounded",
        bio: "Pressure, finishing instincts, and composure make him one of the division's biggest threats.",
        promotionId: ufc.id
      }
    }),
    prisma.fighter.create({
      data: {
        slug: "anatoly-malykhin",
        name: "Anatoly Malykhin",
        country: "Russia",
        weightClass: "Heavyweight",
        status: "champion",
        record: "15-1",
        age: 37,
        heightCm: 180,
        reachCm: 190,
        team: "Golden Team",
        style: "Wrestle-boxing",
        bio: "Compact heavyweight champion with pressure and layered finishing ability.",
        promotionId: one.id
      }
    })
  ]);

  const eventUfc = await prisma.event.create({
    data: {
      slug: "ufc-314",
      name: "UFC 314",
      date: new Date("2026-04-12T19:00:00.000Z"),
      city: "Las Vegas",
      venue: "T-Mobile Arena",
      status: "upcoming",
      summary: "A high-leverage card with title implications across multiple divisions.",
      promotionId: ufc.id
    }
  });

  const eventPfl = await prisma.event.create({
    data: {
      slug: "pfl-champions-series",
      name: "PFL Champions Series",
      date: new Date("2026-04-18T19:00:00.000Z"),
      city: "Riyadh",
      venue: "Kingdom Arena",
      status: "upcoming",
      summary: "A showcase event built around contender movement and international market expansion.",
      promotionId: pfl.id
    }
  });

  const eventOne = await prisma.event.create({
    data: {
      slug: "one-fight-night",
      name: "ONE Fight Night",
      date: new Date("2026-03-22T19:00:00.000Z"),
      city: "Tokyo",
      venue: "Ariake Arena",
      status: "completed",
      summary: "A completed event feeding the rankings, post-fight quotes, and next-fight matchmaking.",
      promotionId: one.id
    }
  });

  await Promise.all([
    prisma.fight.create({
      data: {
        stage: "main_card",
        weightClass: "Catchweight",
        status: "scheduled",
        eventId: eventUfc.id,
        fighterAId: shavkat.id,
        fighterBId: alex.id
      }
    }),
    prisma.fight.create({
      data: {
        stage: "main_card",
        weightClass: "Openweight",
        status: "scheduled",
        eventId: eventPfl.id,
        fighterAId: anatoly.id,
        fighterBId: shavkat.id
      }
    }),
    prisma.fight.create({
      data: {
        stage: "main_card",
        weightClass: "Light Heavyweight",
        status: "completed",
        winnerFighterId: anatoly.id,
        method: "TKO",
        resultRound: 3,
        resultTime: "2:41",
        eventId: eventOne.id,
        fighterAId: anatoly.id,
        fighterBId: alex.id
      }
    })
  ]);

  await prisma.article.create({
    data: {
      slug: "title-eliminator-reframes-welterweight-picture",
      title: "Title eliminator reframes the welterweight picture",
      excerpt: "A newly confirmed contender bout changes the title queue and creates immediate ranking pressure.",
      meaning: "This matters because the winner jumps from contender status into probable title-shot territory.",
      category: "news",
      status: "published",
      publishedAt: new Date("2026-03-29T09:00:00.000Z"),
      promotionId: ufc.id,
      eventId: eventUfc.id,
      sections: {
        create: [
          { heading: "What happened", body: "The promotion locked in a fight with direct title implications.", sortOrder: 1 },
          { heading: "Context", body: "The division has been stalled by injuries and unclear contender order.", sortOrder: 2 },
          { heading: "What comes next", body: "The winner likely becomes the next obvious challenger.", sortOrder: 3 }
        ]
      },
      tagMap: {
        create: [{ tagId: tagAnnouncements.id }, { tagId: tagPreview.id }]
      },
      fighterMap: {
        create: [{ fighterId: shavkat.id }, { fighterId: alex.id }]
      },
      sourceMap: {
        create: [{ sourceId: srcOfficial.id }, { sourceId: srcSocial.id }]
      }
    }
  });

  await prisma.article.create({
    data: {
      slug: "why-pressure-boxing-disrupts-elite-strikers",
      title: "Why pressure boxing disrupts elite strikers",
      excerpt: "A tactical breakdown of cage-cutting, clinch layering, and timing traps.",
      meaning: "This content makes the site feel like a newsroom with a point of view rather than a passive aggregator.",
      category: "analysis",
      status: "published",
      publishedAt: new Date("2026-03-28T16:00:00.000Z"),
      sections: {
        create: [
          { heading: "The pressure problem", body: "Pressure is pace control, stance disruption, and forcing bad reads.", sortOrder: 1 },
          { heading: "Style against style", body: "When long-range strikers lose the first beat, defensive choices narrow quickly.", sortOrder: 2 }
        ]
      },
      tagMap: {
        create: [{ tagId: tagPreview.id }]
      },
      fighterMap: {
        create: [{ fighterId: alex.id }, { fighterId: anatoly.id }]
      },
      sourceMap: {
        create: [{ sourceId: srcPress.id }]
      }
    }
  });

  await prisma.article.create({
    data: {
      slug: "champion-signals-interest-in-superfight",
      title: "Champion signals interest in a superfight",
      excerpt: "A post-fight quote created instant promotional energy and opened several new storylines.",
      meaning: "The quote bridges completed event coverage into future event pages and fighter timelines.",
      category: "interview",
      status: "published",
      publishedAt: new Date("2026-03-27T14:00:00.000Z"),
      promotionId: one.id,
      eventId: eventOne.id,
      sections: {
        create: [
          { heading: "What was said", body: "The champion publicly floated a bigger matchup after the win.", sortOrder: 1 },
          { heading: "Why it matters", body: "It turns a completed event into an ongoing story cluster.", sortOrder: 2 }
        ]
      },
      tagMap: {
        create: [{ tagId: tagPostFight.id }, { tagId: tagResults.id }]
      },
      fighterMap: {
        create: [{ fighterId: anatoly.id }]
      },
      sourceMap: {
        create: [{ sourceId: srcPress.id }, { sourceId: srcSocial.id }]
      }
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
