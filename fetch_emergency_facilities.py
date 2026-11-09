"""Fetch a compact snapshot of emergency medical institutions in Korea.

The API key is requested interactively and is never written to disk.
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


ENDPOINT = "https://apis.data.go.kr/B552657/ErmctInfoInqireService/getEgytListInfoInqire"
OUTPUT = Path(__file__).resolve().parent / "dist" / "emergency_facilities.json"
PAGE_SIZE = 1000


def tag_value(item, names):
    for node in item:
        if node.tag.rsplit("}", 1)[-1] in names:
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
        raise RuntimeError(f"API error: {result_code} {message}")
    total = int(root.findtext(".//{*}totalCount", default="0"))
    return total, root.findall(".//{*}item")


def main():
    api_key = getpass.getpass("Data.go.kr service key (hidden): ").strip()
    if not api_key:
        raise SystemExit("No API key provided.")

    facilities = {}
    total = None
    page = 1
    while total is None or page <= math.ceil(total / PAGE_SIZE):
        last_error = None
        for attempt in range(3):
            try:
                total, items = request_page(api_key, page)
                last_error = None
                break
            except Exception as error:
                last_error = error
                if attempt < 2:
                    time.sleep(2 ** attempt)
        if last_error:
            raise last_error

        for item in items:
            facility_id = tag_value(item, {"hpid"})
            try:
                lat = float(tag_value(item, {"wgs84Lat", "latitude"}))
                lon = float(tag_value(item, {"wgs84Lon", "longitude"}))
            except ValueError:
                continue
            if not facility_id or not (33 <= lat <= 39 and 124 <= lon <= 132):
                continue
            facilities[facility_id] = {
                "id": facility_id,
                "name": tag_value(item, {"dutyName"}),
                "type": tag_value(item, {"dutyDivName", "dutyDiv"}),
                "lat": lat,
                "lon": lon,
            }
        print(f"Fetched page {page}; {len(facilities):,} geocoded emergency institutions so far.", flush=True)
        page += 1

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": "National Medical Center ErmctInfoInqireService",
        "retrieved": date.today().isoformat(),
        "facilities": list(facilities.values()),
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Saved {len(facilities):,} facilities ({OUTPUT.stat().st_size:,} bytes).")


if __name__ == "__main__":
    main()
