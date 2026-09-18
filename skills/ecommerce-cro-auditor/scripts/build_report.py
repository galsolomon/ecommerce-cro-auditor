#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_report.py: בונה את שלד הדוח הסופי ואת כרטיסי ה-A/B (שלבים 6 עד 8 של ecommerce-cro-auditor).

קלט:  06-merged/findings.json (הפלט של merge_findings.py) ו-01-brief.md (לשם החנות והכתובת).
פלט:  08-final-report.md  רשימת השינויים לפי אזור באתר, מדורגת ומסווגת, עם שדות [[...]] לטקסט שדורש שיקול דעת.
       09-ab-tests.md      כרטיס ניסוי לכל פריט שסווג "ניסוי A/B".

התבניות נמצאות ב-assets/ בתיקיית הסקיל. הסקריפט ממלא {{...}} ומשאיר [[...]] למוביל.

דוגמאות:
  python build_report.py --audit cro-audit
  python build_report.py --audit cro-audit --top 15 --store-name "החנות של דנה"
"""
import argparse
import json
import os
import re
import sys
from collections import Counter, OrderedDict
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL_DIR = os.path.dirname(HERE)
ASSETS = os.path.join(SKILL_DIR, "assets")

PAGE_TYPES = ["global", "home", "category", "search", "product", "cart", "checkout", "account", "content", "policy", "other"]
PAGE_TYPE_HE = OrderedDict(
    [
        ("global", "גלובלי: כותרת, ניווט, פוטר, ביצועים ונגישות בכל העמודים"),
        ("home", "דף הבית"),
        ("category", "עמודי קטגוריה"),
        ("search", "חיפוש"),
        ("product", "עמוד מוצר"),
        ("cart", "עגלה"),
        ("checkout", "צ'קאאוט"),
        ("account", "חשבון והתחברות"),
        ("content", "תוכן: אודות, יצירת קשר, שאלות נפוצות"),
        ("policy", "עמודי מדיניות"),
        ("other", "אחר"),
    ]
)
PAGE_TYPE_SHORT = {"global": "גלובלי", "home": "דף הבית", "category": "קטגוריה", "search": "חיפוש", "product": "מוצר", "cart": "עגלה", "checkout": "צ'קאאוט", "account": "חשבון", "content": "תוכן", "policy": "מדיניות", "other": "אחר"}
EVIDENCE_HE = {"fact": "עובדה מבוססת", "hypothesis": "השערה", "ab-test": "ניסוי A/B"}
DEVICE_HE = {"mobile": "מובייל", "desktop": "דסקטופ", "both": "שניהם"}
TIERS = ["מיידי", "בקרוב", "פרויקט", "אחר כך"]
VERDICT_HE = {"supports": "תומך", "weakens": "מחליש", "contradicts": "סותר", "reject": "דוחה"}


def esc(s):
    return str(s or "").replace("|", "\\|").replace("\n", " ").strip()


def short(s, n=140):
    s = esc(s)
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


def read(path):
    with open(path, "r", encoding="utf-8") as fh:
        return fh.read()


def brief_field(brief, label):
    m = re.search(r"\*\*" + re.escape(label) + r"\*\*\s*:\s*(.+)", brief or "")
    if not m:
        return None
    v = m.group(1).strip()
    return None if (not v or v.startswith("[[")) else v


def overview_table(active, data):
    lines = ["| מדד | ערך |", "|---|---|"]
    lines.append(f"| ממצאים שנאספו מכל הסוכנים | {data['stats'].get('collected', len(active))} |")
    lines.append(f"| אחרי איחוד כפילויות | {data['stats'].get('merged', '-')} |")
    lines.append(f"| פעילים בדוח | {len(active)} |")
    lines.append(f"| נדחו באימות או בהכרעה | {data['stats'].get('dropped', 0)} |")
    tiers = Counter(f["tier"] for f in active)
    lines.append("| לפי שכבה | " + ", ".join(f"{t}: {tiers.get(t, 0)}" for t in TIERS) + " |")
    ev = Counter(f["evidence_type"] for f in active)
    lines.append("| לפי סוג ראיה | " + ", ".join(f"{EVIDENCE_HE[k]}: {ev.get(k, 0)}" for k in ("fact", "hypothesis", "ab-test")) + " |")
    dev = Counter(f["device"] for f in active)
    lines.append("| לפי מכשיר | " + ", ".join(f"{DEVICE_HE[k]}: {dev.get(k, 0)}" for k in ("mobile", "desktop", "both")) + " |")
    pt = Counter(f["page_type"] for f in active)
    lines.append("| לפי אזור | " + ", ".join(f"{PAGE_TYPE_SHORT[k]}: {pt[k]}" for k in PAGE_TYPES if pt.get(k)) + " |")
    agreed = sum(1 for f in active if f.get("agreement", 1) > 1)
    lines.append(f"| ממצאים שעליהם הסכימו לפחות שני סוכנים | {agreed} |")
    return "\n".join(lines)


def top_table(active, n):
    items = sorted(active, key=lambda f: (-f["priority"], f["id"]))[:n]
    lines = ["| # | מזהה | שינוי | אזור | מכשיר | ראיה | השפעה | ביטחון | מאמץ | עדיפות | שכבה |", "|---|---|---|---|---|---|---|---|---|---|---|"]
    for i, f in enumerate(items, 1):
        lines.append(f"| {i} | {f['id']} | {short(f['title'], 90)} | {PAGE_TYPE_SHORT[f['page_type']]} / {esc(f['area'])} | {DEVICE_HE[f['device']]} | {EVIDENCE_HE[f['evidence_type']]} | {f['impact']} | {f['confidence']} | {f['effort']} | {f['priority']} | {f['tier']} |")
    return "\n".join(lines)


def by_area_sections(active):
    out = []
    for pt in PAGE_TYPES:
        items = sorted([f for f in active if f["page_type"] == pt], key=lambda f: (-f["priority"], f["id"]))
        if not items:
            continue
        count = "שינוי אחד" if len(items) == 1 else f"{len(items)} שינויים"
        out.append(f"### {PAGE_TYPE_HE[pt]} ({count})")
        out.append("")
        out.append("| מזהה | מה לשנות | למה (תצפית ומקור) | השפעה / ביטחון / מאמץ | עדיפות | שכבה | ראיה | איך נדע |")
        out.append("|---|---|---|---|---|---|---|---|")
        for f in items:
            what = f"**{esc(f['title'])}**<br>{short(f['recommendation'], 260)}"
            if f["device"] != "both":
                what += f"<br>*{DEVICE_HE[f['device']]} בלבד*"
            why = f"{short(f['observation'], 200)}<br>*מקור: {short(f['source'] or 'לא צוין', 90)}*"
            if f.get("agreement", 1) > 1:
                why += f"<br>*הסכמה: {', '.join(f['agents'])}*"
            metric = short(f.get("metric") or "[[להגדיר מדד]]", 90)
            out.append(f"| {f['id']} | {what} | {why} | {f['impact']} / {f['confidence']} / {f['effort']} | {f['priority']} | {f['tier']} | {EVIDENCE_HE[f['evidence_type']]} | {metric} |")
        out.append("")
        out.append(f"[[הערות ל{PAGE_TYPE_SHORT[pt]}: תלויות בין הפריטים, סדר ביצוע מומלץ, מה לא לגעת בו.]]")
        out.append("")
    return "\n".join(out)


def ab_list(active):
    items = sorted([f for f in active if f["evidence_type"] == "ab-test"], key=lambda f: (-f["priority"], f["id"]))
    if not items:
        return "אין פריטים שסווגו כניסוי A/B."
    lines = ["| מזהה | ניסוי | אזור | מדד ראשי | עדיפות |", "|---|---|---|---|---|"]
    for f in items:
        lines.append(f"| {f['id']} | {short(f['title'], 90)} | {PAGE_TYPE_SHORT[f['page_type']]} / {esc(f['area'])} | {short(f.get('metric') or '[[להגדיר]]', 80)} | {f['priority']} |")
    return "\n".join(lines)


def blind_spots(data):
    bs = data.get("blind_spots") or []
    if not bs:
        return "לא דווחו נקודות עיוורות."
    return "\n".join(f"- {esc(b)}" for b in bs)


def resolved_contradictions(all_findings):
    rows = []
    for f in all_findings:
        decisions = [a for a in f.get("adjustments") or [] if a.startswith("הכרעה:")]
        if decisions and any(ch.get("verdict") in ("contradicts", "reject") for ch in f.get("challenges") or []):
            rows.append(f"- **{f['id']}** ({f['title']}): " + " ".join(esc(d) for d in decisions))
    return "\n".join(rows) if rows else "לא היו סתירות שדרשו הכרעה, או שההכרעות טרם נרשמו ב-`resolutions.json`."


def open_contradictions(all_findings):
    rows = [f"- **{f['id']}** ({f['title']}): {esc(f.get('status_note'))}" for f in all_findings if f.get("status") in ("needs-resolution", "rejected-pending")]
    return "\n".join(rows) if rows else "אין סתירות פתוחות."


def agent_summaries(data):
    out = []
    names = {"cro-expert": "מומחה CRO", "ux-researcher": "חוקר UX", "consumer-psychologist": "פסיכולוג צרכני", "mobile-expert": "מומחה מובייל", "accessibility-performance-expert": "מומחה נגישות וביצועים", "devils-advocate": "Devil's Advocate", "page-scan": "סריקה עמוד-עמוד"}
    for agent, summary in (data.get("agent_summaries") or {}).items():
        out.append(f"**{names.get(agent, agent)}**: {esc(summary) or '(אין סיכום)'}")
        out.append("")
    return "\n".join(out) if out else "אין סיכומים."


def dropped_table(all_findings):
    items = [f for f in all_findings if f.get("status") == "dropped"]
    if not items:
        return "לא נדחו ממצאים."
    lines = ["| מזהה | ממצא | סוכנים | סיבת הדחייה |", "|---|---|---|---|"]
    for f in items:
        lines.append(f"| {f['id']} | {short(f['title'], 90)} | {esc(', '.join(f.get('agents') or []))} | {short(f.get('status_note') or '', 200)} |")
    return "\n".join(lines)


def risks_of(f):
    parts = []
    for ch in f.get("challenges") or []:
        if ch.get("risk"):
            parts.append(f"{ch['risk']} ({ch.get('by', '')})")
        elif ch.get("verdict") in ("weakens", "contradicts", "reject") and ch.get("argument"):
            parts.append(f"{VERDICT_HE[ch['verdict']]}: {ch['argument']}")
    return esc("; ".join(parts)) if parts else "לא צוינו סיכונים בערעורים. [[לחשוב: מה עלול לרדת אם השינוי מיושם?]]"


def render_card(template, f):
    rec = esc(f["recommendation"])
    rec_short = rec if len(rec) <= 120 else rec[:119].rstrip() + "…"
    prob = esc(f["problem"])
    prob_short = prob if len(prob) <= 120 else prob[:119].rstrip() + "…"
    repl = {
        "{{id}}": f["id"],
        "{{title}}": esc(f["title"]),
        "{{page_type_he}}": PAGE_TYPE_SHORT[f["page_type"]],
        "{{url}}": f.get("url") or "כל העמודים מהסוג הזה",
        "{{area}}": esc(f["area"]),
        "{{device_he}}": DEVICE_HE[f["device"]],
        "{{agents}}": ", ".join(f.get("agents") or []),
        "{{impact}}": str(f["impact"]),
        "{{confidence}}": str(f["confidence"]),
        "{{effort}}": str(f["effort"]),
        "{{priority}}": str(f["priority"]),
        "{{observation}}": esc(f["observation"]),
        "{{problem}}": prob,
        "{{problem_short}}": prob_short,
        "{{recommendation}}": rec,
        "{{recommendation_short}}": rec_short,
        "{{metric}}": esc(f.get("metric") or "[[להגדיר מדד ראשי]]"),
        "{{source}}": esc(f.get("source") or "לא צוין"),
        "{{risks}}": risks_of(f),
    }
    out = template
    for k, v in repl.items():
        out = out.replace(k, v)
    return out


def main():
    parser = argparse.ArgumentParser(description="בניית שלד הדוח הסופי וכרטיסי A/B.", formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
    parser.add_argument("--audit", default="cro-audit", help="תיקיית הביקורת (ברירת מחדל: cro-audit)")
    parser.add_argument("--findings", default=None, help="נתיב ל-findings.json (ברירת מחדל: <audit>/06-merged/findings.json)")
    parser.add_argument("--brief", default=None, help="נתיב לתדריך (ברירת מחדל: <audit>/01-brief.md)")
    parser.add_argument("--out", default=None, help="נתיב הדוח (ברירת מחדל: <audit>/08-final-report.md)")
    parser.add_argument("--ab-out", default=None, help="נתיב כרטיסי ה-A/B (ברירת מחדל: <audit>/09-ab-tests.md)")
    parser.add_argument("--templates", default=ASSETS, help="תיקיית התבניות (ברירת מחדל: assets בסקיל)")
    parser.add_argument("--top", type=int, default=10, help="כמה פריטים בטבלת הראשונים (ברירת מחדל: 10)")
    parser.add_argument("--store-name", default=None)
    parser.add_argument("--store-url", default=None)
    parser.add_argument("--force", action="store_true", help="לדרוס דוח קיים (אחרת נשמר עם סיומת .new.md כדי לא למחוק טקסט שכבר נכתב)")
    args = parser.parse_args()

    findings_path = args.findings or os.path.join(args.audit, "06-merged", "findings.json")
    brief_path = args.brief or os.path.join(args.audit, "01-brief.md")
    out_path = args.out or os.path.join(args.audit, "08-final-report.md")
    ab_path = args.ab_out or os.path.join(args.audit, "09-ab-tests.md")

    try:
        data = json.loads(read(findings_path))
    except (OSError, json.JSONDecodeError) as e:
        print(f"לא ניתן לקרוא את {findings_path}: {e}. הרץ קודם את merge_findings.py.", file=sys.stderr)
        return 1
    brief = read(brief_path) if os.path.exists(brief_path) else ""
    store_name = args.store_name or brief_field(brief, "שם החנות") or data.get("site") or "[[שם החנות]]"
    store_url = args.store_url or brief_field(brief, "כתובת") or "[[כתובת החנות]]"

    try:
        report_tpl = read(os.path.join(args.templates, "final-report-template.md"))
        card_tpl = read(os.path.join(args.templates, "ab-test-card-template.md"))
    except OSError as e:
        print(f"לא נמצאו התבניות ב-{args.templates}: {e}", file=sys.stderr)
        return 1

    all_findings = data.get("findings") or []
    active = [f for f in all_findings if f.get("status") == "active"]
    if not active:
        print("אין ממצאים פעילים ב-findings.json. אם יש ממצאים שממתינים להכרעה, כתוב resolutions.json והרץ שוב את merge_findings.py.", file=sys.stderr)
    pending = [f for f in all_findings if f.get("status") in ("needs-resolution", "rejected-pending")]
    if pending:
        print(f"אזהרה: {len(pending)} ממצאים עדיין ממתינים להכרעה ולא ייכנסו לרשימה. ראה 06-merged/contradictions.md.")

    agents = set()
    for f in all_findings:
        agents.update(f.get("agents") or [])
    repl = {
        "{{store_name}}": store_name,
        "{{store_url}}": store_url,
        "{{date}}": date.today().isoformat(),
        "{{finding_count}}": str(len(active)),
        "{{total_count}}": str(data.get("stats", {}).get("collected", len(all_findings))),
        "{{agent_count}}": str(len(agents)),
        "{{overview_table}}": overview_table(active, data),
        "{{top_table}}": top_table(active, args.top),
        "{{by_area_sections}}": by_area_sections(active),
        "{{ab_list}}": ab_list(active),
        "{{blind_spots}}": blind_spots(data),
        "{{resolved_contradictions}}": resolved_contradictions(all_findings),
        "{{open_contradictions}}": open_contradictions(all_findings),
        "{{agent_summaries}}": agent_summaries(data),
        "{{dropped_table}}": dropped_table(all_findings),
    }
    report = report_tpl
    for k, v in repl.items():
        report = report.replace(k, v)

    ab_items = sorted([f for f in active if f["evidence_type"] == "ab-test"], key=lambda f: (-f["priority"], f["id"]))
    ab_doc = [f"# כרטיסי ניסוי A/B: {store_name}", "", f"- **תאריך**: {date.today().isoformat()}", f"- **פריטים**: {len(ab_items)}", "", "כל כרטיס מגדיר השערה, מדד ראשי, מדד שמירה, גודל מדגם ומשך. שדות [[...]] דורשים מילוי לפי נתוני התנועה. הכללים ב-`references/scoring-model.md`, סעיפים 6 ו-7.", ""]
    if not ab_items:
        ab_doc.append("אין פריטים שסווגו כניסוי A/B.")
    for f in ab_items:
        ab_doc.append(render_card(card_tpl, f))
    ab_text = "\n".join(ab_doc) + "\n"

    for path, text in ((out_path, report), (ab_path, ab_text)):
        target = path
        if os.path.exists(path) and not args.force:
            target = re.sub(r"\.md$", ".new.md", path)
            print(f"{path} כבר קיים; נכתב ל-{target} כדי לא לדרוס טקסט שמולא. השתמש ב---force כדי לדרוס.")
        with open(target, "w", encoding="utf-8") as fh:
            fh.write(text)
        print(f"נכתב: {target}")

    todo = report.count("[[")
    print(f"\nבדוח נשארו {todo} שדות [[...]] למילוי ידני (תקציר מנהלים, הערות לכל אזור, תוכנית). פריטים פעילים: {len(active)}, מתוכם ניסויי A/B: {len(ab_items)}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
