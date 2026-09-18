#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
init_audit.py: יוצר את תיקיית הביקורת ואת קובץ התדריך (שלב 0 של ecommerce-cro-auditor).

מה נוצר:
  <out>/
  ├── 01-brief.md            תדריך מתוך התבנית, עם שם החנות, הכתובת והתאריך
  ├── 02-crawl/screenshots/  לפלט של crawl_site.py
  ├── 04-knowledge/          למסמכי הידע של שלב 2
  ├── 05-agents/             לקובצי ה-JSON של ששת הסוכנים
  ├── 06-merged/             לפלט של merge_findings.py
  └── README.md              הסבר קצר על המבנה

דוגמה:
  python init_audit.py --out cro-audit --url https://shop.example.co.il --name "החנות של דנה"

הסקריפט לא דורס קבצים קיימים; אם 01-brief.md כבר קיים, הוא נשאר כמו שהוא.
"""
import argparse
import os
import sys
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL_DIR = os.path.dirname(HERE)
TEMPLATE = os.path.join(SKILL_DIR, "assets", "brief-template.md")

FOLDERS = [
    "02-crawl/screenshots",
    "04-knowledge",
    "05-agents",
    "06-merged",
]

AUDIT_README = """# תיקיית ביקורת CRO: {name}

התיקייה נוצרה על ידי הסקיל `ecommerce-cro-auditor`. הקבצים נוצרים לפי סדר השלבים:

| קובץ / תיקייה | שלב | מה יש שם |
|---|---|---|
| `01-brief.md` | 0 | תדריך: מטרות, קהל, פלטפורמה, אילוצים |
| `02-crawl/` | 0 | `pages.json`, `summary.md`, וצילומי מסך במובייל ובדסקטופ |
| `03-research.md` | 1 | מחקר ממקורות מקצועיים |
| `04-knowledge/` | 2 | `cro.md`, `ux.md`, `psychology.md`, `mobile.md`, `tools.md` |
| `05-agents/` | 3 | קובץ JSON לכל אחד מששת הסוכנים |
| `06-merged/` | 4 | ממצאים מאוחדים, סתירות, סטטיסטיקה, הכרעות |
| `07-page-scan.md` | 5 | מטריצת כיסוי עמוד-עמוד |
| `08-final-report.md` | 6 עד 8 | רשימת השינויים לפי אזור, מדורגת ומסווגת |
| `09-ab-tests.md` | 8 | כרטיס ניסוי לכל פריט שסווג "ניסוי A/B" |
| `10-implementation.md` | 9 | יומן היישום, רק אחרי אישור |

כתובת החנות: {url}
תאריך פתיחה: {date}
"""


def main():
    parser = argparse.ArgumentParser(
        description="יוצר את תיקיית הביקורת ואת קובץ התדריך.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--out", default="cro-audit", help="תיקיית הביקורת (ברירת מחדל: cro-audit)")
    parser.add_argument("--url", default="[[כתובת החנות]]", help="כתובת החנות")
    parser.add_argument("--name", default="[[שם החנות]]", help="שם החנות")
    parser.add_argument("--template", default=TEMPLATE, help="נתיב לתבנית התדריך (ברירת מחדל: assets/brief-template.md בסקיל)")
    args = parser.parse_args()

    out = args.out
    os.makedirs(out, exist_ok=True)
    for folder in FOLDERS:
        os.makedirs(os.path.join(out, folder), exist_ok=True)

    today = date.today().isoformat()
    brief_path = os.path.join(out, "01-brief.md")
    if os.path.exists(brief_path):
        print(f"קיים כבר, לא נדרס: {brief_path}")
    else:
        try:
            with open(args.template, "r", encoding="utf-8") as f:
                template = f.read()
        except OSError as e:
            print(f"שגיאה: לא נמצאה תבנית התדריך ב-{args.template} ({e})", file=sys.stderr)
            return 1
        brief = (
            template.replace("{{store_name}}", args.name)
            .replace("{{store_url}}", args.url)
            .replace("{{date}}", today)
        )
        with open(brief_path, "w", encoding="utf-8") as f:
            f.write(brief)
        print(f"נוצר: {brief_path}")

    readme_path = os.path.join(out, "README.md")
    if not os.path.exists(readme_path):
        with open(readme_path, "w", encoding="utf-8") as f:
            f.write(AUDIT_README.format(name=args.name, url=args.url, date=today))
        print(f"נוצר: {readme_path}")

    print(f"תיקיית הביקורת מוכנה: {out}/")
    print("הצעד הבא: למלא את 01-brief.md עם המשתמש, ואז להריץ את crawl_site.py.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
