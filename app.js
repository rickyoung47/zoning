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
  const circlePane = map.createPane('circles');
  circlePane.style.zIndex = 410;
  const schoolPane = map.createPane('schools');
  schoolPane.style.zIndex = 620;
  const sitePane = map.createPane('site');
  sitePane.style.zIndex = 650;
  const canvas = L.canvas({ padding: 0.35, pane: 'schools' });
  const selection = L.layerGroup().addTo(map);
  let industries = [];
  let schools = [];

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
    fetch('provinces.geojson').then(r => { if (!r.ok) throw new Error('경계 파일 로드 실패'); return r.json(); })
  ]).then(([data, boundaries]) => {
    industries = data.industries.filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lon));
    schools = data.schools.filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lon));
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
    map.fitBounds(regionLayer.getBounds(), { padding: [18, 18] });
    setStatus(`산업단지 ${industries.length.toLocaleString()}곳 중 이름으로 검색할 수 있습니다.`);
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
    const nearby = [];
    const counts = { '초등학교': [0, 0, 0], '중학교': [0, 0, 0] };
    for (const school of schools) {
      const distance = haversine(site.lat, site.lon, school.lat, school.lon);
      if (distance > 5000) continue;
      nearby.push({ school, distance });
      for (let i = 0; i < rings.length; i++) if (distance <= rings[i]) counts[school.level][i]++;
    }

    // Draw the largest ring first so the smaller distance bands stay visible.
    for (const radius of [...rings].reverse()) {
      L.circle([site.lat, site.lon], {
        radius,
        pane: 'circles',
        color: radius === 700 ? '#e36e43' : radius === 2000 ? '#6c89b5' : '#95a5bc',
        weight: radius === 700 ? 2 : 1.4,
        opacity: 0.95,
        fillColor: radius === 700 ? '#f4a275' : '#aabbd2',
        fillOpacity: radius === 700 ? 0.10 : 0.035,
        interactive: false
      }).addTo(selection);
    }
    const icon = L.divIcon({ className: '', html: '<div class="site-marker"></div>', iconSize: [24, 24], iconAnchor: [12, 12] });
    L.marker([site.lat, site.lon], { icon, pane: 'site', zIndexOffset: 1000 })
      .bindPopup(`<div class="site-popup"><strong>${esc(site.name)}</strong><br>주변 5km 내 학교 ${nearby.length.toLocaleString()}곳</div>`)
      .addTo(selection);
    for (const { school, distance } of nearby) {
      const levelClass = school.level === '초등학교' ? 'elementary' : 'middle';
      const icon = L.divIcon({ className: '', html: `<div class="school-marker ${levelClass}"></div>`, iconSize: [9, 9], iconAnchor: [4.5, 4.5] });
      L.marker([school.lat, school.lon], { icon, pane: 'schools' })
        .bindPopup(`<div class="school-popup"><b>${esc(school.name)}</b><br>${esc(school.level)} · ${(distance / 1000).toFixed(2)}km<br>${esc(school.address)}</div>`)
        .addTo(selection);
    }

    for (const [prefix, level] of [['elem', '초등학교'], ['middle', '중학교']]) {
      rings.forEach((radius, i) => {
        document.getElementById(`${prefix}-${radius}`).textContent = counts[level][i].toLocaleString();
      });
    }
    title.textContent = site.name;
    resultsSubtitle.textContent = `${site.name} 기준 · 누적 거리별 학교 수`;
    setStatus(`선택한 산업단지에서 5km 이내 학교 ${nearby.length.toLocaleString()}곳을 표시했습니다.`);
    input.value = site.name;
    map.fitBounds(L.latLngBounds([site.lat, site.lon], [site.lat, site.lon]).pad(0.085), { maxZoom: 13, animate: true });
  }

  document.getElementById('search-button').addEventListener('click', chooseIndustry);
  input.addEventListener('keydown', event => { if (event.key === 'Enter') chooseIndustry(); });
})();
