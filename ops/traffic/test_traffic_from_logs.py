# -*- coding: utf-8 -*-
"""Запуск: python -m unittest ops/traffic/test_traffic_from_logs.py"""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import traffic_from_logs as t  # noqa: E402

IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"
CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0 Safari/537.36"


def line(ip, ts, path, ref="-", ua=IPHONE, status=200, method="GET"):
    return f'{ip} - - [{ts} +0000] "{method} {path} HTTP/2.0" {status} 1234 "{ref}" "{ua}"\n'


JS = "/_next/static/chunks/main-abc.js"


class CountTest(unittest.TestCase):
    def test_visitor_needs_page_and_js(self):
        lines = [
            line("1.1.1.1", "10/Nov/2026:10:00:00", "/ru/predictions/x/y", "https://www.google.com/"),
            line("1.1.1.1", "10/Nov/2026:10:00:01", JS),
            line("2.2.2.2", "10/Nov/2026:10:00:00", "/ru/rankings", "https://yandex.ru/search/?text=x"),  # без JS
            line("3.3.3.3", "10/Nov/2026:10:00:01", JS),  # без страницы
        ]
        self.assertEqual(dict(t.count(lines)), {("2026-11-10", "mobile", "google", "predictions"): 1})

    def test_source_and_section_come_from_first_page(self):
        lines = [
            line("1.1.1.1", "10/Nov/2026:10:05:00", "/ru/rankings", "https://fightbase.ru/ru/fighters/a"),
            line("1.1.1.1", "10/Nov/2026:10:00:00", "/ru/fighters/a", "https://yandex.ru/"),
            line("1.1.1.1", "10/Nov/2026:10:00:01", JS),
        ]
        self.assertEqual(dict(t.count(lines)), {("2026-11-10", "mobile", "yandex", "fighters"): 1})

    def test_day_is_moscow_time(self):
        lines = [
            line("1.1.1.1", "10/Nov/2026:21:30:00", "/ru", ua=CHROME),
            line("1.1.1.1", "10/Nov/2026:21:30:01", JS, ua=CHROME),
        ]
        self.assertEqual(dict(t.count(lines)), {("2026-11-11", "desktop", "direct", "home"): 1})

    def test_bots_files_and_errors_are_skipped(self):
        lines = [
            line("1.1.1.1", "10/Nov/2026:10:00:00", "/ru", ua="Mozilla/5.0 (compatible; YandexBot/3.0)"),
            line("1.1.1.1", "10/Nov/2026:10:00:01", JS, ua="Mozilla/5.0 (compatible; YandexBot/3.0)"),
            line("2.2.2.2", "10/Nov/2026:10:00:00", "/robots.txt"),
            line("2.2.2.2", "10/Nov/2026:10:00:00", "/ru/nope", status=404),
            line("2.2.2.2", "10/Nov/2026:10:00:00", "/ru/rankings?_rsc=abc"),
            line("2.2.2.2", "10/Nov/2026:10:00:00", "/ru", method="POST"),
            line("2.2.2.2", "10/Nov/2026:10:00:01", JS),
            "мусор\n",
        ]
        self.assertEqual(dict(t.count(lines)), {})


class MergeTest(unittest.TestCase):
    def test_appends_only_new_complete_days(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, "t.csv")
            counts = {
                ("2026-11-08", "mobile", "google", "home"): 2,  # самый старый день в логах, обрезан
                ("2026-11-09", "mobile", "google", "home"): 3,
                ("2026-11-10", "mobile", "google", "home"): 5,
                ("2026-11-11", "mobile", "google", "home"): 1,  # сегодня, не закончен
            }
            self.assertEqual(t.merge(out, counts, "2026-11-11"), ["2026-11-09", "2026-11-10"])
            self.assertEqual(t.merge(out, counts, "2026-11-11"), [])
            # Позже: 11-е стало самым старым днём в логах — пропускаем, 12-е дописываем.
            later = {
                ("2026-11-11", "mobile", "google", "home"): 9,
                ("2026-11-12", "mobile", "google", "home"): 4,
            }
            self.assertEqual(t.merge(out, later, "2026-11-13"), ["2026-11-12"])
            with open(out, encoding="utf-8") as fh:
                self.assertEqual(
                    fh.read().splitlines(),
                    [
                        "date,device,source,section,visitors",
                        "2026-11-09,mobile,google,home,3",
                        "2026-11-10,mobile,google,home,5",
                        "2026-11-12,mobile,google,home,4",
                    ],
                )


if __name__ == "__main__":
    unittest.main()
