# zoning

산업단지를 검색하거나 지도 위 점을 선택해 주변 초등학교, 중학교, 병·의원, 응급의료기관 수를 확인하는 지도 앱입니다. 같은 이름의 산업단지가 여러 곳이면 후보 목록에서 위치를 고릅니다. 각 시설 수는 선택한 산업단지 중심으로 700m, 2km, 5km 누적 반경별로 표시합니다. 학교 표시는 5km 이내만 지도에 나타납니다. 하단 그래프는 기존처럼 학교 수 기준 상위 10개 산업단지를 보여줍니다.

## 파일

- `index.html`, `app.js`, `styles.css`: 지도 앱
- `data.json`: 산업단지 및 초등학교·중학교 위치 자료
- `hospitals.json`: 국립중앙의료원 API에서 내려받은 병·의원 위치 자료 스냅샷
- `emergency_facilities.json`: 국립중앙의료원 API에서 내려받은 응급의료기관 위치 자료 스냅샷
- `provinces.geojson`: 대한민국 시·도 경계
- `elem.ipynb`: 학교 위치 지도 분석 노트북
- `fetch_hospitals.py`: API 인증키를 화면에 표시하지 않고 입력받아 병·의원 자료를 갱신하는 스크립트
- `fetch_emergency_facilities.py`: API 인증키를 화면에 표시하지 않고 입력받아 응급의료기관 자료를 갱신하는 스크립트

두 의료기관 데이터 파일은 배포 시점의 스냅샷입니다. 갱신하려면 각각 `py -3 fetch_hospitals.py`, `py -3 fetch_emergency_facilities.py`를 실행하고 API 인증키를 숨김 입력란에 입력합니다. 생성된 JSON 파일을 저장소 루트로 복사해 다시 배포합니다. 인증키는 소스나 공개 저장소에 저장되지 않습니다.

병·의원 자료 출처: [국립중앙의료원 병·의원 찾기 서비스](https://www.data.go.kr/data/15000736/openapi.do)

응급의료기관 자료 출처: [국립중앙의료원 전국 응급의료기관 정보 조회 서비스](https://www.data.go.kr/data/15000563/openapi.do)

정적 사이트 배포 시 저장소 루트 디렉터리를 산출물로 사용할 수 있습니다.
