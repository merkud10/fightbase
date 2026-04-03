self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: "FightBase Media",
      body: event.data ? event.data.text() : "Новое уведомление UFC"
    };
  }

  const title = payload.title || "FightBase Media";
  const options = {
    body: payload.body || "Новое уведомление UFC",
    icon: payload.icon || "/gorilla-crown-logo.png",
    badge: payload.badge || "/gorilla-crown-logo.png",
    data: {
      url: payload.url || "/ru"
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/ru";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client && client.url.includes(self.location.origin)) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    })
  );
});
