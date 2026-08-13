import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FightBase Media",
    short_name: "FightBase",
    description: "Новости UFC, прогнозы, турниры, бойцы и рейтинги.",
    start_url: "/ru",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png"
      },
      {
        src: "/apple-icon.png",
        sizes: "512x512",
        type: "image/png"
      }
    ]
  };
}
