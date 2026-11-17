(() => {
  const rings = [700, 2000, 5000];
  const input = document.getElementById('industry-search');
  const datalist = document.getElementById('industry-list');
  const status = document.getElementById('search-status');
  const candidateList = document.getElementById('candidate-list');
  const title = document.getElementById('map-title');
  const resultsSubtitle = document.getElementById('results-subtitle');
  const map = L.map('map', { zoomControl: true, scrollWheelZoom: true, preferCanvas: true, zoomSnap: 0.25 }).setView([36.3, 127.8], 7);
  const boundaryPane = map.createPane('boundaries');
  boundaryPane.style.zIndex = 350;
  const industrialBoundaryPane = map.createPane('industrial-boundaries');
  industrialBoundaryPane.style.zIndex = 370;
  const circlePane = map.createPane('circles');
  circlePane.style.zIndex = 410;
  const industryPane = map.createPane('industrial-sites');
  industryPane.style.zIndex = 540;
  const schoolPane = map.createPane('schools');
  schoolPane.style.zIndex = 620;
  const sitePane = map.createPane('site');
  sitePane.style.zIndex = 650;
  const canvas = L.canvas({ padding: 0.35, pane: 'schools' });
  const industryCanvas = L.canvas({ padding: 0.35, pane: 'industrial-sites' });
  const industrialBoundaryCanvas = L.canvas({ padding: 0.35, pane: 'industrial-boundaries' });
  const selection = L.layerGroup().addTo(map);
  const gridCellSize = 0.05;
  let industries = [];
  let schools = [];
  let highSchools = [];
  let hospitals = [];
  let emergencyFacilities = [];
  let hubCategories = [];
  let hubPoiCount = 0;
  let poiCoverage = new Set();
  let networkData = { byIndustry: {} };
  let industrialBoundaryById = new Map();
  let schoolGrid = new Map();
  let highSchoolGrid = new Map();
  let hospitalGrid = new Map();
  let emergencyGrid = new Map();

  const esc = (text) => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const haversine = (aLat, aLon, bLat, bLon) => {
    const rad = Math.PI / 180;
    const dLat = (bLat - aLat) * rad;
    const dLon = (bLon - aLon) * rad;
    const v = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
    return 6371008.8 * 2 * Math.atan2(Math.sqrt(v), Math.sqrt(1 - v));
  };
  const setStatus = (text, error = false) => {
    status.textContent = text;
    status.classList.toggle('error', error);
  };
  const normalizeName = text => text.replace(/\s+/g, '').toLocaleLowerCase('ko-KR');

  function buildSchoolGrid() {
    schoolGrid = new Map();
    for (const school of schools) {
      const key = `${Math.floor(school.lat / gridCellSize)}:${Math.floor(school.lon / gridCellSize)}`;
      if (!schoolGrid.has(key)) schoolGrid.set(key, []);
      schoolGrid.get(key).push(school);
    }
  }

  function buildHighSchoolGrid() {
    highSchoolGrid = new Map();
    for (const school of highSchools) {
      const key = `${Math.floor(school.lat / gridCellSize)}:${Math.floor(school.lon / gridCellSize)}`;
      if (!highSchoolGrid.has(key)) highSchoolGrid.set(key, []);
      highSchoolGrid.get(key).push(school);
    }
  }

  function buildHospitalGrid() {
    hospitalGrid = new Map();
    for (const hospital of hospitals) {
      const key = `${Math.floor(hospital.lat / gridCellSize)}:${Math.floor(hospital.lon / gridCellSize)}`;
      if (!hospitalGrid.has(key)) hospitalGrid.set(key, []);
      hospitalGrid.get(key).push(hospital);
    }
  }

  function buildEmergencyGrid() {
    emergencyGrid = new Map();
    for (const facility of emergencyFacilities) {
      const key = `${Math.floor(facility.lat / gridCellSize)}:${Math.floor(facility.lon / gridCellSize)}`;
      if (!emergencyGrid.has(key)) emergencyGrid.set(key, []);
      emergencyGrid.get(key).push(facility);
    }
  }

  function nearbyHospitalCounts(site) {
    const latCell = Math.floor(site.lat / gridCellSize);
    const lonCell = Math.floor(site.lon / gridCellSize);
    const counts = [0, 0, 0];
    for (let latOffset = -2; latOffset <= 2; latOffset++) {
      for (let lonOffset = -2; lonOffset <= 2; lonOffset++) {
        const cell = hospitalGrid.get(`${latCell + latOffset}:${lonCell + lonOffset}`) || [];
        for (const hospital of cell) {
          const distance = haversine(site.lat, site.lon, hospital.lat, hospital.lon);
          for (let i = 0; i < rings.length; i++) if (distance <= rings[i]) counts[i]++;
        }
      }
    }
    return counts;
  }

  function nearbyEmergencyCounts(site) {
    const latCell = Math.floor(site.lat / gridCellSize);
    const lonCell = Math.floor(site.lon / gridCellSize);
    const counts = [0, 0, 0];
    for (let latOffset = -2; latOffset <= 2; latOffset++) {
      for (let lonOffset = -2; lonOffset <= 2; lonOffset++) {
        const cell = emergencyGrid.get(`${latCell + latOffset}:${lonCell + lonOffset}`) || [];
        for (const facility of cell) {
          const distance = haversine(site.lat, site.lon, facility.lat, facility.lon);
          for (let i = 0; i < rings.length; i++) if (distance <= rings[i]) counts[i]++;
        }
      }
    }
    return counts;
  }

  function nearbyHighSchoolCounts(site) {
    const latCell = Math.floor(site.lat / gridCellSize);
    const lonCell = Math.floor(site.lon / gridCellSize);
    const counts = [0, 0, 0];
    for (let latOffset = -2; latOffset <= 2; latOffset++) {
      for (let lonOffset = -2; lonOffset <= 2; lonOffset++) {
        const cell = highSchoolGrid.get(`${latCell + latOffset}:${lonCell + lonOffset}`) || [];
        for (const school of cell) {
          const distance = haversine(site.lat, site.lon, school.lat, school.lon);
          for (let i = 0; i < rings.length; i++) if (distance <= rings[i]) counts[i]++;
        }
      }
    }
    return counts;
  }

  function renderRankings() {
    const facilityTypes = ['elementary', 'middle', 'highSchools', 'hospitals', 'emergency', ...hubCategories.map(category => category.key)];
    const siteCounts = industries.map(site => {
      const metrics = networkData.byIndustry[site.id]?.counts || {};
      const typeCounts = facilityTypes.map(key => key in (metrics.hub || {})
        ? metrics.hub[key] || [0, 0, 0]
        : metrics[key] || [0, 0, 0]);
      return { ...site, typeCounts };
    });

    rings.forEach((radius, index) => {
      const typeMaxima = facilityTypes.map((_, typeIndex) => Math.max(0, ...siteCounts.map(site => site.typeCounts[typeIndex][index] || 0)));
      const activeTypeCount = typeMaxima.filter(maximum => maximum > 0).length;
      const scoredSites = siteCounts.map(site => {
        const rawTotal = site.typeCounts.reduce((sum, values) => sum + (Number(values[index]) || 0), 0);
        const normalized = site.typeCounts.reduce((sum, values, typeIndex) => {
          const maximum = typeMaxima[typeIndex];
          return sum + (maximum ? (Number(values[index]) || 0) / maximum : 0);
        }, 0);
        return { ...site, rawTotal, score: activeTypeCount ? normalized / activeTypeCount * 100 : 0 };
      });
      const byHighScore = [...scoredSites].sort((a, b) =>
        b.score - a.score || b.rawTotal - a.rawTotal || a.name.localeCompare(b.name, 'ko') || String(a.id).localeCompare(String(b.id))
      );
      const byLowScore = [...scoredSites].sort((a, b) =>
        a.score - b.score || a.rawTotal - b.rawTotal || a.name.localeCompare(b.name, 'ko') || String(a.id).localeCompare(String(b.id))
      );
      for (const [kind, sites] of [['top', byHighScore.slice(0, 10)], ['bottom', byLowScore.slice(0, 10)]]) {
        const container = document.getElementById(`rank-${kind}-${radius}`);
        container.replaceChildren();
        for (const [rank, site] of sites.entries()) {
          const row = document.createElement('button');
          row.type = 'button';
          row.className = 'rank-row';
          row.setAttribute('aria-label', `${rank + 1}위 ${site.name}, 시설 유형 균형 점수 ${site.score.toFixed(1)}점, 전체 시설 ${site.rawTotal}개. 눌러 지도에서 선택`);
          row.title = `${site.name} · ${site.id} · 균형 점수 ${site.score.toFixed(1)}점 · 전체 시설 ${site.rawTotal.toLocaleString()}개`;
          const number = document.createElement('span');
          number.className = 'rank-number';
          number.textContent = String(rank + 1).padStart(2, '0');
          const main = document.createElement('span');
          main.className = 'rank-main';
          const name = document.createElement('span');
          name.className = 'rank-name';
          name.textContent = site.name;
          const track = document.createElement('span');
          track.className = `rank-track radius-${radius}`;
          const bar = document.createElement('span');
          bar.className = 'rank-bar';
          bar.style.width = site.score ? `${Math.max(2, site.score)}%` : '0%';
          track.append(bar);
          main.append(name, track);
          const totalLabel = document.createElement('span');
          totalLabel.className = 'rank-total';
          totalLabel.textContent = `${site.score.toFixed(1)}`;
          row.append(number, main, totalLabel);
          row.addEventListener('click', () => {
            candidateList.hidden = true;
            input.value = site.name;
            selectIndustry(site);
            document.getElementById('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
          container.append(row);
        }
      }
    });
    renderInsideRankings();
    renderWeightedRankings();
  }

  function totalFacilityCount(metrics, radiusIndex) {
    let total = 0;
    for (const key of ['elementary', 'middle', 'highSchools', 'hospitals', 'emergency']) {
      total += Number(metrics[key]?.[radiusIndex]) || 0;
    }
    for (const values of Object.values(metrics.hub || {})) total += Number(values[radiusIndex]) || 0;
    return total;
  }

  function totalInsideFacilityCount(insideCounts) {
    if (!insideCounts) return null;
    let total = 0;
    for (const key of ['elementary', 'middle', 'highSchools', 'hospitals', 'emergency']) {
      total += Number(insideCounts[key]) || 0;
    }
    for (const count of Object.values(insideCounts.hub || {})) total += Number(count) || 0;
    return total;
  }

  function renderSiteRankRows(containerId, sites, valueKey, maximum, styleName, unit) {
    const container = document.getElementById(containerId);
    container.replaceChildren();
    for (const [index, site] of sites.entries()) {
      const value = site[valueKey];
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'rank-row';
      row.setAttribute('aria-label', `${index + 1}위 ${site.name}, ${value.toLocaleString()}${unit}. 눌러 지도에서 선택`);
      row.title = `${site.name} · ${site.id} · ${value.toLocaleString()}${unit}`;
      const number = document.createElement('span');
      number.className = 'rank-number';
      number.textContent = String(index + 1).padStart(2, '0');
      const main = document.createElement('span');
      main.className = 'rank-main';
      const name = document.createElement('span');
      name.className = 'rank-name';
      name.textContent = site.name;
      const track = document.createElement('span');
      track.className = `rank-track ${styleName}`;
      const bar = document.createElement('span');
      bar.className = 'rank-bar';
      bar.style.width = value ? `${Math.max(2, value / Math.max(1, maximum) * 100)}%` : '0%';
      track.append(bar);
      main.append(name, track);
      const label = document.createElement('span');
      label.className = 'rank-total';
      label.textContent = value.toLocaleString();
      row.append(number, main, label);
      row.addEventListener('click', () => {
        candidateList.hidden = true;
        input.value = site.name;
        selectIndustry(site);
        document.getElementById('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      container.append(row);
    }
  }

  function renderInsideRankings() {
    const sites = industries.map(site => {
      const insideCounts = networkData.byIndustry[site.id]?.insideFacilityCounts;
      return { ...site, insideTotal: totalInsideFacilityCount(insideCounts) };
    }).filter(site => site.insideTotal !== null);
    const byHigh = [...sites].sort((a, b) => b.insideTotal - a.insideTotal || a.name.localeCompare(b.name, 'ko') || String(a.id).localeCompare(String(b.id)));
    const byLow = [...sites].sort((a, b) => a.insideTotal - b.insideTotal || a.name.localeCompare(b.name, 'ko') || String(a.id).localeCompare(String(b.id)));
    const maximum = Math.max(1, ...sites.map(site => site.insideTotal));
    renderSiteRankRows('rank-inside-top', byHigh.slice(0, 10), 'insideTotal', maximum, 'rank-track-inside', '곳');
    renderSiteRankRows('rank-inside-bottom', byLow.slice(0, 10), 'insideTotal', maximum, 'rank-track-inside', '곳');
  }

  function renderWeightedRankings() {
    const sites = industries.map(site => {
      const record = networkData.byIndustry[site.id];
      const insideTotal = totalInsideFacilityCount(record?.insideFacilityCounts);
      if (insideTotal === null) return null;
      const metrics = record?.counts || {};
      const counts700 = totalFacilityCount(metrics, 0);
      const counts2000 = totalFacilityCount(metrics, 1);
      const counts5000 = totalFacilityCount(metrics, 2);
      return { ...site, weightedScore: counts700 * 3 + counts2000 * 2 + counts5000 + insideTotal * 4 };
    }).filter(Boolean).sort((a, b) => b.weightedScore - a.weightedScore || a.name.localeCompare(b.name, 'ko') || String(a.id).localeCompare(String(b.id))).slice(0, 50);
    const maximum = Math.max(1, ...sites.map(site => site.weightedScore));
    renderSiteRankRows('rank-weighted-top', sites, 'weightedScore', maximum, 'rank-track-weighted', '점');
  }

  function askToChoose(candidates) {
    candidateList.replaceChildren();
    const prompt = document.createElement('p');
    prompt.className = 'candidate-prompt';
    prompt.textContent = `이름이 같은 산업단지가 ${candidates.length}곳 있습니다. 위치를 선택해 주세요.`;
    candidateList.append(prompt);
    for (const site of candidates) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'candidate-option';
      button.innerHTML = `<span class="candidate-name">${esc(site.name)}</span><span class="candidate-meta">${esc(site.id)} · ${site.lat.toFixed(4)}, ${site.lon.toFixed(4)}</span>`;
      button.addEventListener('click', () => {
        candidateList.hidden = true;
        selectIndustry(site);
      });
      candidateList.append(button);
    }
    candidateList.hidden = false;
    candidateList.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  Promise.all([
    fetch('data.json').then(r => { if (!r.ok) throw new Error('data.json 로드 실패'); return r.json(); }),
    fetch('provinces.geojson').then(r => { if (!r.ok) throw new Error('경계 파일 로드 실패'); return r.json(); }),
    fetch('industrial_boundaries.geojson').then(r => { if (!r.ok) throw new Error('산업단지 경계 데이터 로드 실패'); return r.json(); }),
    fetch('hospitals.json').then(r => { if (!r.ok) throw new Error('병·의원 자료 로드 실패'); return r.json(); }),
    fetch('emergency_facilities.json').then(r => { if (!r.ok) throw new Error('응급의료기관 자료 로드 실패'); return r.json(); }),
    fetch('network_data.json').then(r => { if (!r.ok) throw new Error('OSM 도로망 거리 자료 로드 실패'); return r.json(); })
  ]).then(([data, boundaries, industrialBoundaries, hospitalData, emergencyData, network]) => {
    networkData = network;
    industrialBoundaryById = new Map(industrialBoundaries.features.map(feature => [String(feature.properties.dan_id), feature]));
    document.getElementById('network-source').textContent = `거리 집계: 산업단지 경계를 100m 간격 다중 시작점으로 네트워크에 연결해 계산합니다. 경계 안 시설은 0m로 포함하며, 경계 없는 산업단지는 기존 좌표점 시작점을 사용합니다. OSM 기준일 ${networkData.retrieved || '미확인'}`;
    document.getElementById('network-source').textContent = `거리 집계 자료: OpenStreetMap 보행 가능 도로망 · 기준일 ${networkData.retrieved || '미확인'} · 위치를 최근접 도로 노드에 연결해 계산`;
    industries = data.industries.filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lon));
    hubCategories = data.hubCategories || [];
    hubPoiCount = data.hubPoiCount || 0;
    poiCoverage = new Set(data.poiCoverage || []);
    schools = data.schools.filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lon));
    highSchools = (data.highSchools || []).filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lon));
    hospitals = hospitalData.facilities.filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lon));
    emergencyFacilities = emergencyData.facilities.filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lon));
    buildSchoolGrid();
    buildHighSchoolGrid();
    buildHospitalGrid();
    buildEmergencyGrid();
    document.getElementById('hospital-source').textContent = `병·의원 자료: 국립중앙의료원 병·의원 찾기 서비스 · 자료 내려받기 ${hospitalData.retrieved} · 좌표가 확인된 ${hospitals.length.toLocaleString()}개소`;
    document.getElementById('emergency-source').textContent = `응급의료기관 자료: 국립중앙의료원 응급의료정보조회 서비스 · 자료 내려받기 ${emergencyData.retrieved} · 좌표가 확인된 ${emergencyFacilities.length.toLocaleString()}개소`;
    document.getElementById('highschool-source').textContent = `고등학교 위치 자료: 한국교육시설안전원 전국초중등학교위치표준데이터 · 기준일 ${data.schoolReferenceDate || '미제공'} · 좌표 확인 ${highSchools.length.toLocaleString()}개교`;
    for (const item of industries) {
      const option = document.createElement('option');
      option.value = item.name;
      datalist.append(option);
    }
    const regionLayer = L.geoJSON(boundaries, {
      pane: 'boundaries',
      style: { color: '#8291a7', weight: 1.15, opacity: 0.88, fillColor: '#e7edf5', fillOpacity: 0.52, lineJoin: 'round' },
      onEachFeature: (feature, layer) => layer.bindTooltip(feature.properties.name || '', { sticky: true, direction: 'top' })
    }).addTo(map);
    L.geoJSON(industrialBoundaries, {
      pane: 'industrial-boundaries',
      renderer: industrialBoundaryCanvas,
      interactive: false,
      style: { color: '#b54e32', weight: 1, opacity: 0.9, fillColor: '#db8567', fillOpacity: 0.06, lineJoin: 'round' }
    }).addTo(map);
    map.attributionControl.addAttribution('산업단지 경계: 국토교통부 DAM_DAN');
    map.attributionControl.addAttribution('도로망 © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>');
    const boundaryIds = new Set(industrialBoundaries.features.map(feature => String(feature.properties.dan_id)));
    const industryMarkers = L.layerGroup().addTo(map);
    const noBoundaryMarkers = L.layerGroup().addTo(map);
    let noBoundaryCount = 0;
    for (const site of industries) {
      const hasBoundary = boundaryIds.has(String(site.id));
      if (!hasBoundary) noBoundaryCount++;
      L.circleMarker([site.lat, site.lon], {
        pane: 'industrial-sites',
        renderer: industryCanvas,
        radius: hasBoundary ? 5 : 7,
        color: '#ffffff',
        weight: hasBoundary ? 1.2 : 2,
        fillColor: hasBoundary ? '#d99b26' : '#8353c6',
        fillOpacity: 0.96,
        bubblingMouseEvents: false
      })
        .bindTooltip(hasBoundary ? `${site.name} · 지도에서 선택` : `${site.name} · 산업단지 경계 자료 없음 · 지도에서 선택`, { direction: 'top', sticky: true })
        .on('click', () => {
          candidateList.hidden = true;
          input.value = site.name;
          selectIndustry(site);
        })
        .addTo(hasBoundary ? industryMarkers : noBoundaryMarkers);
    }
    const noBoundaryToggle = document.getElementById('toggle-no-boundary');
    document.getElementById('no-boundary-count').textContent = noBoundaryCount.toLocaleString();
    noBoundaryToggle.addEventListener('change', () => {
      if (noBoundaryToggle.checked) noBoundaryMarkers.addTo(map);
      else map.removeLayer(noBoundaryMarkers);
    });
    renderRankings();
    map.fitBounds(regionLayer.getBounds(), { padding: [18, 18] });
    setStatus(`산업단지 ${industries.length.toLocaleString()}곳이 지도에 표시돼 있습니다. 점을 클릭하거나 이름을 검색하세요.`);
  }).catch(error => setStatus(`지도 자료를 불러오지 못했습니다. ${error.message}`, true));

  function chooseIndustry() {
    const query = input.value.trim();
    candidateList.hidden = true;
    if (!query) {
      setStatus('산업단지 이름을 입력해 주세요.', true);
      input.focus();
      return;
    }
    const normalized = normalizeName(query);
    let candidates = industries.filter(x => normalizeName(x.name) === normalized);
    if (!candidates.length) candidates = industries.filter(x => normalizeName(x.name).includes(normalized));
    if (!candidates.length) {
      setStatus(`“${query}”에 해당하는 산업단지를 찾지 못했습니다. 이름 일부로 다시 검색해 주세요.`, true);
      return;
    }
    if (candidates.length > 1) {
      selection.clearLayers();
      askToChoose(candidates);
      setStatus('검색 결과가 여러 곳입니다. 아래 후보 목록에서 산업단지를 선택해 주세요.');
      return;
    }
    selectIndustry(candidates[0]);
  }

  function selectIndustry(site) {
    selection.clearLayers();
    const networkCounts = networkData.byIndustry[site.id]?.counts || {};
    const insideCounts = networkData.byIndustry[site.id]?.insideFacilityCounts;
    const facilityRows = document.getElementById('facility-count-rows');
    const hubCounts = networkCounts.hub || {};
    const hasPoiData = poiCoverage.has(site.province) || (!site.province && poiCoverage.size > 0);
    const hubLabels = new Map(hubCategories.map(category => [category.key, category.label]));
    const groups = [
      { label: '주거', items: [{ key: 'housing' }] },
      { label: '교통', items: [{ key: 'bus' }, { key: 'rail' }] },
      { label: '보육 및 교육', items: [{ key: 'childcare' }, { label: '초등학교', value: 'elementary' }, { label: '중학교', value: 'middle' }, { label: '고등학교', value: 'highSchools' }, { key: 'education' }] },
      { label: '의료', items: [{ label: '병·의원', value: 'hospitals' }, { label: '응급의료기관', value: 'emergency' }] },
      { label: '상업 및 금융', items: [{ key: 'food_drink' }, { key: 'finance' }] },
      { label: '공원', items: [{ key: 'neighborhood_park' }, { key: 'small_park' }, { key: 'children_park' }, { key: 'waterside_park' }, { key: 'sports_park' }] },
      { label: '복지', items: [{ key: 'welfare' }] },
      { label: '문화 및 체육', items: [{ key: 'sports' }, { key: 'leisure' }, { key: 'beauty' }] },
    ];
    facilityRows.replaceChildren();
    for (const group of groups) {
      group.items.forEach((item, index) => {
        const row = document.createElement('tr');
        if (index === 0) {
          row.classList.add('group-start');
          const groupCell = document.createElement('th');
          groupCell.scope = 'rowgroup';
          groupCell.rowSpan = group.items.length;
          groupCell.textContent = group.label;
          row.append(groupCell);
        }
        const key = item.key;
        const values = item.value ? networkCounts[item.value] || [0, 0, 0] : (hasPoiData ? hubCounts[key] || [0, 0, 0] : null);
        const facilityCell = document.createElement('th');
        facilityCell.scope = 'row';
        facilityCell.textContent = item.label || hubLabels.get(key) || key;
        row.append(facilityCell);
        const insideCell = document.createElement('td');
        const insideValue = item.value ? insideCounts?.[item.value] : insideCounts?.hub?.[key];
        insideCell.textContent = insideCounts ? Number(insideValue || 0).toLocaleString() : '-';
        row.append(insideCell);
        for (let i = 0; i < rings.length; i++) {
          const cell = document.createElement('td');
          cell.textContent = values ? Number(values[i] || 0).toLocaleString() : '-';
          row.append(cell);
        }
        facilityRows.append(row);
      });
    }
    // Draw the widest OSM network catchment first so the closer boundaries remain visible.
    const contours = networkData.byIndustry[site.id]?.contours || [];
    for (const index of [...rings.keys()].reverse()) {
      const radius = rings[index];
      const points = contours[index] || [];
      if (points.length < 3) continue;
      L.polygon(points.map(([lon, lat]) => [lat, lon]), {
        pane: 'circles',
        color: radius === 700 ? '#e36e43' : radius === 2000 ? '#6c89b5' : '#95a5bc',
        weight: radius === 700 ? 2 : 1.4,
        opacity: 0.95,
        fillColor: radius === 700 ? '#f4a275' : '#aabbd2',
        fillOpacity: radius === 700 ? 0.10 : 0.035,
        interactive: false,
        smoothFactor: 2
      }).addTo(selection);
    }
    const icon = L.divIcon({ className: '', html: '<div class="site-marker"></div>', iconSize: [24, 24], iconAnchor: [12, 12] });
    L.marker([site.lat, site.lon], { icon, pane: 'site', zIndexOffset: 1000 })
      .bindPopup(`<div class="site-popup"><strong>${esc(site.name)}</strong></div>`)
      .addTo(selection);

    title.textContent = site.name;
    resultsSubtitle.textContent = `${site.name} 기준 · 각 반경 안의 누적 시설 수`;
    setStatus('선택한 산업단지의 시설별 거리를 표에 갱신했습니다.');
    input.value = site.name;
    const boundary = industrialBoundaryById.get(String(site.id));
    const focusBounds = boundary
      ? L.geoJSON(boundary).getBounds()
      : L.latLngBounds([site.lat, site.lon], [site.lat, site.lon]);
    map.fitBounds(focusBounds.pad(boundary ? 0.08 : 0.085), { maxZoom: 13, animate: true });
  }

  document.getElementById('search-button').addEventListener('click', chooseIndustry);
  input.addEventListener('keydown', event => { if (event.key === 'Enter') chooseIndustry(); });
})();
