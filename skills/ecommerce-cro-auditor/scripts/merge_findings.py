#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
merge_findings.py: איחוד ממצאי הסוכנים, כפילויות, ערעורים, הכרעות ודירוג (שלב 4 של ecommerce-cro-auditor).

מה הסקריפט עושה, בסדר הזה:
  1. טוען ובודק כל קובץ JSON בתיקיית הסוכנים (קובץ או ממצא לא תקין מדווח ומדולג).
  2. מאחד ממצאים כפולים (אותו סוג עמוד, כותרת והמלצה דומות). הסכמה של סוכנים
     בלתי תלויים מעלה ביטחון ב-1.
  3. מיישם את ערעורי ה-Devil's Advocate: supports (רישום), weakens (ביטחון -1,
     עובדה הופכת להשערה), contradicts (סימון להכרעה), reject (הוצאה זמנית).
  4. מוריד "עובדה" ל"השערה" כשאין מקור נקוב או שהביטחון נמוך מ-4.
  5. מיישם הכרעות מ-resolutions.json (keep / drop / ab-test / merge_into / split, עם overrides).
  6. מחשב עדיפות = השפעה × ביטחון × (6 - מאמץ), ושכבה: מיידי (80 ומעלה), בקרוב (40 עד 79), פרויקט (השפעה ≥ 4 ומאמץ ≥ 4), אחר כך.
  7. כותב findings.json, findings.md, contradictions.md, stats.md.

דוגמאות:
  python merge_findings.py cro-audit/05-agents --out cro-audit/06-merged
  python merge_findings.py cro-audit/05-agents --out cro-audit/06-merged --resolutions cro-audit/06-merged/resolutions.json
  python merge_findings.py cro-audit/05-agents --validate-only

