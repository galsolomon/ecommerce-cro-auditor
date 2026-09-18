#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
crawl_site.py: סריקת חנות אונליין לצורך ביקורת CRO (שלב 0 של ecommerce-cro-auditor).

מה הסקריפט עושה:
  1. מגלה עמודים (robots.txt, sitemap.xml, וזחילה מדף הבית) ומסווג אותם לפי סוג:
     home, category, product, cart, checkout, search, account, content, policy, other.
  2. בוחר דגימה מאוזנת של עמודים (ברירת מחדל: עד 25), ומנסה למצוא עגלה, חיפוש,
     חשבון ועמודי מדיניות גם אם הם לא ב-sitemap.
  3. לכל עמוד, במובייל (390×844) ובדסקטופ (1440×900): צילום מסך של החלק העליון
     (fold) ושל העמוד המלא (full), ואיסוף אותות טכניים: כותרות, alt, טפסים, כפתורים,
     אזורי לחיצה קטנים, גלילה אופקית, LCP, CLS, משקל, שגיאות JavaScript ועוד.
  4. כותב pages.json (הנתונים לסוכנים), summary.md (סיכום בעברית) ותיקיית screenshots/.

דוגמאות:
  python crawl_site.py https://shop.example.co.il --out cro-audit/02-crawl
  python crawl_site.py https://shop.example.co.il --out cro-audit/02-crawl --max-pages 40 --try-checkout
  python crawl_site.py https://shop.example.co.il --out cro-audit/02-crawl --urls "https://shop.example.co.il/products/x,https://shop.example.co.il/cart"
  python crawl_site.py https://shop.example.co.il --out cro-audit/02-crawl --no-browser

דרישות: Python 3.8 ומעלה. לצילומי מסך ולמדדי פריסה נדרש Playwright:
  pip install playwright && playwright install chromium
