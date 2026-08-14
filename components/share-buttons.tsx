"use client";

import { useState } from "react";

import { reachMetrikaGoal } from "@/lib/metrika";

type ShareButtonsProps = {
  url: string;
  title: string;
  locale: string;
};

export function ShareButtons({ url, title, locale }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  const telegramHref = `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`;
  const vkHref = `https://vk.com/share.php?url=${encodedUrl}&title=${encodedTitle}`;

  async function handleCopy() {
    reachMetrikaGoal("share_copy");

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(locale === "ru" ? "Скопируй ссылку:" : "Copy the link:", url);
    }
  }

  return (
    <div className="share-buttons" aria-label={locale === "ru" ? "Поделиться" : "Share"}>
      <span className="share-buttons-label">{locale === "ru" ? "Поделиться:" : "Share:"}</span>
      <a
        href={telegramHref}
        className="share-button"
        target="_blank"
        rel="noreferrer"
        onClick={() => reachMetrikaGoal("share_telegram")}
      >
        Telegram
      </a>
      <a
        href={vkHref}
        className="share-button"
        target="_blank"
        rel="noreferrer"
        onClick={() => reachMetrikaGoal("share_vk")}
      >
        VK
      </a>
      <button type="button" className="share-button" onClick={handleCopy}>
        {copied ? (locale === "ru" ? "Скопировано ✓" : "Copied ✓") : locale === "ru" ? "Ссылка" : "Link"}
      </button>
    </div>
  );
}
