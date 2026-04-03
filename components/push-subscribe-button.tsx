"use client";

import { useState } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const normalized = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  const output = new Uint8Array(raw.length);

  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }

  return output;
}

type PushButtonProps = {
  label: string;
  locale: string;
};

export function PushSubscribeButton({ label, locale }: PushButtonProps) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) {
      return;
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setMessage(locale === "ru" ? "Браузер не поддерживает push-уведомления." : "This browser does not support push notifications.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const keyResponse = await fetch("/api/push/public-key");
      const keyPayload = await keyResponse.json();

      if (!keyPayload?.enabled || !keyPayload?.publicKey) {
        setMessage(
          locale === "ru"
            ? "Push-уведомления пока не настроены на сервере."
            : "Push notifications are not configured on the server yet."
        );
        return;
      }

      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        setMessage(
          locale === "ru"
            ? "Разрешение на уведомления не выдано."
            : "Notification permission was not granted."
        );
        return;
      }

      const registration = await navigator.serviceWorker.register("/push-sw.js");
      const existingSubscription = await registration.pushManager.getSubscription();
      const subscription =
        existingSubscription ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyPayload.publicKey)
        }));

      const saveResponse = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          locale,
          subscription: subscription.toJSON()
        })
      });

      const savePayload = await saveResponse.json().catch(() => null);

      if (!saveResponse.ok || !savePayload?.ok) {
        throw new Error("Failed to save push subscription");
      }

      setMessage(
        locale === "ru"
          ? "Уведомления включены. Будем присылать важные обновления UFC."
          : "Notifications enabled. We will send major UFC updates."
      );
    } catch {
      setMessage(
        locale === "ru"
          ? "Не удалось подключить уведомления. Попробуй еще раз."
          : "Could not enable notifications. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="push-subscribe">
      <button type="button" className="button" onClick={handleClick} disabled={busy}>
        {busy ? (locale === "ru" ? "Подключаем..." : "Connecting...") : label}
      </button>
      {message ? <p className="push-subscribe-message">{message}</p> : null}
    </div>
  );
}