בלי Playwright אפשר להריץ עם --no-browser: נאספים רק האותות שאפשר לחלץ מה-HTML, בלי צילומים.
"""
import argparse
import gzip
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import OrderedDict
from datetime import datetime
from html.parser import HTMLParser

# ---------------------------------------------------------------------------
# הגדרות
# ---------------------------------------------------------------------------

USER_AGENT_DESKTOP = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 ecommerce-cro-auditor/1.0"
)
USER_AGENT_MOBILE = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 ecommerce-cro-auditor/1.0"
)

DEVICES = OrderedDict(
    [
        (
            "mobile",
            dict(width=390, height=844, scale=2, user_agent=USER_AGENT_MOBILE, is_mobile=True, has_touch=True),
        ),
        (
            "desktop",
            dict(width=1440, height=900, scale=1, user_agent=USER_AGENT_DESKTOP, is_mobile=False, has_touch=False),
        ),
    ]
)

# סדר הבדיקה חשוב: עגלה וצ'קאאוט לפני מוצר, חיפוש לפני קטגוריה.
TYPE_PATTERNS = [
    ("checkout", r"/checkouts?(\.\w+)?(/|$|\?)|/checkout\b|/order(s)?/|/payment|/pay(\.\w+)?(/|$)|תשלום|קופה"),
    ("cart", r"/cart(\.\w+)?(/|$|\?)|/basket|/bag(\.\w+)?(/|$)|עגלה|סל-קניות|סל\b"),
    ("search", r"/search|[?&](q|s|query|search|term)=|חיפוש"),
    ("account", r"/account|/login|/register|/signin|/sign-in|/signup|/customer|/my-account|/user|חשבון|התחבר|הרשמה"),
    ("product", r"/products?/|/product-|/p/|/item/|/items/|/dp/|/prod/|מוצר"),
    ("category", r"/collections?/|/category|/categories|/product-category/|/c/|/catalog|/shop(/|$)|/store(/|$)|קטגור|מחלק"),
    ("policy", r"/polic|/terms|/privacy|/shipping|/delivery|/returns?|/refund|/accessib|/legal|תקנון|פרטיות|משלוח|החזר|נגישות|תנאי"),
    ("content", r"/blog|/pages?/|/about|/contact|/faq|/article|/news|/help|/support|אודות|צור-קשר|שאלות|בלוג|עלינו"),
]

DEFAULT_CAPS = OrderedDict(
    [
        ("home", 1),
        ("product", 6),
        ("category", 5),
        ("cart", 1),
        ("checkout", 1),
        ("search", 1),
        ("account", 1),
        ("policy", 4),
        ("content", 3),
        ("other", 2),
    ]
)

PROBES = {
    "cart": ["/cart", "/cart/", "/basket", "/bag", "/checkout/cart"],
    "account": ["/account/login", "/account", "/my-account", "/login", "/customer/account/login"],
    "policy": [
        "/policies/shipping-policy",
        "/policies/refund-policy",
        "/policies/terms-of-service",
        "/pages/shipping",
        "/shipping",
        "/returns",
        "/pages/returns",
        "/pages/accessibility",
        "/accessibility",
    ],
    "content": ["/pages/about", "/about", "/about-us", "/pages/about-us", "/pages/contact", "/contact", "/pages/faq", "/faq"],
}

SKIP_EXTENSIONS = (
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".pdf", ".zip", ".mp4", ".mp3",
    ".css", ".js", ".json", ".xml", ".ico", ".woff", ".woff2", ".ttf", ".avif",
)

TYPE_HE = {
    "home": "דף הבית",
    "category": "קטגוריה",
    "product": "מוצר",
    "cart": "עגלה",
    "checkout": "צ'קאאוט",
    "search": "חיפוש",
    "account": "חשבון",
    "content": "תוכן",
    "policy": "מדיניות",
    "other": "אחר",
}

# ביטויים לזיהוי כפתורים (משמשים גם ב-JS וגם ב-Python; לשמור מסונכרן)
ADD_TO_CART_RE = r"add to (cart|bag|basket)|buy now|הוסף לסל|הוספה לסל|הוסף לעגלה|הוספה לעגלה|הוסיפו לסל|הוסיפו לעגלה|קנה עכשיו|קני עכשיו|קנו עכשיו|לרכישה|רכישה מהירה"
CHECKOUT_RE = r"check ?out|proceed to|לתשלום|המשך לתשלום|מעבר לתשלום|לקופה|המשך לקופה|סיום הזמנה|לסיום ההזמנה|המשך לרכישה|לסיום הרכישה"

MENTION_PATTERNS = {
    "shipping": r"משלוח|shipping|delivery|אספקה",
    "returns": r"החזר|ביטול עסקה|return|refund",
    "reviews": r"ביקורת|ביקורות|חוות דעת|דירוג|review|rating",
    "secure": r"מאובטח|אבטח|secure|ssl|pci",
    "cookie_banner": r"cookie|עוגיות",
    "installments": r"תשלומים|installment|תשלום אחד",
    "contact": r"צור קשר|צרו קשר|contact|whatsapp|וואטסאפ|טלפון",
    "guarantee": r"אחריות|guarantee|warranty",
}
PRICE_RE = r"[₪$€£]\s?\d|\d\s?[₪$€£]|\bILS\b|ש\"ח|ש״ח"

# ---------------------------------------------------------------------------
# JavaScript שרץ בדפדפן
# ---------------------------------------------------------------------------

METRICS_INIT_JS = """
(() => {
  window.__cro = { lcp: 0, cls: 0 };
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) { window.__cro.lcp = e.startTime; }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (e) {}
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) { if (!e.hadRecentInput) window.__cro.cls += e.value; }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch (e) {}
})();
"""

METRICS_READ_JS = """
() => {
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const res = performance.getEntriesByType('resource') || [];
  let transfer = nav.transferSize || 0;
  for (const r of res) transfer += (r.transferSize || 0);
  return {
    lcp_ms: Math.round((window.__cro && window.__cro.lcp) || 0),
    cls: Math.round(((window.__cro && window.__cro.cls) || 0) * 1000) / 1000,
    ttfb_ms: Math.round(nav.responseStart || 0),
    dom_content_loaded_ms: Math.round(nav.domContentLoadedEventEnd || 0),
    load_ms: Math.round(nav.loadEventEnd || 0),
    transfer_kb_timing: Math.round(transfer / 1024),
    resources: res.length
  };
}
"""

SIGNALS_JS = r"""
(patterns) => {
  const q = (s) => Array.from(document.querySelectorAll(s));
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const st = getComputedStyle(el);
    return st.visibility !== 'hidden' && st.display !== 'none' && st.opacity !== '0';
  };
  const textOf = (el) => ((el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 80));
  const imgs = q('img');
  const buttonEls = q('button, a[role=button], input[type=submit], input[type=button], a.btn, a.button, [class*="btn"], [class*="button"]').filter(vis);
  const buttons = [];
  const seen = new Set();
  for (const b of buttonEls) { const t = textOf(b); if (t && !seen.has(t)) { seen.add(t); buttons.push(t); } if (buttons.length >= 60) break; }
  const targets = q('a[href], button, input:not([type=hidden]), select, textarea, [role=button]').filter(vis);
  const small = targets.filter((el) => { const r = el.getBoundingClientRect(); return r.width < 44 || r.height < 44; });
  const leafText = q('p, span, a, li, label, td, th, div, small, em, strong').filter((el) => el.childElementCount === 0 && (el.textContent || '').trim().length > 0).filter(vis);
  const smallText = leafText.filter((el) => { const fs = parseFloat(getComputedStyle(el).fontSize); return fs && fs < 12; });
  const inputs = q('input:not([type=hidden]), select, textarea').filter(vis);
  const inputsSmall = inputs.filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16);
  const inputsNoLabel = inputs.filter((el) => {
    if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return false;
    if (el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]')) return false;
    if (el.closest('label')) return false;
    return true;
  });
  let fixedCount = 0;
  const all = q('body *');
  const limit = Math.min(all.length, 6000);
  for (let i = 0; i < limit; i++) { const p = getComputedStyle(all[i]).position; if ((p === 'fixed' || p === 'sticky') && vis(all[i])) fixedCount++; }
  const bodyText = (document.body && document.body.innerText) || '';
  // תוכן ראשי: בלי כותרת, ניווט ופוטר, כדי שקישור "משלוחים" בפוטר לא ייחשב כאזכור משלוח בעמוד המוצר
  let mainText = bodyText;
  try {
    const src = document.querySelector('main, [role=main]') || document.body;
    const clone = src.cloneNode(true);
    clone.querySelectorAll('header, nav, footer, [role=banner], [role=navigation], [role=contentinfo], script, style, noscript').forEach((e) => e.remove());
    mainText = (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ');
  } catch (e) {}
  const heb = (bodyText.match(/[֐-׿]/g) || []).length;
  const lat = (bodyText.match(/[A-Za-z]/g) || []).length;
  const mentions = {};
  const mentionsAnywhere = {};
  for (const k of Object.keys(patterns.mentions)) {
    const re = new RegExp(patterns.mentions[k], 'i');
    mentions[k] = re.test(mainText);
    mentionsAnywhere[k] = re.test(bodyText);
  }
  const addRe = new RegExp(patterns.add_to_cart, 'i');
  const coRe = new RegExp(patterns.checkout, 'i');
  const metaC = (sel) => { const m = document.querySelector(sel); return m ? (m.getAttribute('content') || m.getAttribute('href') || null) : null; };
  // הכפתור הראשי: הוספה לעגלה (או מעבר לתשלום בעגלה). איפה הוא, כמה גדול, והאם דביק
  const describeCta = (re) => {
    const el = buttonEls.find((b) => re.test(textOf(b)));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    let sticky = false;
    let node = el;
    while (node && node !== document.body) { const p = getComputedStyle(node).position; if (p === 'fixed' || p === 'sticky') { sticky = true; break; } node = node.parentElement; }
    return { text: textOf(el), top: Math.round(r.top + window.scrollY), width: Math.round(r.width), height: Math.round(r.height), in_fold: (r.top + window.scrollY) < window.innerHeight && r.top >= 0, sticky: sticky, meets_44px: r.width >= 44 && r.height >= 44 };
  };
  const cta = describeCta(addRe) || describeCta(coRe);
  return {
    title: document.title || null,
    lang: document.documentElement.getAttribute('lang') || null,
    dir: document.documentElement.getAttribute('dir') || getComputedStyle(document.documentElement).direction || null,
    meta_description: metaC('meta[name="description"]'),
    viewport_meta: metaC('meta[name="viewport"]'),
    canonical: metaC('link[rel="canonical"]'),
    h1: q('h1').map(textOf).filter(Boolean).slice(0, 5),
    h1_count: q('h1').length,
    images_total: imgs.length,
    images_without_alt: imgs.filter((i) => !i.getAttribute('alt') || !i.getAttribute('alt').trim()).length,
    images_lazy: imgs.filter((i) => (i.getAttribute('loading') || '').toLowerCase() === 'lazy').length,
    images_without_dimensions: imgs.filter((i) => !i.getAttribute('width') || !i.getAttribute('height')).length,
    links_total: q('a[href]').length,
    forms: q('form').length,
    inputs: inputs.length,
    inputs_font_below_16: inputsSmall.length,
    inputs_without_label: inputsNoLabel.length,
    buttons: buttons,
    has_add_to_cart_button: buttons.some((t) => addRe.test(t)),
    has_checkout_button: buttons.some((t) => coRe.test(t)),
    small_tap_targets: small.length,
    tap_targets_total: targets.length,
    small_text_elements: smallText.length,
    horizontal_overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    page_height: document.documentElement.scrollHeight,
    dom_nodes: document.getElementsByTagName('*').length,
    sticky_or_fixed: fixedCount,
    has_price: new RegExp(patterns.price).test(mainText),
    mentions: mentions,
    mentions_anywhere: mentionsAnywhere,
    cta: cta,
    text_length: bodyText.length,
    hebrew_ratio: (heb + lat) ? Math.round(heb / (heb + lat) * 100) / 100 : null,
    iframes: q('iframe').length,
    scripts: q('script[src]').length,
    third_party_scripts: q('script[src]').filter((s) => { try { return new URL(s.src, location.href).host !== location.host; } catch (e) { return false; } }).length,
    landmarks: { header: !!document.querySelector('header, [role=banner]'), nav: !!document.querySelector('nav, [role=navigation]'), main: !!document.querySelector('main, [role=main]'), footer: !!document.querySelector('footer, [role=contentinfo]') },
    skip_link: !!q('a[href^="#"]').find((a) => /skip|דלג/i.test(a.textContent || '')),
    user_scalable_no: /user-scalable\s*=\s*(no|0)/i.test(metaC('meta[name="viewport"]') || '')
  };
}
"""

CLICK_BY_TEXT_JS = r"""
(pattern) => {
  const re = new RegExp(pattern, 'i');
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const els = Array.from(document.querySelectorAll('button, a, input[type=submit], input[type=button], [role=button]')).filter(vis);
  for (const el of els) {
    const t = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim();
    if (re.test(t)) { el.scrollIntoView({block: 'center'}); el.click(); return t.slice(0, 80); }
  }
  return null;
}
"""

# ---------------------------------------------------------------------------
# עזרים כלליים
# ---------------------------------------------------------------------------


def log(msg):
    print(msg, flush=True)


class _SkipFlow(Exception):
    """יציאה מסודרת מזרימת הצ'קאאוט כשאין טעם להמשיך (למשל העגלה החזירה 404)."""


