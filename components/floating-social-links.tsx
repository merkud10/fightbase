function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M21.9 4.6c.2-1-.4-1.4-1.3-1.1L2.8 10.4c-1 .4-1 1 .2 1.4l4.6 1.4 1.8 5.8c.2.7.1 1 .9 1 .6 0 .8-.3 1.2-.7l2.2-2.1 4.7 3.5c.9.5 1.5.2 1.8-.8L21.9 4.6Zm-12.5 8.2 9.2-5.8c.4-.3.8-.1.5.2l-7.6 6.8-.3 3.4-1.8-4.6Z"
      />
    </svg>
  );
}

function VkWordmark() {
  return <span className="floating-social-wordmark">vk</span>;
}

export async function FloatingSocialLinks() {
  const telegramUrl = process.env.NEXT_PUBLIC_TELEGRAM_URL?.trim() || "";
  const vkUrl = process.env.NEXT_PUBLIC_VK_URL?.trim() || "";
  const hasTelegram = telegramUrl && telegramUrl !== "https://t.me/" && telegramUrl !== "https://t.me";
  const hasVk = vkUrl && vkUrl !== "https://vk.com/" && vkUrl !== "https://vk.com";

  if (!hasTelegram && !hasVk) {
    return null;
  }

  return (
    <aside className="floating-social-rail" aria-label="Social links">
      {hasTelegram ? (
        <a
          href={telegramUrl}
          className="floating-social-link"
          target="_blank"
          rel="noreferrer"
          aria-label="FightBase Telegram"
          title="Telegram"
        >
          <TelegramIcon />
        </a>
      ) : null}
      {hasVk ? (
        <a
          href={vkUrl}
          className="floating-social-link floating-social-link--vk"
          target="_blank"
          rel="noreferrer"
          aria-label="FightBase VK"
          title="VK"
        >
          <VkWordmark />
        </a>
      ) : null}
    </aside>
  );
}
