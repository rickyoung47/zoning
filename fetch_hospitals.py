"""Fetch a compact public-data snapshot of Korean hospitals and clinics.

The API key is requested interactively and is never saved to disk.
"""

import getpass
import json
import math
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path


ENDPOINT = "https://apis.data.go.kr/B552657/HsptlAsembySearchService/getHsptlMdcncFullDown"
OUTPUT = Path(__file__).resolve().parent / "dist" / "hospitals.json"
PAGE_SIZE = 1000


def tag_value(item, name):
    for node in item:
        if node.tag.rsplit("}", 1)[-1] == name:
            return (node.text or "").strip()
    return ""


def request_page(api_key, page):
    query = urllib.parse.urlencode({"serviceKey": api_key, "pageNo": page, "numOfRows": PAGE_SIZE})
    request = urllib.request.Request(f"{ENDPOINT}?{query}", headers={"User-Agent": "zoning-map/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        root = ET.fromstring(response.read())
    result_code = root.findtext(".//{*}resultCode", default="")
    if result_code != "00":
        message = root.findtext(".//{*}resultMsg", default="API returned an unknown error")
        raise RuntimeError(f"API error on page {page}: {result_code} {message}")
    total = int(root.findtext(".//{*}totalCount", default="0"))
    items = root.findall(".//{*}item")
    return total, items


def main():
    api_key = getpass.getpass("Data.go.kr service key (hidden): ").strip()
    if not api_key:
        raise SystemExit("No API key provided.")

    facilities = {}
    total = None
    pages = 0
    page = 1
    while total is None or page <= math.ceil(total / PAGE_SIZE):
        last_error = None
        for attempt in range(3):
            try:
                reported_total, items = request_page(api_key, page)
                total = reported_total
                last_error = None
                break
            except Exception as error:  # Retry transient API/network failures.
                last_error = error
                if attempt < 2:
                    time.sleep(2 ** attempt)
        if last_error:
            raise last_error

        for item in items:
            facility_id = tag_value(item, "hpid")
            try:
                lat = float(tag_value(item, "wgs84Lat"))
                lon = float(tag_value(item, "wgs84Lon"))
            except ValueError:
                continue
            if not facility_id or not (33 <= lat <= 39 and 124 <= lon <= 132):
                continue
            facilities[facility_id] = {
                "id": facility_id,
                "name": tag_value(item, "dutyName"),
                "type": tag_value(item, "dutyDivNam"),
                "lat": lat,
                "lon": lon,
            }
        pages += 1
        if page == 1 or page % 10 == 0 or page == math.ceil(total / PAGE_SIZE):
            print(f"Fetched page {page}; {len(facilities):,} geocoded facilities so far.", flush=True)
        page += 1

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {"source": "National Medical Center HsptlAsembySearchService", "retrieved": date.today().isoformat(), "facilities": list(facilities.values())}
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Saved {len(facilities):,} facilities from {pages} pages ({OUTPUT.stat().st_size:,} bytes).")


if __name__ == "__main__":
    main()