def normalize_url(url, base=None):
    if base:
        url = urllib.parse.urljoin(base, url)
    parts = urllib.parse.urlsplit(url.strip())
    if parts.scheme not in ("http", "https"):
        return None
    path = parts.path or "/"
    # מסירים fragment; שומרים query רק אם זה נראה כמו חיפוש או עימוד
    query = parts.query
    keep = []
    for k, v in urllib.parse.parse_qsl(query, keep_blank_values=True):
        if k.lower() in ("q", "s", "query", "search", "term", "page", "sort", "sort_by"):
            keep.append((k, v))
    query = urllib.parse.urlencode(keep)
    return urllib.parse.urlunsplit((parts.scheme, parts.netloc.lower(), path, query, ""))


def same_site(url, base):
    a = urllib.parse.urlsplit(url).netloc.lower()
    b = urllib.parse.urlsplit(base).netloc.lower()
    strip = lambda h: h[4:] if h.startswith("www.") else h
    return strip(a) == strip(b)


def classify(url):
    parts = urllib.parse.urlsplit(url)
    path = urllib.parse.unquote(parts.path or "/")
    if path in ("", "/") and not parts.query:
        return "home"
    haystack = path + ("?" + urllib.parse.unquote(parts.query) if parts.query else "")
    for name, pattern in TYPE_PATTERNS:
        if re.search(pattern, haystack, re.I):
            return name
    return "other"


def slugify(url, page_type):
    parts = urllib.parse.urlsplit(url)
    path = urllib.parse.unquote(parts.path or "").strip("/")
    if page_type == "home":
        return "home"
    path = re.sub(r"\.(html?|php|aspx?|jsp)$", "", path, flags=re.I)
    base = re.sub(r"[^A-Za-z0-9]+", "-", path).strip("-").lower()
    if parts.query:
        base = (base + "-q") if base else "q"
    base = base[:60].strip("-")
    if not base:
        return page_type
    if not base.startswith(page_type):
        base = f"{page_type}-{base}"
    return base


