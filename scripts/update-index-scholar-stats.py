#!/usr/bin/env python3
import re
import sys
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path

INDEX = Path(__file__).resolve().parents[1] / "index.html"
SCHOLAR_URL = "https://scholar.google.com/citations?user=UXx1jNYAAAAJ&hl=en"


def fetch_html(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", "ignore")


def parse_stats(html: str):
    table_match = re.search(r'<table id="gsc_rsb_st".*?</table>', html, flags=re.S)
    if not table_match:
        raise RuntimeError("Could not find Google Scholar stats table")
    table = table_match.group(0)

    def one(label: str) -> str:
        m = re.search(rf'>{re.escape(label)}</a></td>\s*<td class="gsc_rsb_std">([^<]+)</td>', table)
        if not m:
            raise RuntimeError(f"Could not parse stat for {label}")
        return m.group(1).strip().replace(',', '')

    return one("Citations"), one("h-index"), one("i10-index")


def update_index(path: Path, citations: str, hidx: str, i10: str, date_str: str) -> bool:
    text = path.read_text(encoding="utf-8")

    block_re = re.compile(
        r'(<div class="citations-stats-box">.*?<div class="citation-stat-number">)([^<]+)(</div>\s*<div class="citation-stat-label">Total Citations</div>.*?'
        r'<div class="citation-stat-number">)([^<]+)(</div>\s*<div class="citation-stat-label">h-index</div>.*?'
        r'<div class="citation-stat-number">)([^<]+)(</div>\s*<div class="citation-stat-label">i10-index</div>)',
        flags=re.S,
    )
    m = block_re.search(text)
    if not m:
        raise RuntimeError("Could not find citation stats block in index.html")

    new_block = f"{m.group(1)}{citations}{m.group(3)}{hidx}{m.group(5)}{i10}{m.group(7)}"
    text = text[:m.start()] + new_block + text[m.end():]

    text = re.sub(
        r'(Data from <a href="https://scholar.google.com/citations\?user=UXx1jNYAAAAJ"[^>]*>Google Scholar</a> · Updated )\d{4}-\d{2}-\d{2}',
        rf'\g<1>{date_str}',
        text,
        count=1,
    )

    old = path.read_text(encoding="utf-8")
    if text == old:
        return False

    path.write_text(text, encoding="utf-8")
    return True


def main():
    html = fetch_html(SCHOLAR_URL)
    citations, hidx, i10 = parse_stats(html)
    date_str = datetime.now(ZoneInfo("Australia/Sydney")).strftime("%Y-%m-%d")
    changed = update_index(INDEX, citations, hidx, i10, date_str)
    print(f"citations={citations} h-index={hidx} i10-index={i10} changed={changed}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
