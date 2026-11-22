#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Живые посетители по дням из логов nginx — ряд для сравнения недель, независимый от Метрики.

Посетитель = IP за сутки по Москве, который открыл страницу сайта и загрузил
скрипты /_next/static/*.js (так отсекаются боты без браузера), с небот-UA.
Источник и раздел берутся по первой странице за день.

Пишет в CSV только завершённые дни, которых там ещё нет: логи хранятся 14 дней,
а файл копит историю. Формат строк: date,device,source,section,visitors.

Запуск: traffic_from_logs.py [--logs '/var/log/nginx/access.log*'] [--out FILE]

На сервере лежит копия вне каталога приложения, деплой её не обновляет:
  /usr/local/lib/fightbase/traffic_from_logs.py
  /etc/cron.d/fightbase-traffic — от root (логи nginx читает только root/adm), 00:20 UTC
После правки скопировать файл на сервер заново (scp).
"""
import argparse
import csv
import glob
import gzip
import os
import re
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone

MSK = timezone(timedelta(hours=3))
LINE = re.compile(r'^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+)[^"]*" (\d{3}) \S+ "([^"]*)" "([^"]*)"')
BOT_UA = re.compile(
    r"bot|crawl|spider|headless|python|curl|wget|go-http|facebookexternal|telegram|whatsapp|vkshare|preview|monitor|lighthouse",
    re.I,
)
MOBILE_UA = re.compile(r"iPhone|Android|Mobile")
JS_PATH = re.compile(r"^/_next/static/.*\.js")
NOT_PAGE = re.compile(r"^/(_next|api|media|static)/|\.[a-z0-9]{2,5}$", re.I)
SECTIONS = {"predictions", "fighters", "events", "rankings", "news", "compare", "champions", "results"}
FIELDS = ["date", "device", "source", "section", "visitors"]


def source_of(referer):
    if referer in ("", "-"):
        return "direct"
    host = re.sub(r"^https?://", "", referer).split("/")[0].lower()
    if "fightbase.ru" in host:
        return "internal"
    if "google." in host:
        return "google"
    if "yandex." in host or host.endswith("ya.ru"):
        return "yandex"
    if "bing." in host or "duckduckgo." in host or "yahoo." in host:
        return "other-search"
    return "other"


def section_of(path):
    parts = [p for p in path.split("?")[0].split("/") if p]
    if parts and parts[0] in ("ru", "en"):
        parts = parts[1:]
    if not parts:
        return "home"
    return parts[0] if parts[0] in SECTIONS else "other"


def parse(line):
    """Строка лога -> (день по Москве, ip, путь, referer, ua) или None."""
    m = LINE.match(line)
    if not m:
        return None
    ip, ts, method, path, status, referer, ua = m.groups()
    if method != "GET" or BOT_UA.search(ua) or not ua or ua == "-":
        return None
    when = datetime.strptime(ts, "%d/%b/%Y:%H:%M:%S %z").astimezone(MSK)
    return when, ip, path, status, referer, ua


def count(lines):
    """Итератор строк лога -> Counter{(date, device, source, section): visitors}."""
    first = {}  # (date, ip) -> (when, device, source, section)
    with_js = set()
    for line in lines:
        rec = parse(line)
        if not rec:
            continue
        when, ip, path, status, referer, ua = rec
        key = (when.date().isoformat(), ip)
        if JS_PATH.match(path):
            with_js.add(key)
            continue
        if NOT_PAGE.search(path.split("?")[0]) or "_rsc=" in path or not status.startswith("2"):
            continue
        if key not in first or when < first[key][0]:
            device = "mobile" if MOBILE_UA.search(ua) else "desktop"
            first[key] = (when, device, source_of(referer), section_of(path))
    result = Counter()
    for key, (_, device, source, section) in first.items():
        if key in with_js:
            result[(key[0], device, source, section)] += 1
    return result


def read_logs(pattern):
    for name in sorted(glob.glob(pattern)):
        opener = gzip.open if name.endswith(".gz") else open
        with opener(name, "rt", encoding="utf-8", errors="replace") as fh:
            yield from fh


def merge(out_path, counts, today):
    """Дописывает завершённые дни, которых в файле ещё нет. Возвращает список добавленных дат."""
    known = set()
    if os.path.exists(out_path):
        with open(out_path, encoding="utf-8", newline="") as fh:
            known = {row["date"] for row in csv.DictReader(fh)}
    if not counts:
        return []
    # Сегодняшний день не закончен; самый старый день в логах обрезан ротацией
    # (логи режутся в полночь UTC, а сутки считаем по Москве).
    oldest = min(k[0] for k in counts)
    days = sorted(d for d in {k[0] for k in counts} - known if oldest < d < today)
    if not days:
        return []
    new_file = not os.path.exists(out_path)
    with open(out_path, "a", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh)
        if new_file:
            writer.writerow(FIELDS)
        for key in sorted(k for k in counts if k[0] in days):
            writer.writerow([*key, counts[key]])
    return days


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--logs", default="/var/log/nginx/access.log*")
    ap.add_argument("--out", default="/var/log/fightbase/traffic-daily.csv")
    args = ap.parse_args()
    counts = count(read_logs(args.logs))
    added = merge(args.out, counts, datetime.now(MSK).date().isoformat())
    for day in added:
        rows = {k: v for k, v in counts.items() if k[0] == day}
        mob = sum(v for k, v in rows.items() if k[1] == "mobile")
        src = Counter()
        for k, v in rows.items():
            if k[1] == "mobile":
                src[k[2]] += v
        print(f"{day} mobile {mob} (google {src['google']}, yandex {src['yandex']}, direct {src['direct']}) desktop {sum(rows.values()) - mob}")
    if not added:
        print("no new complete days")
    return 0


if __name__ == "__main__":
    sys.exit(main())