def fetch(url, timeout=20, ua=USER_AGENT_DESKTOP):
    """מחזיר (status, final_url, text, content_type). בשגיאה: (None, url, '', '')."""
    req = urllib.request.Request(url, headers={"User-Agent": ua, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Encoding": "gzip", "Accept-Language": "he-IL,he;q=0.9,en;q=0.8"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            if resp.headers.get("Content-Encoding", "") == "gzip":
                try:
                    raw = gzip.decompress(raw)
                except OSError:
                    pass
            ctype = resp.headers.get("Content-Type", "")
            charset = "utf-8"
            m = re.search(r"charset=([\w-]+)", ctype)
            if m:
                charset = m.group(1)
            try:
                text = raw.decode(charset, errors="replace")
            except LookupError:
                text = raw.decode("utf-8", errors="replace")
            return resp.status, resp.geturl(), text, ctype
    except urllib.error.HTTPError as e:
        return e.code, url, "", ""
    except Exception:
        return None, url, "", ""


# ---------------------------------------------------------------------------
# ניתוח HTML בלי דפדפן
# ---------------------------------------------------------------------------


class HTMLSignals(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = ""
        self._in_title = False
        self.meta_description = None
        self.viewport = None
        self.lang = None
        self.dir = None
        self.canonical = None
        self.h1 = []
        self._in_h1 = False
        self._h1_buf = []
        self.images_total = 0
        self.images_without_alt = 0
        self.images_lazy = 0
        self.images_without_dimensions = 0
        self.links = 0
        self.forms = 0
        self.inputs = 0
        self.scripts = 0
        self.iframes = 0
        self.buttons = []
        self._in_button = False
        self._btn_buf = []
        self._skip = 0
        self._chrome = 0  # עומק בתוך header / nav / footer
        self.text = []
        self.main_text = []
        self.hrefs = []
        self.raw_len = 0

    def handle_starttag(self, tag, attrs):
        a = {k: (v or "") for k, v in attrs}
        if tag in ("header", "nav", "footer") or a.get("role") in ("banner", "navigation", "contentinfo"):
            self._chrome += 1
        if tag == "html":
            self.lang = a.get("lang") or None
            self.dir = a.get("dir") or None
        elif tag == "title":
            self._in_title = True
        elif tag == "meta":
            n = (a.get("name") or a.get("property") or "").lower()
            if n == "description":
                self.meta_description = a.get("content")
            elif n == "viewport":
                self.viewport = a.get("content")
        elif tag == "link" and "canonical" in (a.get("rel") or "").lower():
            self.canonical = a.get("href")
        elif tag == "h1":
            self._in_h1 = True
            self._h1_buf = []
        elif tag == "img":
            self.images_total += 1
            if not a.get("alt", "").strip():
                self.images_without_alt += 1
            if a.get("loading", "").lower() == "lazy":
                self.images_lazy += 1
            if not a.get("width") or not a.get("height"):
                self.images_without_dimensions += 1
        elif tag == "a":
            self.links += 1
            if a.get("href"):
                self.hrefs.append(a["href"])
            cls = a.get("class", "").lower()
            if "btn" in cls or "button" in cls or a.get("role") == "button":
                self._in_button = True
                self._btn_buf = []
        elif tag == "form":
            self.forms += 1
        elif tag == "input":
            t = a.get("type", "text").lower()
            if t != "hidden":
                self.inputs += 1
            if t in ("submit", "button") and a.get("value"):
                self.buttons.append(a["value"].strip()[:80])
        elif tag in ("select", "textarea"):
            self.inputs += 1
        elif tag == "button":
            self._in_button = True
            self._btn_buf = []
        elif tag == "script":
            self._skip += 1
            if a.get("src"):
                self.scripts += 1
        elif tag == "style":
            self._skip += 1
        elif tag == "iframe":
            self.iframes += 1

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        elif tag == "h1" and self._in_h1:
            self._in_h1 = False
            t = " ".join("".join(self._h1_buf).split())[:80]
            if t:
                self.h1.append(t)
        elif tag in ("button", "a") and self._in_button:
            self._in_button = False
            t = " ".join("".join(self._btn_buf).split())[:80]
            if t and t not in self.buttons:
                self.buttons.append(t)
        elif tag in ("script", "style"):
            self._skip = max(0, self._skip - 1)
        if tag in ("header", "nav", "footer"):
            self._chrome = max(0, self._chrome - 1)

    def handle_data(self, data):
        if self._skip:
            return
        if self._in_title:
            self.title += data
        if self._in_h1:
            self._h1_buf.append(data)
        if self._in_button:
            self._btn_buf.append(data)
        self.text.append(data)
        if not self._chrome:
            self.main_text.append(data)


def parse_html(text):
    p = HTMLSignals()
    try:
        p.feed(text)
    except Exception:
        pass
    return p


def static_signals(parser):
    body = " ".join("".join(parser.text).split())
    main = " ".join("".join(parser.main_text).split()) or body
    heb = len(re.findall(r"[֐-׿]", body))
    lat = len(re.findall(r"[A-Za-z]", body))
    mentions = {k: bool(re.search(v, main, re.I)) for k, v in MENTION_PATTERNS.items()}
    mentions_anywhere = {k: bool(re.search(v, body, re.I)) for k, v in MENTION_PATTERNS.items()}
    buttons = parser.buttons[:60]
    return {
        "title": " ".join(parser.title.split()) or None,
        "lang": parser.lang,
        "dir": parser.dir,
        "meta_description": parser.meta_description,
        "viewport_meta": parser.viewport,
        "canonical": parser.canonical,
        "h1": parser.h1[:5],
        "h1_count": len(parser.h1),
        "images_total": parser.images_total,
        "images_without_alt": parser.images_without_alt,
        "images_lazy": parser.images_lazy,
        "images_without_dimensions": parser.images_without_dimensions,
        "links_total": parser.links,
        "forms": parser.forms,
        "inputs": parser.inputs,
        "inputs_font_below_16": None,
        "inputs_without_label": None,
        "buttons": buttons,
        "has_add_to_cart_button": any(re.search(ADD_TO_CART_RE, b, re.I) for b in buttons),
        "has_checkout_button": any(re.search(CHECKOUT_RE, b, re.I) for b in buttons),
        "small_tap_targets": None,
        "tap_targets_total": None,
        "small_text_elements": None,
        "horizontal_overflow": None,
        "page_height": None,
        "dom_nodes": None,
        "sticky_or_fixed": None,
        "has_price": bool(re.search(PRICE_RE, main)),
        "mentions": mentions,
        "mentions_anywhere": mentions_anywhere,
        "cta": None,
        "text_length": len(body),
        "hebrew_ratio": round(heb / (heb + lat), 2) if (heb + lat) else None,
        "iframes": parser.iframes,
        "scripts": parser.scripts,
        "third_party_scripts": None,
        "landmarks": None,
        "skip_link": None,
        "user_scalable_no": bool(re.search(r"user-scalable\s*=\s*(no|0)", parser.viewport or "", re.I)),
    }


def detect_platform(html_text):
    t = html_text.lower()
    checks = [
        ("Shopify", ["cdn.shopify.com", "shopify-section", "shopify.theme", "x-shopify"]),
        ("WooCommerce", ["woocommerce", "wp-content/plugins/woocommerce"]),
        ("Magento", ["magento", "mage/cookies", "static/version"]),
        ("Wix", ["wix.com", "wixstatic", "_wix"]),
        ("Squarespace", ["squarespace"]),
        ("BigCommerce", ["bigcommerce"]),
        ("PrestaShop", ["prestashop"]),
        ("Konimbo", ["konimbo"]),
        ("Salesforce Commerce", ["demandware"]),
        ("Shopline", ["shopline"]),
        ("WordPress", ["wp-content", "wp-includes"]),
    ]
    for name, needles in checks:
        if any(n in t for n in needles):
            return name
    return "לא זוהה"


# ---------------------------------------------------------------------------
# גילוי עמודים
# ---------------------------------------------------------------------------


def discover_sitemaps(base, timeout):
    found = []
    status, _, robots, _ = fetch(urllib.parse.urljoin(base, "/robots.txt"), timeout)
    if status == 200 and robots:
        for line in robots.splitlines():
            if line.lower().startswith("sitemap:"):
                found.append(line.split(":", 1)[1].strip())
    for cand in ("/sitemap.xml", "/sitemap_index.xml", "/sitemap-index.xml", "/wp-sitemap.xml"):
        found.append(urllib.parse.urljoin(base, cand))
    seen = set()
    ordered = []
    for u in found:
        if u not in seen:
            seen.add(u)
            ordered.append(u)
    return ordered


def parse_sitemap(base, sitemap_urls, timeout, limit=3000, max_depth=2):
    urls = []
    seen_maps = set()
    queue = [(u, 0) for u in sitemap_urls]
    while queue and len(urls) < limit:
        u, depth = queue.pop(0)
        if u in seen_maps:
            continue
        seen_maps.add(u)
        status, _, text, ctype = fetch(u, timeout)
        if status != 200 or not text:
            continue
        locs = re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", text)
        is_index = "<sitemapindex" in text
        for loc in locs:
            loc = loc.strip()
            if is_index or loc.endswith(".xml") or "sitemap" in loc.lower().split("/")[-1]:
                if depth < max_depth:
                    queue.append((loc, depth + 1))
            else:
                n = normalize_url(loc)
                if n and same_site(n, base):
                    urls.append(n)
            if len(urls) >= limit:
                break
    return urls


def crawl_links(base, timeout, delay, max_discovered=300, max_fetch=40):
    """זחילה קלה מדף הבית: אוספת קישורים פנימיים כדי להשלים מה שחסר ב-sitemap."""
    start = normalize_url(base)
    seen = {start}
    queue = [start]
    discovered = []
    fetched = 0
    home_html = ""
    while queue and fetched < max_fetch and len(discovered) < max_discovered:
        u = queue.pop(0)
        status, final, text, ctype = fetch(u, timeout)
        fetched += 1
        time.sleep(delay)
        if status != 200 or "html" not in (ctype or "").lower():
            continue
        if not home_html:
            home_html = text
        parser = parse_html(text)
        for href in parser.hrefs:
            n = normalize_url(href, base=final)
            if not n or not same_site(n, base) or n in seen:
                continue
            if n.lower().endswith(SKIP_EXTENSIONS):
                continue
            seen.add(n)
            discovered.append(n)
            # ממשיכים לזחול רק דרך עמודי ניווט (קטגוריות ודף הבית), כדי לא לבזבז זמן על אלפי מוצרים
            if classify(n) in ("category", "home", "content") and len(queue) < 60:
                queue.append(n)
    return discovered, home_html


def spread(items, n):
    """בוחר n פריטים מפוזרים לאורך הרשימה (התחלה, אמצע, סוף), כדי לגוון."""
    if n <= 0 or not items:
        return []
    if len(items) <= n:
        return list(items)
    step = len(items) / float(n)
    return [items[int(i * step)] for i in range(n)]


def select_pages(by_type, max_pages, only_types=None):
    caps = OrderedDict(DEFAULT_CAPS)
    if only_types:
        for t in list(caps):
            if t not in only_types:
                caps[t] = 0
    selected = []
    for t, cap in caps.items():
        selected += [(u, t) for u in spread(by_type.get(t, []), cap)]
    # מילוי עד המכסה מסוגים עשירים
    if len(selected) < max_pages:
        chosen = {u for u, _ in selected}
        for t in ("product", "category", "content", "other", "policy"):
            if only_types and t not in only_types:
                continue
            for u in by_type.get(t, []):
                if len(selected) >= max_pages:
                    break
                if u not in chosen:
                    selected.append((u, t))
                    chosen.add(u)
    # קיצוץ אם עברנו: מורידים מהסוף לפי סדר חשיבות הפוך
    if len(selected) > max_pages:
        priority = {t: i for i, t in enumerate(caps)}
        selected.sort(key=lambda x: priority.get(x[1], 99))
        selected = selected[:max_pages]
    return selected


def probe_missing(base, by_type, timeout, delay):
    added = []
    for t, paths in PROBES.items():
        if by_type.get(t):
            continue
        for p in paths:
            u = normalize_url(urllib.parse.urljoin(base, p))
            status, final, text, ctype = fetch(u, timeout)
            time.sleep(delay)
            if status == 200 and "html" in (ctype or "").lower() and text:
                n = normalize_url(final) or u
                by_type.setdefault(t, []).append(n)
                added.append((n, t))
                if t != "policy":
                    break
                if len(by_type[t]) >= 3:
                    break
    return added


def search_probe(base, by_type, timeout):
    if by_type.get("search"):
        return None
    term = "sale"
    products = by_type.get("product", [])
    if products:
        last = urllib.parse.unquote(urllib.parse.urlsplit(products[0]).path.rstrip("/").split("/")[-1])
        m = re.search(r"[A-Za-z֐-׿]{3,}", last)
        if m:
            term = m.group(0)
    for p in ("/search?q=", "/search?type=product&q=", "/?s=", "/catalogsearch/result/?q="):
        u = urllib.parse.urljoin(base, p + urllib.parse.quote(term))
        status, final, text, ctype = fetch(u, timeout)
        if status == 200 and "html" in (ctype or "").lower():
            n = normalize_url(final) or normalize_url(u)
            by_type.setdefault("search", []).append(n)
            return n
    return None


# ---------------------------------------------------------------------------
# דגלים אוטומטיים
# ---------------------------------------------------------------------------


def compute_flags(entry):
    flags = []
    m = entry.get("mobile") or {}
    d = entry.get("desktop") or {}
    s_any = (m.get("signals") or d.get("signals") or (entry.get("static") or {}).get("signals") or {})
    sm = m.get("signals") or {}
    mm = m.get("metrics") or {}
    ptype = entry.get("type")

    for dev_name, dev_result in (("מובייל", m), ("דסקטופ", d)):
        st = dev_result.get("status") if dev_result else None
        if st and st >= 400:
            flags.append(f"העמוד החזיר HTTP {st} ב{dev_name}")
        elif dev_result and dev_result.get("error"):
            flags.append(f"העמוד לא נטען ב{dev_name}: {dev_result['error'][:80]}")
    if not s_any:
        return flags + ["לא נאספו אותות (העמוד לא נטען)"]
    cta = sm.get("cta") if sm else None
    if cta:
        label = "כפתור ההוספה לעגלה" if ptype == "product" else "הכפתור הראשי"
        if not cta.get("in_fold"):
            flags.append(f"{label} במובייל לא נראה בלי גלילה (נמצא בגובה {cta.get('top')}px)")
        if ptype == "product" and not cta.get("sticky"):
            flags.append(f"{label} במובייל אינו דביק (נעלם אחרי גלילה)")
        if not cta.get("meets_44px"):
            flags.append(f"{label} במובייל קטן מ-44px ({cta.get('width')}×{cta.get('height')})")
    if not s_any.get("viewport_meta"):
        flags.append("אין תגית viewport (העמוד יוצג כדסקטופ מוקטן במובייל)")
    if s_any.get("user_scalable_no"):
        flags.append("viewport חוסם זום (user-scalable=no), הפרת WCAG 1.4.4")
    h1c = s_any.get("h1_count")
    if h1c is not None and h1c != 1:
        flags.append(f"מספר כותרות H1 בעמוד: {h1c} (צריך להיות 1)")
    total = s_any.get("images_total") or 0
    noalt = s_any.get("images_without_alt") or 0
    if total >= 5 and noalt / float(total) >= 0.2:
        flags.append(f"{int(round(100.0 * noalt / total))}% מהתמונות בלי alt ({noalt} מתוך {total})")
    hr = s_any.get("hebrew_ratio")
    if hr is not None and hr >= 0.5 and (s_any.get("dir") or "").lower() != "rtl":
        flags.append("טקסט בעברית בלי dir=rtl")
    if hr is not None and hr >= 0.5 and not (s_any.get("lang") or "").lower().startswith("he"):
        flags.append(f"טקסט בעברית עם lang={s_any.get('lang') or 'חסר'}")
    if sm.get("horizontal_overflow"):
        flags.append("גלילה אופקית במובייל")
    if (sm.get("inputs_font_below_16") or 0) > 0:
        flags.append(f"{sm['inputs_font_below_16']} שדות קלט עם גופן קטן מ-16px במובייל (iOS יתקרב אוטומטית)")
    if (sm.get("small_tap_targets") or 0) > 10:
        flags.append(f"{sm['small_tap_targets']} אזורי לחיצה קטנים מ-44px במובייל")
    if (sm.get("small_text_elements") or 0) > 5:
        flags.append(f"{sm['small_text_elements']} טקסטים קטנים מ-12px במובייל")
    if (s_any.get("inputs_without_label") or 0) > 0:
        flags.append(f"{s_any['inputs_without_label']} שדות קלט בלי תווית מקושרת")
    lcp = mm.get("lcp_ms") or 0
    if lcp > 2500:
        flags.append(f"LCP במובייל {lcp / 1000.0:.1f} שניות (מעבדה; יעד עד 2.5)")
    cls = mm.get("cls") or 0
    if cls > 0.1:
        flags.append(f"CLS במובייל {cls} (יעד עד 0.1)")
    tk = max(mm.get("transfer_kb") or 0, mm.get("transfer_kb_timing") or 0)
    if tk > 3000:
        flags.append(f"משקל העמוד במובייל בערך {tk / 1024.0:.1f} MB")
    if (sm.get("dom_nodes") or 0) > 1500:
        flags.append(f"DOM גדול במובייל: {sm['dom_nodes']} צמתים")
    errs = len(m.get("console_errors") or []) + len(d.get("console_errors") or [])
    if errs:
        flags.append(f"{errs} שגיאות JavaScript בקונסול (מובייל + דסקטופ)")
    fails = len(m.get("failed_requests") or []) + len(d.get("failed_requests") or [])
    if fails:
        flags.append(f"{fails} בקשות רשת שנכשלו")
    mentions = s_any.get("mentions") or {}
    if ptype == "product":
        if not s_any.get("has_price"):
            flags.append("לא זוהה מחיר בעמוד מוצר")
        if not s_any.get("has_add_to_cart_button"):
            flags.append("לא זוהה כפתור הוספה לעגלה לפי טקסט הכפתורים")
        if not mentions.get("shipping"):
            flags.append("עמוד מוצר בלי אזכור משלוח")
        if not mentions.get("reviews"):
            flags.append("עמוד מוצר בלי אזכור ביקורות או דירוג")
        if not mentions.get("returns"):
            flags.append("עמוד מוצר בלי אזכור החזרות")
    if ptype == "cart":
        if not mentions.get("shipping"):
            flags.append("עגלה בלי אזכור משלוח")
        if not s_any.get("has_checkout_button"):
            flags.append("לא זוהה כפתור מעבר לתשלום לפי טקסט הכפתורים")
    if ptype == "checkout":
        if (s_any.get("forms") or 0) == 0:
            flags.append("צ'קאאוט בלי טופס (ייתכן שהעמוד דורש עגלה מלאה או התחברות)")
        if not mentions.get("secure"):
            flags.append("צ'קאאוט בלי אזכור אבטחה")
    if ptype == "home" and not s_any.get("h1"):
        flags.append("דף הבית בלי H1")
    return flags


# ---------------------------------------------------------------------------
# סריקה בדפדפן
# ---------------------------------------------------------------------------


def run_browser(selected, base, out_dir, args, pages):
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        log("Playwright לא מותקן. להתקנה: pip install playwright && playwright install chromium")
        log("או להריץ עם --no-browser (בלי צילומי מסך ומדדי פריסה).")
        return False

    shots_dir = os.path.join(out_dir, "screenshots")
    os.makedirs(shots_dir, exist_ok=True)
    patterns = {"mentions": MENTION_PATTERNS, "add_to_cart": ADD_TO_CART_RE, "checkout": CHECKOUT_RE, "price": PRICE_RE}

    with sync_playwright() as p:
        launch_kwargs = {"headless": True}
        if args.executable_path:
            launch_kwargs["executable_path"] = args.executable_path
        try:
            browser = p.chromium.launch(**launch_kwargs)
        except Exception as e:
            log(f"לא הצלחתי להפעיל Chromium: {e}")
            log("נסה: playwright install chromium, או --executable-path לנתיב של Chromium קיים, או --no-browser.")
            return False

        devices = list(DEVICES.items())
        if args.mobile_only:
            devices = [d for d in devices if d[0] == "mobile"]
        if args.desktop_only:
            devices = [d for d in devices if d[0] == "desktop"]

        for dev_name, dev in devices:
            log(f"\n== {dev_name} ({dev['width']}×{dev['height']}) ==")
            context = browser.new_context(
                viewport={"width": dev["width"], "height": dev["height"]},
                device_scale_factor=dev["scale"],
                user_agent=dev["user_agent"],
                is_mobile=dev["is_mobile"],
                has_touch=dev["has_touch"],
                locale="he-IL",
                ignore_https_errors=True,
            )
            context.add_init_script(METRICS_INIT_JS)
            page = context.new_page()
            state = {"console": [], "failed": [], "bytes": 0}

            def on_console(msg):
                try:
                    if msg.type == "error":
                        text = msg.text[:200]
                        loc = getattr(msg, "location", None) or {}
                        url = loc.get("url") if isinstance(loc, dict) else None
                        if url and url not in text:
                            text = f"{text} [{url[:120]}]"
                        state["console"].append(text)
                except Exception:
                    pass

            def dedupe(items, limit=10):
                counts = OrderedDict()
                for it in items:
                    counts[it] = counts.get(it, 0) + 1
                out = [f"{k} (×{v})" if v > 1 else k for k, v in counts.items()]
                return out[:limit]

            def on_pageerror(err):
                state["console"].append(str(err)[:200])

            def on_reqfailed(req):
                try:
                    f = req.failure or ""
                    state["failed"].append(f"{req.url[:150]} ({f})")
                except Exception:
                    pass

            def on_response(resp):
                try:
                    cl = resp.headers.get("content-length")
                    if cl:
                        state["bytes"] += int(cl)
                except Exception:
                    pass

            page.on("console", on_console)
            page.on("pageerror", on_pageerror)
            page.on("requestfailed", on_reqfailed)
            page.on("response", on_response)

            def capture(url, slug, ptype):
                # מרוקנים אירועים שנשארו מהעמוד הקודם לפני האיפוס, אחרת הם נזקפים לעמוד הזה
                try:
                    page.wait_for_timeout(250)
                except Exception:
                    pass
                state["console"], state["failed"], state["bytes"] = [], [], 0
                result = {"screenshot_fold": None, "screenshot_full": None, "signals": None, "metrics": None, "console_errors": [], "failed_requests": [], "error": None, "final_url": None}
                try:
                    resp = page.goto(url, wait_until="load", timeout=args.timeout * 1000)
                    result["status"] = resp.status if resp else None
                    try:
                        page.wait_for_load_state("networkidle", timeout=8000)
                    except Exception:
                        pass
                    page.wait_for_timeout(args.settle)
                    result["final_url"] = page.url
                    fold = os.path.join(shots_dir, f"{slug}__{dev_name}__fold.png")
                    page.screenshot(path=fold, full_page=False)
                    result["screenshot_fold"] = os.path.relpath(fold, out_dir)
                    if not args.no_full:
                        full = os.path.join(shots_dir, f"{slug}__{dev_name}__full.png")
                        height = page.evaluate("document.documentElement.scrollHeight")
                        if height and height > args.full_max_height:
                            page.screenshot(path=full, full_page=True, clip={"x": 0, "y": 0, "width": dev["width"], "height": args.full_max_height})
                        else:
                            page.screenshot(path=full, full_page=True)
                        result["screenshot_full"] = os.path.relpath(full, out_dir)
                    result["signals"] = page.evaluate(SIGNALS_JS, patterns)
                    metrics = page.evaluate(METRICS_READ_JS)
                    metrics["transfer_kb"] = max(metrics.get("transfer_kb_timing", 0), int(state["bytes"] / 1024))
                    result["metrics"] = metrics
                except Exception as e:
                    result["error"] = str(e)[:300]
                    log(f"   שגיאה: {str(e)[:120]}")
                try:
                    page.wait_for_timeout(250)  # לאסוף אירועים מאוחרים של העמוד הזה
                except Exception:
                    pass
                result["console_errors"] = dedupe(state["console"])
                result["failed_requests"] = dedupe(state["failed"])
                return result

            for url, ptype, slug in selected:
                log(f" - {slug} ({TYPE_HE.get(ptype, ptype)}): {url}")
                pages[slug][dev_name] = capture(url, slug, ptype)
                time.sleep(args.delay)

            # ניסיון להגיע לצ'קאאוט: הוספה לעגלה מעמוד מוצר, מעבר לעגלה, לחיצה על "לתשלום"
            if args.try_checkout:
                product = next(((u, s) for u, t, s in selected if t == "product"), None)
                if product:
                    log(" - מנסה להוסיף לעגלה ולהגיע לצ'קאאוט...")
                    try:
                        page.goto(product[0], wait_until="load", timeout=args.timeout * 1000)
                        page.wait_for_timeout(1500)
                        clicked = page.evaluate(CLICK_BY_TEXT_JS, ADD_TO_CART_RE)
                        if clicked:
                            log(f"   נלחץ: '{clicked}'")
                            page.wait_for_timeout(3000)
                            try:
                                page.wait_for_load_state("networkidle", timeout=8000)
                            except Exception:
                                pass
                            # אם הלחיצה כבר הובילה לעגלה, משתמשים בכתובת הזאת; אחרת בעגלה שנמצאה בסריקה; אחרת /cart
                            if classify(page.url) == "cart":
                                cart_url = page.url
                            else:
                                cart_url = next((u for u, t, s in selected if t == "cart"), None) or urllib.parse.urljoin(base, "/cart")
                            slug = "cart-after-add"
                            cart_result = capture(cart_url, slug, "cart")
                            if (cart_result.get("status") or 0) >= 400 or cart_result.get("error"):
                                log(f"   העגלה לא נטענה ({cart_result.get('status') or cart_result.get('error')}); מדלג על הצ'קאאוט. אפשר להעביר כתובת עגלה מדויקת עם --urls.")
                                raise _SkipFlow()
                            pages.setdefault(slug, {"url": cart_url, "type": "cart", "slug": slug, "discovered_via": "checkout-flow", "flags": []})
                            pages[slug][dev_name] = cart_result
                            clicked2 = page.evaluate(CLICK_BY_TEXT_JS, CHECKOUT_RE)
                            if clicked2:
                                log(f"   נלחץ: '{clicked2}'")
                                page.wait_for_timeout(5000)
                                try:
                                    page.wait_for_load_state("networkidle", timeout=8000)
                                except Exception:
                                    pass
                                co_url = page.url
                                if normalize_url(co_url) != normalize_url(cart_url):
                                    slug = "checkout"
                                    co_result = capture(co_url, slug, "checkout")
                                    if (co_result.get("status") or 0) >= 400 or co_result.get("error"):
                                        log(f"   עמוד הצ'קאאוט לא נטען ({co_result.get('status') or co_result.get('error')}).")
                                    else:
                                        pages.setdefault(slug, {"url": co_url, "type": "checkout", "slug": slug, "discovered_via": "checkout-flow", "flags": []})
                                        pages[slug][dev_name] = co_result
                                        log(f"   הצ'קאאוט צולם: {co_url}")
                                else:
                                    log("   הכתובת לא השתנתה אחרי הלחיצה; הצ'קאאוט כנראה דורש התחברות או CAPTCHA.")
                            else:
                                log("   לא נמצא כפתור מעבר לתשלום בעגלה.")
                        else:
                            log("   לא נמצא כפתור הוספה לעגלה בעמוד המוצר (אולי צריך לבחור וריאציה קודם).")
                    except _SkipFlow:
                        pass
                    except Exception as e:
                        log(f"   זרימת הצ'קאאוט נכשלה: {str(e)[:120]}")
                else:
                    log(" - אין עמוד מוצר בדגימה, מדלג על ניסיון הצ'קאאוט.")

            context.close()
        browser.close()
    return True


def run_static(selected, out_dir, args, pages):
    for url, ptype, slug in selected:
        log(f" - {slug} ({TYPE_HE.get(ptype, ptype)}): {url}")
        status, final, text, ctype = fetch(url, args.timeout)
        entry = {"status": status, "final_url": final, "signals": None, "error": None}
        if status == 200 and text:
            entry["signals"] = static_signals(parse_html(text))
        else:
            entry["error"] = f"HTTP {status}" if status else "לא נטען"
        pages[slug]["static"] = entry
        time.sleep(args.delay)


# ---------------------------------------------------------------------------
# סיכום בעברית
# ---------------------------------------------------------------------------


def fmt_lcp(ms):
    return f"{ms / 1000.0:.1f}s" if ms else "-"


def write_summary(out_dir, data):
    pages = data["pages"]
    by_type = {}
    for p in pages:
        by_type.setdefault(p["type"], []).append(p)
    lines = []
    lines.append(f"# סיכום סריקה: {data['site']}")
    lines.append("")
    lines.append(f"- **תאריך**: {data['generated_at'][:19].replace('T', ' ')}")
    lines.append(f"- **מצב**: {'דפדפן (צילומי מסך ומדדי פריסה)' if data['mode'] == 'browser' else 'בלי דפדפן (אותות מה-HTML בלבד, בלי צילומי מסך)'}")
    lines.append(f"- **פלטפורמה שזוהתה**: {data['platform']}")
    lines.append(f"- **עמודים שנמצאו**: {data['discovery']['sitemap_urls']} ב-sitemap, {data['discovery']['crawled_urls']} בזחילה, {data['discovery']['probed']} בבדיקת נתיבים נפוצים")
    lines.append(f"- **עמודים בדגימה**: {len(pages)}")
    lines.append("")
    lines.append("## עמודים לפי סוג")
    lines.append("")
    lines.append("| סוג | כמות בדגימה | כמות שנמצאה |")
    lines.append("|---|---|---|")
    for t in DEFAULT_CAPS:
        found = data["discovery"]["found_by_type"].get(t, 0)
        lines.append(f"| {TYPE_HE.get(t, t)} | {len(by_type.get(t, []))} | {found} |")
    missing = [TYPE_HE[t] for t in ("home", "category", "product", "cart", "checkout", "search") if not by_type.get(t)]
    if missing:
        lines.append("")
        lines.append(f"**סוגי עמודים חשובים שחסרים בדגימה**: {', '.join(missing)}. אפשר להוסיף כתובות מדויקות עם `--urls`, או להשתמש ב-`--try-checkout` לצ'קאאוט.")
    lines.append("")
    lines.append("## טבלת העמודים")
    lines.append("")
    if data["mode"] == "browser":
        lines.append("| # | מזהה (slug) | סוג | LCP מובייל | CLS מובייל | תמונות בלי alt | לחיצה קטנה (מובייל) | גלילה אופקית | שגיאות JS | דגלים |")
        lines.append("|---|---|---|---|---|---|---|---|---|---|")
        for i, p in enumerate(pages, 1):
            m = p.get("mobile") or {}
            d = p.get("desktop") or {}
            s = (m.get("signals") or d.get("signals") or {})
            mm = m.get("metrics") or {}
            errs = len(m.get("console_errors") or []) + len(d.get("console_errors") or [])
            alt = f"{s.get('images_without_alt', '-')}/{s.get('images_total', '-')}" if s else "-"
            sm = m.get("signals") or {}
            lines.append(
                f"| {i} | `{p['slug']}` | {TYPE_HE.get(p['type'], p['type'])} | {fmt_lcp(mm.get('lcp_ms'))} | {mm.get('cls', '-')} | {alt} | {sm.get('small_tap_targets', '-')} | {'כן' if sm.get('horizontal_overflow') else 'לא'} | {errs} | {len(p.get('flags') or [])} |"
            )
    else:
        lines.append("| # | מזהה (slug) | סוג | כותרת | H1 | תמונות בלי alt | טפסים | דגלים |")
        lines.append("|---|---|---|---|---|---|---|---|")
        for i, p in enumerate(pages, 1):
            s = (p.get("static") or {}).get("signals") or {}
            alt = f"{s.get('images_without_alt', '-')}/{s.get('images_total', '-')}" if s else "-"
            title = (s.get("title") or "-")[:40].replace("|", "\\|")
            lines.append(f"| {i} | `{p['slug']}` | {TYPE_HE.get(p['type'], p['type'])} | {title} | {s.get('h1_count', '-')} | {alt} | {s.get('forms', '-')} | {len(p.get('flags') or [])} |")
    lines.append("")
    lines.append("## דגלים אוטומטיים לפי עמוד")
    lines.append("")
    lines.append("הדגלים הם אותות היוריסטיים מהסריקה, לא ממצאים. הסוכנים צריכים לאמת אותם מול צילומי המסך.")
    lines.append("")
    any_flags = False
    for p in pages:
        if p.get("flags"):
            any_flags = True
            lines.append(f"### `{p['slug']}` ({TYPE_HE.get(p['type'], p['type'])}): {p['url']}")
            for f in p["flags"]:
                lines.append(f"- {f}")
            lines.append("")
    if not any_flags:
        lines.append("לא הורמו דגלים אוטומטיים.")
        lines.append("")
    lines.append("## קבצים")
    lines.append("")
    lines.append("- `pages.json`: כל הנתונים, לכל עמוד ולכל מכשיר (`mobile`, `desktop`), כולל `signals`, `metrics`, `console_errors`, `failed_requests`.")
    if data["mode"] == "browser":
        lines.append("- `screenshots/<slug>__<device>__fold.png`: מה שרואים בלי לגלול. `screenshots/<slug>__<device>__full.png`: העמוד המלא (עד גובה מוגבל).")
    lines.append("")
    lines.append("## מה הלאה")
    lines.append("")
    lines.append("1. אם חסרים סוגי עמודים חשובים, להריץ שוב עם `--urls` וכתובות מדויקות.")
    lines.append("2. הצ'קאאוט כמעט תמיד דורש הליכה ידנית. אם `--try-checkout` לא הגיע אליו, לבקש צילומי מסך מהמשתמש.")
    lines.append("3. להמשיך לשלב 1 (מחקר) ולשלב 2 (מסמכי ידע), ואז לשלוח את ששת הסוכנים עם התיקייה הזאת כקלט.")
    with open(os.path.join(out_dir, "summary.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description="סריקת חנות אונליין לביקורת CRO.", formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
    parser.add_argument("url", help="כתובת החנות (דף הבית)")
    parser.add_argument("--out", default="cro-audit/02-crawl", help="תיקיית הפלט (ברירת מחדל: cro-audit/02-crawl)")
    parser.add_argument("--max-pages", type=int, default=25, help="מספר עמודים מקסימלי בדגימה (ברירת מחדל: 25)")
    parser.add_argument("--urls", default=None, help="רשימת כתובות מפורשת (מופרדות בפסיק) או נתיב לקובץ עם כתובת בכל שורה. מדלג על הגילוי האוטומטי.")
    parser.add_argument("--only-types", default=None, help="לסרוק רק סוגים אלה (מופרדים בפסיק): home,category,product,cart,checkout,search,account,content,policy,other")
    parser.add_argument("--no-browser", action="store_true", help="בלי Playwright: אותות מה-HTML בלבד, בלי צילומי מסך")
    parser.add_argument("--try-checkout", action="store_true", help="לנסות להוסיף מוצר לעגלה ולהגיע לצ'קאאוט")
    parser.add_argument("--mobile-only", action="store_true", help="לסרוק רק במובייל")
    parser.add_argument("--desktop-only", action="store_true", help="לסרוק רק בדסקטופ")
    parser.add_argument("--no-full", action="store_true", help="לא לצלם עמוד מלא, רק את החלק העליון")
    parser.add_argument("--full-max-height", type=int, default=6000, help="גובה מקסימלי לצילום עמוד מלא בפיקסלים (ברירת מחדל: 6000)")
    parser.add_argument("--timeout", type=int, default=45, help="זמן המתנה מקסימלי לטעינת עמוד בשניות (ברירת מחדל: 45)")
    parser.add_argument("--settle", type=int, default=1200, help="המתנה נוספת אחרי הטעינה במילישניות, לאנימציות ופופאפים (ברירת מחדל: 1200)")
    parser.add_argument("--delay", type=float, default=0.5, help="השהיה בין בקשות בשניות (ברירת מחדל: 0.5)")
    parser.add_argument("--executable-path", default=None, help="נתיב ל-Chromium קיים, אם Playwright לא מוצא")
    args = parser.parse_args()

    base = normalize_url(args.url if "://" in args.url else "https://" + args.url)
    if not base:
        log("כתובת לא תקינה.")
        return 1
    home = normalize_url(urllib.parse.urljoin(base, "/"))
    os.makedirs(args.out, exist_ok=True)
    only_types = [t.strip() for t in args.only_types.split(",")] if args.only_types else None

    log(f"סריקה של {base}")
    status, final, home_html, ctype = fetch(home, args.timeout)
    if status != 200:
        log(f"אזהרה: דף הבית החזיר {status}. ממשיכים, אבל ייתכן שהאתר חוסם סורקים או שהכתובת שגויה.")
    platform = detect_platform(home_html or "")
    log(f"פלטפורמה שזוהתה: {platform}")

    discovery = {"sitemap_urls": 0, "crawled_urls": 0, "probed": 0, "found_by_type": {}}
    by_type = {}

    if args.urls:
        if os.path.exists(args.urls):
            with open(args.urls, "r", encoding="utf-8") as f:
                raw = [l.strip() for l in f if l.strip()]
        else:
            raw = [u.strip() for u in args.urls.split(",") if u.strip()]
        selected = []
        seen = set()
        for u in raw:
            n = normalize_url(u, base=base)
            if n and n not in seen:
                seen.add(n)
                selected.append((n, classify(n)))
        if home not in seen:
            selected.insert(0, (home, "home"))
        for u, t in selected:
            by_type.setdefault(t, []).append(u)
    else:
        log("מחפש sitemap...")
        sm_urls = parse_sitemap(base, discover_sitemaps(base, args.timeout), args.timeout)
        discovery["sitemap_urls"] = len(sm_urls)
        log(f"נמצאו {len(sm_urls)} כתובות ב-sitemap")
        log("זוחל מדף הבית...")
        crawled, _ = crawl_links(base, args.timeout, args.delay)
        discovery["crawled_urls"] = len(crawled)
        log(f"נמצאו {len(crawled)} קישורים פנימיים")
        all_urls = []
        seen = set()
        for u in [home] + sm_urls + crawled:
            if u not in seen and not u.lower().endswith(SKIP_EXTENSIONS):
                seen.add(u)
                all_urls.append(u)
        for u in all_urls:
            by_type.setdefault(classify(u), []).append(u)
        if home not in by_type.get("home", []):
            by_type.setdefault("home", []).insert(0, home)
        log("בודק נתיבים נפוצים לעגלה, חשבון, מדיניות ותוכן...")
        probed = probe_missing(base, by_type, args.timeout, args.delay)
        s = search_probe(base, by_type, args.timeout)
        discovery["probed"] = len(probed) + (1 if s else 0)
        selected = select_pages(by_type, args.max_pages, only_types)

    discovery["found_by_type"] = {t: len(v) for t, v in by_type.items()}

    # slugs ייחודיים
    pages = OrderedDict()
    used = {}
    final_selected = []
    for url, ptype in selected:
        slug = slugify(url, ptype)
        if slug in used:
            used[slug] += 1
            slug = f"{slug}-{used[slug]}"
        else:
            used[slug] = 1
        pages[slug] = {"url": url, "type": ptype, "slug": slug, "discovered_via": "explicit" if args.urls else "auto", "flags": []}
        final_selected.append((url, ptype, slug))

    log(f"\nנבחרו {len(final_selected)} עמודים לסריקה:")
    for t in DEFAULT_CAPS:
        n = sum(1 for _, pt, _ in final_selected if pt == t)
        if n:
            log(f"  {TYPE_HE[t]}: {n}")

    mode = "no-browser" if args.no_browser else "browser"
    if mode == "browser":
        ok = run_browser(final_selected, base, args.out, args, pages)
        if not ok:
            log("\nעובר למצב בלי דפדפן.")
            mode = "no-browser"
    if mode == "no-browser":
        run_static(final_selected, args.out, args, pages)

    for slug, entry in pages.items():
        entry["flags"] = compute_flags(entry)

    data = {
        "site": base,
        "generated_at": datetime.now().isoformat(),
        "mode": mode,
        "platform": platform,
        "devices": {k: {"width": v["width"], "height": v["height"], "scale": v["scale"]} for k, v in DEVICES.items()} if mode == "browser" else {},
        "discovery": discovery,
        "pages": list(pages.values()),
        "notes": [
            "LCP ו-CLS הם מדידות מעבדה (מחשב ורשת מהירים) ולכן אופטימיות; מדידת שדה (PageSpeed Insights) עדיפה כשיש.",
            "transfer_kb מבוסס על כותרות content-length ועל Resource Timing; משאבים מדומיינים אחרים בלי Timing-Allow-Origin לא נספרים, כך שהמספר הוא רצפה.",
            "הדגלים (flags) הם אותות היוריסטיים, לא ממצאים. יש לאמת מול צילומי המסך.",
        ],
    }
    with open(os.path.join(args.out, "pages.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    write_summary(args.out, data)
    log(f"\nנכתבו: {os.path.join(args.out, 'pages.json')}, {os.path.join(args.out, 'summary.md')}" + (f", {os.path.join(args.out, 'screenshots')}/" if mode == "browser" else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
