#!/usr/bin/env python3
import re
import urllib.request
from datetime import datetime
from pathlib import Path

SCHOLAR_URL = "https://scholar.google.com/citations?user=UXx1jNYAAAAJ&hl=en"
INDEX_PATH = Path(__file__).resolve().parents[1] / "index.html"


def fetch_stats():
    req = urllib.request.Request(SCHOLAR_URL, headers={"User-Agent": "Mozilla/5.0"})
    html = urllib.request.urlopen(req, timeout=20).read().decode("utf-8", "ignore")
    table = re.search(r'<table id="gsc_rsb_st">([\s\S]*?)</table>', html)
    if not table:
        raise RuntimeError("Cannot find scholar stats table")
    nums = re.findall(r'<td class="gsc_rsb_std">([^<]+)</td>', table.group(1))
    # [total, since-year, h, since-year, i10, since-year]
    if len(nums) < 5:
        raise RuntimeError("Cannot parse scholar stats numbers")
    return {
        "citations": nums[0].strip(),
        "hindex": nums[2].strip(),
        "i10": nums[4].strip(),
    }


def update_index(stats):
    s = INDEX_PATH.read_text(encoding="utf-8")

    # update first three stat numbers (Total citations / h-index / i10-index)
    nums = [stats["citations"], stats["hindex"], stats["i10"]]
    i = 0

    def repl_num(mm):
        nonlocal i
        out = f'{mm.group(1)}{nums[i]}{mm.group(3)}'
        i += 1
        return out

    s = re.sub(r'(<div class="citation-stat-number">)([^<]+)(</div>)', repl_num, s, count=3)
    if i != 3:
        raise RuntimeError("Did not update all 3 citation numbers")

    today = datetime.now().strftime("%Y-%m-%d")
    s = re.sub(r'(Data from <a href="https://scholar.google.com/citations\?user=UXx1jNYAAAAJ"[^>]*>Google Scholar</a> · Updated )\d{4}-\d{2}-\d{2}',
               rf'\g<1>{today}', s)

    INDEX_PATH.write_text(s, encoding="utf-8")


if __name__ == "__main__":
    stats = fetch_stats()
    update_index(stats)
    print(f"Updated index.html with citations={stats['citations']}, h={stats['hindex']}, i10={stats['i10']}")