הסקריפט דטרמיניסטי ואפשר להריץ אותו שוב אחרי כל עדכון.
"""
import argparse
import glob
import json
import os
import re
import sys
from collections import Counter, OrderedDict, defaultdict
from datetime import datetime

PAGE_TYPES = ["global", "home", "category", "search", "product", "cart", "checkout", "account", "content", "policy", "other"]
PAGE_TYPE_HE = OrderedDict(
    [
        ("global", "גלובלי (כל העמודים)"),
        ("home", "דף הבית"),
        ("category", "קטגוריה"),
        ("search", "חיפוש"),
        ("product", "עמוד מוצר"),
        ("cart", "עגלה"),
        ("checkout", "צ'קאאוט"),
        ("account", "חשבון"),
        ("content", "תוכן (אודות, קשר, שאלות נפוצות)"),
        ("policy", "מדיניות"),
        ("other", "אחר"),
    ]
)
EVIDENCE = ["fact", "hypothesis", "ab-test"]
EVIDENCE_HE = {"fact": "עובדה מבוססת", "hypothesis": "השערה", "ab-test": "ניסוי A/B"}
DEVICES = ["mobile", "desktop", "both"]
DEVICE_HE = {"mobile": "מובייל", "desktop": "דסקטופ", "both": "שניהם"}
VERDICTS = ["supports", "weakens", "contradicts", "reject"]
VERDICT_HE = {"supports": "תומך", "weakens": "מחליש", "contradicts": "סותר", "reject": "דוחה"}
TIERS = ["מיידי", "בקרוב", "פרויקט", "אחר כך"]
STATUS_HE = {"active": "פעיל", "dropped": "נדחה", "needs-resolution": "דורש הכרעה", "rejected-pending": "דחייה ממתינה לאישור", "merged": "אוחד"}
KNOWN_AGENTS = ["cro-expert", "ux-researcher", "consumer-psychologist", "mobile-expert", "accessibility-performance-expert", "devils-advocate", "page-scan"]
REQUIRED = ["id", "title", "page_type", "area", "device", "observation", "problem", "recommendation", "evidence_type", "source", "impact", "confidence", "effort"]
OVERRIDABLE = ["impact", "confidence", "effort", "evidence_type", "device", "recommendation", "title", "area", "page_type", "metric", "url"]
ID_RE = re.compile(r"^(cro|ux|psy|mob|a11y|da|scan)-\d{3}$")
GENERIC_SOURCE_RE = re.compile(r"^(מחקרים|מחקר|ידוע|best practices?|בסט פרקטיס|נהוג|מקובל|כללי|ניסיון|עקרון מקובל|-|n/a|none|null|לא ידוע|אין)?[.\s]*$", re.I)
STOPWORDS = set("את של על עם או גם לא אם כל יש אין זה זו זאת אל כי מה מי איך למה כדי בין עוד רק the a an to of and in on for is are with by at from that this it be as".split())
HEBREW_PREFIXES = "והבלמשכ"


def log(msg):
    print(msg, flush=True)


# ---------------------------------------------------------------------------
# טעינה ובדיקה
# ---------------------------------------------------------------------------


def to_int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def validate_finding(f, fname, warnings):
    if not isinstance(f, dict):
        warnings.append(f"{fname}: ממצא שאינו אובייקט, דולג")
        return None
    fid = str(f.get("id", "?"))
    missing = [k for k in REQUIRED if k not in f or f[k] in (None, "")]
    # source יכול להיות ריק (ואז לא fact); לא מדלגים בגללו
    missing = [k for k in missing if k != "source"]
    if missing:
        warnings.append(f"{fname} / {fid}: שדות חסרים {missing}, הממצא דולג")
        return None
    clean = dict(f)
    if not ID_RE.match(fid):
        warnings.append(f"{fname} / {fid}: מזהה לא בפורמט <קידומת>-NNN (ממשיכים)")
    if clean.get("page_type") not in PAGE_TYPES:
        warnings.append(f"{fname} / {fid}: page_type '{clean.get('page_type')}' לא מוכר, הוחלף ל-other")
        clean["page_type"] = "other"
    if clean.get("device") not in DEVICES:
        warnings.append(f"{fname} / {fid}: device '{clean.get('device')}' לא מוכר, הוחלף ל-both")
        clean["device"] = "both"
    if clean.get("evidence_type") not in EVIDENCE:
        warnings.append(f"{fname} / {fid}: evidence_type '{clean.get('evidence_type')}' לא מוכר, הוחלף ל-hypothesis")
        clean["evidence_type"] = "hypothesis"
    for k in ("impact", "confidence", "effort"):
        v = to_int(clean.get(k))
        if v is None or v < 1 or v > 5:
            warnings.append(f"{fname} / {fid}: {k}={clean.get(k)} מחוץ לטווח 1 עד 5, הממצא דולג")
            return None
        clean[k] = v
    clean["source"] = str(clean.get("source") or "").strip()
    clean["area"] = str(clean.get("area") or "other").strip().lower()
    clean["metric"] = str(clean.get("metric") or "").strip()
    clean["url"] = clean.get("url") or None
    clean["screenshot"] = clean.get("screenshot") or None
    for k in ("title", "observation", "problem", "recommendation"):
        clean[k] = str(clean[k]).strip()
    return clean


def load_agent_files(folder, warnings):
    files = sorted(glob.glob(os.path.join(folder, "*.json")))
    files = [f for f in files if os.path.basename(f) != "resolutions.json"]
    agents = []
    for path in files:
        fname = os.path.basename(path)
        try:
            with open(path, "r", encoding="utf-8") as fh:
                obj = json.load(fh)
        except (OSError, json.JSONDecodeError) as e:
            warnings.append(f"{fname}: לא ניתן לקרוא ({e}), הקובץ דולג")
            continue
        if not isinstance(obj, dict):
            warnings.append(f"{fname}: המבנה אינו אובייקט JSON, דולג")
            continue
        agent = str(obj.get("agent") or os.path.splitext(fname)[0])
        if agent not in KNOWN_AGENTS:
            warnings.append(f"{fname}: סוכן לא מוכר '{agent}' (ממשיכים)")
        findings = []
        for f in obj.get("findings") or []:
            c = validate_finding(f, fname, warnings)
            if c:
                c["agent"] = agent
                findings.append(c)
        challenges = []
        for ch in obj.get("challenges") or []:
            if not isinstance(ch, dict) or not ch.get("finding_id") or ch.get("verdict") not in VERDICTS:
                warnings.append(f"{fname}: ערעור לא תקין {str(ch)[:80]}, דולג")
                continue
            ch = dict(ch)
            ch["by"] = agent
            challenges.append(ch)
        agents.append(
            {
                "agent": agent,
                "file": fname,
                "summary": str(obj.get("summary") or "").strip(),
                "pages_reviewed": obj.get("pages_reviewed") or [],
                "findings": findings,
                "challenges": challenges,
                "blind_spots": [str(b) for b in (obj.get("blind_spots") or [])],
            }
        )
        log(f"נטען {fname}: {len(findings)} ממצאים, {len(challenges)} ערעורים")
    return agents


# ---------------------------------------------------------------------------
# כפילויות
# ---------------------------------------------------------------------------


def tokens(text):
    text = re.sub(r"[^\w\s\u0590-\u05FF]", " ", (text or "").lower())
    out = set()
    for t in text.split():
        if len(t) > 3 and t[0] in HEBREW_PREFIXES and re.match(r"[\u0590-\u05FF]", t):
            t = t[1:]
        if len(t) < 2 or t in STOPWORDS:
            continue
        out.add(t)
    return out


def jaccard(a, b):
    if not a or not b:
        return 0.0
    return len(a & b) / float(len(a | b))


def evidence_rank(e):
    # ab-test "מנצח" (הסיכון נשאר), אחרת החזק יותר
    return {"ab-test": 3, "fact": 2, "hypothesis": 1}.get(e, 1)


def compatible(a, b):
    """שני ממצאים יכולים להיות כפולים רק אם הם על אותו סוג עמוד (או שאחד מהם גלובלי)."""
    return a["page_type"] == b["page_type"] or "global" in (a["page_type"], b["page_type"])


def dedupe(findings, threshold, agreement_bonus):
    """
    אשכול חמדני "כוכב": הממצאים ממוינים לפי חוזק (השפעה, ביטחון), וכל ממצא מצטרף לאשכול הראשון
    שהממצא הראשי שלו דומה לו מספיק. כל חבר באשכול דומה לראשי, ולכן אין שרשור של ממצאים שונים
    דרך חוליות ביניים. האזור (area) לא נבדק, כי סוכנים שונים מסמנים אזורים שונים לאותה בעיה.
    """
    order = sorted(findings, key=lambda f: (f["impact"], f["confidence"], -f["effort"], f["id"]), reverse=True)
    toks = {f["id"]: tokens(f["title"] + " " + f["recommendation"]) for f in findings}
    clusters = []
    for f in order:
        placed = False
        for c in clusters:
            p = c[0]
            if not compatible(f, p):
                continue
            th = threshold
            if f.get("url") and f.get("url") == p.get("url"):
                th = max(0.2, threshold - 0.1)
            if jaccard(toks[f["id"]], toks[p["id"]]) >= th:
                c.append(f)
                placed = True
                break
        if not placed:
            clusters.append([f])
    merged = []
    for members in clusters:
        merged.append(build_merged(members, agreement_bonus))
    return merged


def build_merged(members, agreement_bonus):
    """בונה ממצא מאוחד מרשימת חברים; הראשון ברשימה הוא הראשי."""
    primary = dict(members[0])
    agents = []
    for m in members:
        if m["agent"] not in agents:
            agents.append(m["agent"])
    primary["agents"] = agents
    primary["merged_from"] = [m["id"] for m in members]
    primary["agreement"] = len(agents)
    primary["adjustments"] = []
    primary["challenges"] = []
    primary["status"] = "active"
    primary["status_note"] = ""
    primary["members"] = [dict(m) for m in members[1:]]
    primary["merged_notes"] = [f"{m['id']} ({m['agent']}): {m['title']}. המלצה: {m['recommendation']}" for m in members[1:]]
    if len(members) > 1:
        best_ev = max(members, key=lambda m: evidence_rank(m["evidence_type"]))["evidence_type"]
        if best_ev != primary["evidence_type"]:
            primary["adjustments"].append(f"סוג הראיה נקבע ל-{EVIDENCE_HE[best_ev]} לפי הממצא המאוחד ({', '.join(m['id'] for m in members)})")
            primary["evidence_type"] = best_ev
        if len(agents) > 1 and agreement_bonus and primary["confidence"] < 5:
            primary["confidence"] += 1
            primary["adjustments"].append(f"ביטחון +1: הסכמה בלתי תלויה של {len(agents)} סוכנים ({', '.join(agents)})")
    return primary


# ---------------------------------------------------------------------------
# ערעורים, הורדות, הכרעות, דירוג
# ---------------------------------------------------------------------------


def apply_challenges(merged, challenges, warnings):
    by_id = {}
    for f in merged:
        for mid in f["merged_from"]:
            by_id[mid] = f
    for ch in challenges:
        target = by_id.get(ch["finding_id"])
        if not target:
            warnings.append(f"ערעור על מזהה לא קיים: {ch['finding_id']} (מאת {ch['by']})")
            continue
        target["challenges"].append(ch)
        v = ch["verdict"]
        if v == "supports":
            target["adjustments"].append(f"ערעור תומך מאת {ch['by']}")
        elif v == "weakens":
            if target["confidence"] > 1:
                target["confidence"] -= 1
            note = f"ביטחון -1: ערעור מחליש מאת {ch['by']}"
            if target["evidence_type"] == "fact":
                target["evidence_type"] = "hypothesis"
                note += "; עובדה הפכה להשערה"
            sug = ch.get("suggested_evidence_type")
            if sug in EVIDENCE and sug != target["evidence_type"]:
                target["evidence_type"] = sug
                note += f"; סוג הראיה הוחלף ל-{EVIDENCE_HE[sug]} לפי הערעור"
            target["adjustments"].append(note)
        elif v == "contradicts":
            target["status"] = "needs-resolution"
            target["status_note"] = f"סתירה (מאת {ch['by']}): {ch.get('argument', '')[:200]}"
            target["adjustments"].append(f"סומן להכרעה: ערעור סותר מאת {ch['by']}")
            other = by_id.get(ch.get("conflicts_with") or "")
            if other and other is not target:
                mirrored = dict(ch)
                mirrored["finding_id"] = other["id"]
                mirrored["conflicts_with"] = target["id"]
                mirrored["argument"] = f"(סתירה שסומנה על {target['id']}) {ch.get('argument', '')}"
                other["challenges"].append(mirrored)
                if other["status"] == "active":
                    other["status"] = "needs-resolution"
                    other["status_note"] = f"סתירה מול {target['id']}: {ch.get('argument', '')[:200]}"
                    other["adjustments"].append(f"סומן להכרעה: סותר את {target['id']} (ערעור מאת {ch['by']})")
        elif v == "reject":
            target["status"] = "rejected-pending"
            target["status_note"] = f"נדחה על ידי {ch['by']}: {ch.get('argument', '')[:200]}"
            target["adjustments"].append(f"הוצא זמנית: ערעור דוחה מאת {ch['by']}")
    return by_id


def downgrade_facts(merged):
    for f in merged:
        if f["evidence_type"] != "fact":
            continue
        reason = None
        if not f["source"] or GENERIC_SOURCE_RE.match(f["source"]) or len(f["source"]) < 4:
            reason = "אין מקור נקוב"
        elif f["confidence"] < 4:
            reason = f"ביטחון {f['confidence']} נמוך מ-4"
        if reason:
            f["evidence_type"] = "hypothesis"
            f["adjustments"].append(f"עובדה הפכה להשערה: {reason}")


def apply_resolutions(merged, by_id, resolutions, warnings):
    if not resolutions:
        return
    for rid, res in resolutions.items():
        if not isinstance(res, dict):
            warnings.append(f"הכרעה לא תקינה ל-{rid}")
            continue
        target = by_id.get(rid)
        if not target:
            warnings.append(f"הכרעה על מזהה לא קיים: {rid}")
            continue
        decision = res.get("decision")
        note = str(res.get("note") or "").strip()
        if not note:
            warnings.append(f"הכרעה ל-{rid} בלי note (נימוק). התקבלה, אבל הדוח יהיה חלש יותר.")
        if decision == "keep":
            if target["status"] in ("needs-resolution", "rejected-pending", "active"):
                target["status"] = "active"
            target["status_note"] = note
            target["adjustments"].append(f"הכרעה: נשמר. {note}".strip())
        elif decision == "drop":
            target["status"] = "dropped"
            target["status_note"] = note
            target["adjustments"].append(f"הכרעה: נדחה. {note}".strip())
        elif decision == "ab-test":
            target["status"] = "active"
            target["evidence_type"] = "ab-test"
            target["status_note"] = note
            target["adjustments"].append(f"הכרעה: לניסוי A/B. {note}".strip())
        elif decision == "split":
            # מפריד ממצא שאוחד אוטומטית בחזרה לממצא עצמאי
            member = next((m for m in target.get("members") or [] if m["id"] == rid), None)
            if not member or target["id"] == rid:
                warnings.append(f"split ל-{rid}: המזהה אינו חבר מאוחד בתוך ממצא אחר")
                continue
            target["members"] = [m for m in target["members"] if m["id"] != rid]
            target["merged_from"] = [x for x in target["merged_from"] if x != rid]
            target["merged_notes"] = [n for n in target.get("merged_notes") or [] if not n.startswith(rid + " ")]
            target["agents"] = []
            for m in [target] + target["members"]:
                if m["agent"] not in target["agents"]:
                    target["agents"].append(m["agent"])
            target["agreement"] = len(target["agents"])
            if target["agreement"] == 1 and any(a.startswith("ביטחון +1: הסכמה") for a in target["adjustments"]) and target["confidence"] > 1:
                target["confidence"] -= 1
                target["adjustments"].append("ביטחון -1: בונוס ההסכמה בוטל אחרי ההפרדה")
            target["adjustments"].append(f"הכרעה: {rid} הופרד לממצא עצמאי. {note}".strip())
            restored = build_merged([member], agreement_bonus=False)
            restored["adjustments"].append(f"הכרעה: הופרד מ-{target['id']}. {note}".strip())
            restored["status_note"] = note
            merged.append(restored)
            by_id[rid] = restored
            target = restored
        elif decision == "merge_into":
            dest = by_id.get(res.get("target") or "")
            if not dest or dest is target:
                warnings.append(f"merge_into ל-{rid}: יעד לא קיים ({res.get('target')})")
                continue
            for a in target["agents"]:
                if a not in dest["agents"]:
                    dest["agents"].append(a)
            dest["merged_from"] = list(OrderedDict.fromkeys(dest["merged_from"] + target["merged_from"]))
            dest["agreement"] = len(dest["agents"])
            dest.setdefault("merged_notes", []).append(f"{target['id']} ({target['agent']}): {target['title']}. המלצה: {target['recommendation']}")
            dest.setdefault("members", []).append({k: v for k, v in target.items() if k not in ("members", "merged_notes", "challenges", "adjustments", "agents", "merged_from", "agreement", "status", "status_note")})
            dest["members"].extend(target.get("members") or [])
            dest["adjustments"].append(f"אוחד לתוכו {target['id']} לפי הכרעה. {note}".strip())
            target["status"] = "merged"
            target["status_note"] = f"אוחד לתוך {dest['id']}. {note}".strip()
            for mid in target["merged_from"]:
                by_id[mid] = dest
        else:
            warnings.append(f"הכרעה ל-{rid} עם decision לא מוכר: {decision}")
            continue
        overrides = res.get("overrides") or {}
        for k, v in overrides.items():
            if k not in OVERRIDABLE:
                warnings.append(f"override לא מותר ב-{rid}: {k}")
                continue
            if k in ("impact", "confidence", "effort"):
                iv = to_int(v)
                if iv is None or iv < 1 or iv > 5:
                    warnings.append(f"override {k}={v} ב-{rid} מחוץ לטווח")
                    continue
                v = iv
            if k == "evidence_type" and v not in EVIDENCE:
                warnings.append(f"override evidence_type={v} ב-{rid} לא מוכר")
                continue
            if k == "device" and v not in DEVICES:
                warnings.append(f"override device={v} ב-{rid} לא מוכר")
                continue
            if k == "page_type" and v not in PAGE_TYPES:
                warnings.append(f"override page_type={v} ב-{rid} לא מוכר")
                continue
            old = target.get(k)
            if old == v:
                continue
            target[k] = v
            if k in ("recommendation", "title", "metric", "url"):
                target["adjustments"].append(f"הכרעה: {k} עודכן לפי ההכרעה")
            else:
                target["adjustments"].append(f"הכרעה: {k} שונה מ-{old} ל-{v}")


def score(f):
    ease = 6 - f["effort"]
    f["ease"] = ease
    f["priority"] = f["impact"] * f["confidence"] * ease
    if f["impact"] >= 4 and f["effort"] >= 4:
        f["tier"] = "פרויקט"
    elif f["priority"] >= 80:
        f["tier"] = "מיידי"
    elif f["priority"] >= 40:
        f["tier"] = "בקרוב"
    else:
        f["tier"] = "אחר כך"


def sort_key(f):
    return (PAGE_TYPES.index(f["page_type"]), -f["priority"], f["id"])


# ---------------------------------------------------------------------------
# פלט
# ---------------------------------------------------------------------------


def esc(s):
    return str(s or "").replace("|", "\\|").replace("\n", " ")


def write_findings_md(path, merged, site_note):
    active = sorted([f for f in merged if f["status"] == "active"], key=sort_key)
    pending = [f for f in merged if f["status"] in ("needs-resolution", "rejected-pending")]
    lines = [f"# ממצאים מאוחדים{site_note}", ""]
    lines.append(f"- פעילים: {len(active)} | דורשים הכרעה: {len(pending)} | נדחו: {sum(1 for f in merged if f['status'] == 'dropped')} | אוחדו: {sum(1 for f in merged if f['status'] == 'merged')}")
    lines.append("- עדיפות = השפעה × ביטחון × (6 − מאמץ). שכבות: מיידי ≥ 80, בקרוב 40 עד 79, פרויקט = השפעה ≥ 4 ומאמץ ≥ 4, אחר כך < 40.")
    lines.append("")
    lines.append("## לפי שכבה")
    lines.append("")
    for tier in TIERS:
        items = sorted([f for f in active if f["tier"] == tier], key=lambda f: -f["priority"])
        lines.append(f"### {tier} ({len(items)})")
        if not items:
            lines.append("אין.")
            lines.append("")
            continue
        lines.append("| מזהה | כותרת | עמוד | אזור | מכשיר | ראיה | השפעה | ביטחון | מאמץ | עדיפות | סוכנים |")
        lines.append("|---|---|---|---|---|---|---|---|---|---|---|")
        for f in items:
            lines.append(f"| {f['id']} | {esc(f['title'])} | {PAGE_TYPE_HE[f['page_type']]} | {esc(f['area'])} | {DEVICE_HE[f['device']]} | {EVIDENCE_HE[f['evidence_type']]} | {f['impact']} | {f['confidence']} | {f['effort']} | {f['priority']} | {esc(', '.join(f['agents']))} |")
        lines.append("")
    lines.append("## פירוט לפי אזור באתר")
    lines.append("")
    for pt in PAGE_TYPES:
        items = [f for f in active if f["page_type"] == pt]
        if not items:
            continue
        lines.append(f"### {PAGE_TYPE_HE[pt]} ({len(items)})")
        lines.append("")
        for f in items:
            lines.append(f"#### {f['id']}: {f['title']}")
            lines.append("")
            lines.append(f"- **עמוד**: {PAGE_TYPE_HE[f['page_type']]}{(' (' + f['url'] + ')') if f.get('url') else ''} | **אזור**: {f['area']} | **מכשיר**: {DEVICE_HE[f['device']]}")
            lines.append(f"- **דירוג**: השפעה {f['impact']}, ביטחון {f['confidence']}, מאמץ {f['effort']}, עדיפות {f['priority']}, שכבה {f['tier']} | **ראיה**: {EVIDENCE_HE[f['evidence_type']]}")
            lines.append(f"- **סוכנים**: {', '.join(f['agents'])} (מזהים: {', '.join(f['merged_from'])})")
            lines.append(f"- **תצפית**: {f['observation']}")
            lines.append(f"- **בעיה**: {f['problem']}")
            lines.append(f"- **המלצה**: {f['recommendation']}")
            lines.append(f"- **מקור**: {f['source'] or 'לא צוין'}")
            if f.get("metric"):
                lines.append(f"- **מדד**: {f['metric']}")
            if f.get("screenshot"):
                lines.append(f"- **צילום**: {f['screenshot']}")
            for mn in f.get("merged_notes") or []:
                lines.append(f"- **המלצה מאוחדת**: {mn}")
            for ch in f.get("challenges") or []:
                lines.append(f"- **ערעור ({VERDICT_HE[ch['verdict']]}, {ch['by']})**: {ch.get('argument', '')}" + (f" | סיכון: {ch['risk']}" if ch.get("risk") else "") + (f" | חלופה: {ch['alternative']}" if ch.get("alternative") else ""))
            for adj in f.get("adjustments") or []:
                lines.append(f"- *התאמה*: {adj}")
            if f.get("status_note"):
                lines.append(f"- *הערת סטטוס*: {f['status_note']}")
            lines.append("")
    if pending:
        lines.append("## ממתינים להכרעה (לא ברשימה הפעילה עד שיוכרעו)")
        lines.append("")
        for f in pending:
            lines.append(f"- **{f['id']}** ({STATUS_HE[f['status']]}): {f['title']}. {f['status_note']}")
        lines.append("")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")


def write_contradictions_md(path, merged, has_resolutions):
    open_items = [f for f in merged if f["status"] in ("needs-resolution", "rejected-pending")]
    resolved = [f for f in merged if any(a.startswith("הכרעה:") for a in f.get("adjustments") or [])]
    lines = ["# סתירות והכרעות", ""]
    lines.append("הסקריפט מסמן; המוביל מכריע. כל הכרעה נרשמת ב-`resolutions.json` עם `note` שמצביע על ראיה, ואז מריצים שוב. הכללים ב-`references/consolidation.md`.")
    lines.append("")
    lines.append(f"## פתוחות ({len(open_items)})")
    lines.append("")
    if not open_items:
        lines.append("אין סתירות פתוחות." if has_resolutions else "אין סתירות פתוחות (ה-Devil's Advocate לא סימן contradicts או reject).")
        lines.append("")
    for f in open_items:
        lines.append(f"### {f['id']}: {f['title']} ({STATUS_HE[f['status']]})")
        lines.append("")
        lines.append(f"- **עמוד / אזור / מכשיר**: {PAGE_TYPE_HE[f['page_type']]} / {f['area']} / {DEVICE_HE[f['device']]}")
        lines.append(f"- **המלצה**: {f['recommendation']}")
        lines.append(f"- **סטטוס**: {f['status_note']}")
        for ch in f.get("challenges") or []:
            if ch["verdict"] in ("contradicts", "reject"):
                lines.append(f"- **ערעור ({VERDICT_HE[ch['verdict']]}, {ch['by']})**: {ch.get('argument', '')}")
                if ch.get("conflicts_with"):
                    lines.append(f"  - סותר את: {ch['conflicts_with']}")
                if ch.get("risk"):
                    lines.append(f"  - סיכון: {ch['risk']}")
                if ch.get("alternative"):
                    lines.append(f"  - חלופה מוצעת: {ch['alternative']}")
        lines.append("")
        lines.append("```json")
        lines.append(f'"{f["id"]}": {{"decision": "keep | drop | ab-test | merge_into", "note": "[[ראיה ונימוק]]"}}')
        lines.append("```")
        lines.append("")
    lines.append(f"## הוכרעו ({len(resolved)})")
    lines.append("")
    if not resolved:
        lines.append("עדיין לא הוכרעו סתירות.")
    for f in resolved:
        decisions = [a for a in f.get("adjustments") or [] if a.startswith("הכרעה:")]
        lines.append(f"- **{f['id']}** ({STATUS_HE[f['status']]}): {f['title']}. " + " ".join(decisions))
    lines.append("")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")


def write_stats_md(path, agents, merged, warnings, all_findings, sequential_note):
    lines = ["# סטטיסטיקה ואזהרות", ""]
    if sequential_note:
        lines.append(f"> {sequential_note}")
        lines.append("")
    active = [f for f in merged if f["status"] == "active"]
    lines.append("## סוכנים")
    lines.append("")
    lines.append("| סוכן | קובץ | ממצאים | ערעורים | סוגי עמודים שכוסו | הערה |")
    lines.append("|---|---|---|---|---|---|")
    for a in agents:
        pts = Counter(f["page_type"] for f in a["findings"])
        note = ""
        if a["agent"] != "devils-advocate" and len(a["findings"]) < 5:
            note = "פחות מ-5 ממצאים: ייתכן שלא ראה את כל הנתונים"
        elif len(a["findings"]) > 35:
            note = "יותר מ-35 ממצאים: כנראה לא סינן"
        elif a["agent"] != "devils-advocate" and len(pts) == 1:
            note = "כל הממצאים בסוג עמוד אחד"
        lines.append(f"| {a['agent']} | {a['file']} | {len(a['findings'])} | {len(a['challenges'])} | {', '.join(f'{PAGE_TYPE_HE[k]} ({v})' for k, v in pts.most_common())} | {note} |")
    lines.append("")
    lines.append("## ממצאים")
    lines.append("")
    lines.append(f"- נאספו: {len(all_findings)} | אחרי איחוד: {len(merged)} | פעילים: {len(active)} | נדחו: {sum(1 for f in merged if f['status'] == 'dropped')} | ממתינים להכרעה: {sum(1 for f in merged if f['status'] in ('needs-resolution', 'rejected-pending'))}")
    agreements = [f for f in merged if f["agreement"] > 1]
    lines.append(f"- הסכמות (ממצא שכתבו לפחות שני סוכנים בנפרד): {len(agreements)}")
    for f in sorted(agreements, key=lambda x: -x["agreement"])[:15]:
        lines.append(f"  - {f['id']} ({f['agreement']} סוכנים: {', '.join(f['agents'])}): {f['title']}")
    lines.append("")
    for title, key, labels in (("לפי שכבה", "tier", {t: t for t in TIERS}), ("לפי סוג ראיה", "evidence_type", EVIDENCE_HE), ("לפי סוג עמוד", "page_type", PAGE_TYPE_HE), ("לפי מכשיר", "device", DEVICE_HE)):
        c = Counter(f[key] for f in active)
        lines.append(f"### {title}")
        lines.append("")
        for k, label in labels.items():
            if c.get(k):
                lines.append(f"- {label}: {c[k]}")
        lines.append("")
    downgrades = [(f["id"], a) for f in merged for a in f.get("adjustments") or [] if a.startswith("עובדה הפכה להשערה")]
    lines.append(f"## הורדות מעובדה להשערה ({len(downgrades)})")
    lines.append("")
    by_agent = Counter(next((m["agent"] for m in all_findings if m["id"] == fid), "?") for fid, _ in downgrades)
    for ag, n in by_agent.most_common():
        lines.append(f"- {ag}: {n}")
    for fid, a in downgrades:
        lines.append(f"  - {fid}: {a}")
    lines.append("")
    verdicts = Counter(ch["verdict"] for f in merged for ch in f.get("challenges") or [])
    total_ch = sum(verdicts.values())
    lines.append(f"## ערעורי ה-Devil's Advocate ({total_ch})")
    lines.append("")
    for v in VERDICTS:
        lines.append(f"- {VERDICT_HE[v]}: {verdicts.get(v, 0)}")
    if merged and total_ch:
        weak_ratio = verdicts.get("weakens", 0) / float(len(merged))
        if weak_ratio > 0.4:
            lines.append("- אזהרה: יותר מ-40% מהממצאים סומנו כמוחלשים. לקרוא את הערעורים בעין ביקורתית.")
        if verdicts.get("supports", 0) == 0:
            lines.append("- אזהרה: אף ממצא לא סומן כתומך. Devil's Advocate מאוזן מוצא גם חוזקות.")
    lines.append("")
    lines.append(f"## אזהרות תקינות ({len(warnings)})")
    lines.append("")
    for w in warnings:
        lines.append(f"- {w}")
    if not warnings:
        lines.append("אין.")
    lines.append("")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description="איחוד ממצאי הסוכנים ודירוגם.", formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
    parser.add_argument("agents_dir", help="תיקיית קובצי הסוכנים (למשל cro-audit/05-agents)")
    parser.add_argument("--out", default=None, help="תיקיית הפלט (ברירת מחדל: <agents_dir>/../06-merged)")
    parser.add_argument("--resolutions", default=None, help="קובץ הכרעות resolutions.json")
    parser.add_argument("--threshold", type=float, default=0.35, help="סף דמיון לאיחוד כפילויות, 0 עד 1 (ברירת מחדל: 0.35; נמוך יותר = יותר איחודים)")
    parser.add_argument("--no-agreement-bonus", action="store_true", help="לא להעלות ביטחון על הסכמה בין סוכנים (להרצה סדרתית)")
    parser.add_argument("--sequential", action="store_true", help="לציין ב-stats.md שהסוכנים רצו בזה אחר זה (ולבטל את בונוס ההסכמה)")
    parser.add_argument("--validate-only", action="store_true", help="רק לבדוק תקינות ולדווח, בלי לכתוב פלט")
    parser.add_argument("--site", default="", help="שם החנות לכותרות (אופציונלי)")
    args = parser.parse_args()

    if not os.path.isdir(args.agents_dir):
        log(f"התיקייה לא קיימת: {args.agents_dir}")
        return 1
    out = args.out or os.path.join(os.path.dirname(os.path.abspath(args.agents_dir.rstrip("/"))), "06-merged")
    warnings = []
    agents = load_agent_files(args.agents_dir, warnings)
    if not agents:
        log("לא נמצאו קובצי סוכנים תקינים.")
        for w in warnings:
            log(f"  - {w}")
        return 1

    all_findings = [f for a in agents for f in a["findings"]]
    all_challenges = [c for a in agents for c in a["challenges"]]
    ids = Counter(f["id"] for f in all_findings)
    for fid, n in ids.items():
        if n > 1:
            warnings.append(f"מזהה כפול בין קבצים: {fid} ({n} פעמים). המזהה חייב להיות ייחודי.")

    if args.validate_only:
        log(f"\nנבדקו {len(agents)} קבצים, {len(all_findings)} ממצאים תקינים, {len(all_challenges)} ערעורים.")
        log(f"אזהרות: {len(warnings)}")
        for w in warnings:
            log(f"  - {w}")
        return 0

    agreement_bonus = not (args.no_agreement_bonus or args.sequential)
    merged = dedupe(all_findings, args.threshold, agreement_bonus)
    by_id = apply_challenges(merged, all_challenges, warnings)
    downgrade_facts(merged)

    resolutions = None
    if args.resolutions:
        try:
            with open(args.resolutions, "r", encoding="utf-8") as fh:
                resolutions = json.load(fh)
        except (OSError, json.JSONDecodeError) as e:
            warnings.append(f"קובץ ההכרעות לא נקרא ({e}); ממשיכים בלעדיו")
    apply_resolutions(merged, by_id, resolutions, warnings)

    for f in merged:
        score(f)
    merged.sort(key=sort_key)

    os.makedirs(out, exist_ok=True)
    data = {
        "generated_at": datetime.now().isoformat(),
        "site": args.site,
        "source_files": [a["file"] for a in agents],
        "sequential_run": bool(args.sequential),
        "agreement_bonus": agreement_bonus,
        "threshold": args.threshold,
        "resolutions_applied": bool(resolutions),
        "agent_summaries": {a["agent"]: a["summary"] for a in agents},
        "pages_reviewed": {a["agent"]: a["pages_reviewed"] for a in agents},
        "blind_spots": [b for a in agents for b in a["blind_spots"]],
        "findings": merged,
        "stats": {
            "collected": len(all_findings),
            "merged": len(merged),
            "active": sum(1 for f in merged if f["status"] == "active"),
            "dropped": sum(1 for f in merged if f["status"] == "dropped"),
            "pending": sum(1 for f in merged if f["status"] in ("needs-resolution", "rejected-pending")),
            "by_tier": dict(Counter(f["tier"] for f in merged if f["status"] == "active")),
            "by_evidence": dict(Counter(f["evidence_type"] for f in merged if f["status"] == "active")),
            "by_page_type": dict(Counter(f["page_type"] for f in merged if f["status"] == "active")),
            "challenges": dict(Counter(c["verdict"] for c in all_challenges)),
        },
        "warnings": warnings,
    }
    with open(os.path.join(out, "findings.json"), "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
    site_note = f": {args.site}" if args.site else ""
    write_findings_md(os.path.join(out, "findings.md"), merged, site_note)
    write_contradictions_md(os.path.join(out, "contradictions.md"), merged, bool(resolutions))
    seq_note = "ההרצה הייתה סדרתית (הסוכנים רצו בזה אחר זה באותו הקשר), ולכן בונוס ההסכמה בוטל ואי-התלות בין הסוכנים חלקית." if args.sequential else ""
    write_stats_md(os.path.join(out, "stats.md"), agents, merged, warnings, all_findings, seq_note)

    s = data["stats"]
    log(f"\nנאספו {s['collected']} ממצאים → {s['merged']} אחרי איחוד → {s['active']} פעילים, {s['pending']} ממתינים להכרעה, {s['dropped']} נדחו.")
    log(f"שכבות: " + ", ".join(f"{k} {v}" for k, v in s["by_tier"].items()))
    if warnings:
        log(f"אזהרות: {len(warnings)} (פירוט ב-stats.md)")
    log(f"נכתבו לתיקייה {out}: findings.json, findings.md, contradictions.md, stats.md")
    if s["pending"]:
        log(f"יש {s['pending']} ממצאים שדורשים הכרעה. ראה contradictions.md, כתוב resolutions.json והרץ שוב עם --resolutions.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
