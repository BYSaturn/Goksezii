// script.js (V2.1 - Master)

const HACKATHON_PARAMS = [
    "wind_speed_10m", "wind_speed_80m", "wind_speed_120m", "wind_speed_180m", 
    "wind_direction_10m", "wind_direction_120m", "wind_direction_80m", "wind_direction_180m", 
    "wind_gusts_10m", "surface_pressure", "cloud_cover_mid", "cloud_cover_high", 
    "cloud_cover_low", "cloud_cover", "visibility", "dew_point_2m", "rain", "snowfall"
];

let spaceports = [];
let logisticsArcs = [];

const equatorPath = [];
for (let lng = -180; lng <= 180; lng += 2) {
    equatorPath.push([0, lng, 0.01]); // lat, lng, altitude
}

window.addEventListener('load', async () => {
    // 0. API'den Lokal Coğrafi ve Lojistik Verileri Çekme
    try {
        const res = await fetch('local_database.json');
        const db = await res.json();
        spaceports = db.spaceports;
        logisticsArcs = db.logisticsArcs;
        
        const select = document.getElementById('spaceportSelect');
        select.innerHTML = spaceports.map(s => `<option value="${s.lat},${s.lng}">🚀 ${s.name}</option>`).join('');
    } catch (e) {
        console.error("Lokal Veritabanı Yüklenemedi!", e);
        return;
    }
    // 1. Globe.gl Başlatma
    let world;
    try {
        const globeContainer = document.getElementById('globeViz');
        world = Globe()(globeContainer)
            .globeImageUrl('https://unpkg.com/three-globe@2.31.0/example/img/earth-night.jpg')
            .bumpImageUrl('https://unpkg.com/three-globe@2.31.0/example/img/earth-topology.png')
            .backgroundImageUrl('https://unpkg.com/three-globe@2.31.0/example/img/night-sky.png')
            .atmosphereColor('#1e4f8a') // Neon parlama azaltıldı
            .atmosphereAltitude(0.08)   // Işık yansıması inceltildi
            .pointOfView({ lat: 35, lng: -20, altitude: 2 })
            .arcsData(logisticsArcs)
            .arcColor(() => ['#ffaa00', '#00f0ff'])
            .arcDashLength(0.4)
            .arcDashGap(0.2)
            .arcDashAnimateTime(1500)
            .arcsTransitionDuration(0)
            .arcLabel('details')
            .pointsData(spaceports)
            .pointColor('color')
            .pointAltitude(d => d.size * 0.05)
            .pointRadius(d => d.size * 0.1)
            .labelsData(spaceports)
            .labelLat(d => d.lat)
            .labelLng(d => d.lng)
            .labelText(d => {
                // Globe.gl WebGL font'u Türkçe büyük harfleri desteklemiyor, ASCII karşılıklarına dönüştür
                return d.name
                    .replace(/İ/g, 'I')
                    .replace(/Ş/g, 'S')
                    .replace(/Ğ/g, 'G')
                    .replace(/Ü/g, 'U')
                    .replace(/Ö/g, 'O')
                    .replace(/Ç/g, 'C')
                    .replace(/ı/g, 'i')
                    .replace(/ş/g, 's')
                    .replace(/ğ/g, 'g')
                    .replace(/ü/g, 'u')
                    .replace(/ö/g, 'o')
                    .replace(/ç/g, 'c');
            })
            .labelSize(0.6)
            .labelAltitude(d => d.size * 0.15)
            .labelDotRadius(0.3)
            .labelColor(() => '#ffffff')
            .labelResolution(2)
            .pathsData([equatorPath])
            .pathColor(() => 'rgba(255, 204, 0, 0.4)')
            .pathStroke(1.2)
            .onPointClick((point) => {
                world.controls().autoRotate = false; // Tıklanınca kamerayı durdur
                showRegionModal(point);
            });
            
        world.controls().autoRotate = true;
        world.controls().autoRotateSpeed = 0.5;
        world.controls().enableDamping = true;

        window.addEventListener('resize', () => {
            world.width(window.innerWidth).height(window.innerHeight);
        });

    } catch (err) {
        console.error("Globe çizim hatası:", err);
    }

    // Modal Events
    const modal = document.getElementById('regionModal');
    const iframe = document.getElementById('modalIframe');
    let selectedPointToLoad = null;

    async function showRegionModal(point) {
        document.getElementById('modalTitle').textContent = point.name;
        document.getElementById('modalCoords').textContent = `${point.lat.toFixed(4)}°${point.lat >= 0 ? 'N' : 'S'}, ${point.lng.toFixed(4)}°${point.lng >= 0 ? 'E' : 'W'}`;
        document.getElementById('modalDesc').textContent = point.desc;
        iframe.src = point.cam;
        
        selectedPointToLoad = point;
        modal.classList.remove('hidden');
        
        const condBox = document.getElementById('modalLaunchConditions');
        if (condBox) {
            condBox.innerHTML = `<span style="color:var(--accent-color)"><i class="ri-loader-4-line ri-spin"></i> Anlık Radar Verisi Yükleniyor...</span>`;
            
            // Standart meteoroloji kartları
            let weatherCardsHtml = `
                <div style="background:rgba(0,0,0,0.5); padding:8px 15px; border-radius:4px; font-weight:bold; border-left:3px solid var(--accent-color)">Kamera Teyidi (CANLI): <span id="mc_status">BEKLENİYOR</span></div>
                <div style="background:rgba(0,0,0,0.5); padding:8px 15px; border-radius:4px;"><i class="ri-cloud-line"></i> Bulut: <b id="mc_cloud">--</b></div>
                <div style="background:rgba(0,0,0,0.5); padding:8px 15px; border-radius:4px;"><i class="ri-windy-line"></i> Rüzgar: <b id="mc_wind">--</b></div>
                <div style="background:rgba(0,0,0,0.5); padding:8px 15px; border-radius:4px;"><i class="ri-temp-hot-line"></i> Sıcaklık: <b id="mc_temp">--</b></div>
            `;

            // EKVATOR AVANTAJI PANELİ — sadece equatorial flag varken göster
            if (point.equatorial) {
                const EARTH_ROT_MAX = 465.1; // m/s (Ekvator'da Dünya dönüş hızı)
                const alcantara_lat_rad = Math.abs(point.lat) * Math.PI / 180;
                const samsun_lat_rad = 41.29 * Math.PI / 180;
                const alcantara_speed = EARTH_ROT_MAX * Math.cos(alcantara_lat_rad);
                const samsun_speed = EARTH_ROT_MAX * Math.cos(samsun_lat_rad);
                const speed_diff = alcantara_speed - samsun_speed;
                const fuel_saving_pct = ((speed_diff / 9400) * 100).toFixed(1); // GTO için ~9.4km/s delta-V
                
                weatherCardsHtml += `
                <div id="equatorialPanel" style="
                    grid-column: 1 / -1;
                    margin-top: 12px;
                    padding: 14px;
                    background: linear-gradient(135deg, rgba(255,230,0,0.08), rgba(255,140,0,0.05));
                    border: 1px solid rgba(255,230,0,0.35);
                    border-left: 4px solid #ffe600;
                    border-radius: 8px;
                    font-size: 0.82rem;
                    color: var(--text-secondary);
                ">
                    <div style="font-size:0.95rem; font-weight:700; color:#ffe600; margin-bottom:10px;">
                        <i class="ri-earth-line"></i> EKVATOR FIRLATIM AVANTAJI ANALİZİ
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;">
                        <div style="background:rgba(0,0,0,0.4); padding:8px 12px; border-radius:6px; border-left:3px solid #ff003c;">
                            <div style="font-size:0.7rem; color:#aaa;">🇹🇷 Samsun (41.29°K)</div>
                            <div style="font-size:1.1rem; font-weight:700; color:#fff;">${samsun_speed.toFixed(1)} <span style="font-size:0.7rem">m/s</span></div>
                            <div style="font-size:0.65rem; color:#aaa;">Dünya dönüş katkısı</div>
                        </div>
                        <div style="background:rgba(0,0,0,0.4); padding:8px 12px; border-radius:6px; border-left:3px solid #ffe600;">
                            <div style="font-size:0.7rem; color:#aaa;">🇧🇷 Alcântara (${Math.abs(point.lat).toFixed(2)}°G)</div>
                            <div style="font-size:1.1rem; font-weight:700; color:#ffe600;">${alcantara_speed.toFixed(1)} <span style="font-size:0.7rem">m/s</span></div>
                            <div style="font-size:0.65rem; color:#aaa;">Dünya dönüş katkısı</div>
                        </div>
                    </div>

                    <div style="background:rgba(255,230,0,0.1); padding:10px 14px; border-radius:6px; margin-bottom:10px; border:1px solid rgba(255,230,0,0.2);">
                        <span style="color:#ffe600; font-weight:700;">+${speed_diff.toFixed(0)} m/s</span> ekstra başlangıç hızı &nbsp;→&nbsp;
                        Yakıt sarfiyatında <span style="color:#ffe600; font-weight:700;">~%${fuel_saving_pct} tasarruf</span>
                    </div>

                    <div style="border-top:1px solid rgba(255,255,255,0.1); padding-top:10px;">
                        <div style="color:#fff; font-weight:600; margin-bottom:6px;"><i class="ri-question-line"></i> Aynı Anda Kalksa Bile?</div>
                        <div style="line-height:1.6;">
                            Samsun'dan fırlatılan bir roket, Alcântara'dan kalkana göre <b style="color:#ff6b6b;">+${speed_diff.toFixed(0)} m/s</b> daha az başlangıç hızına sahip olur.
                            Bu fark, <b>Dünya'nın kendi ekseni etrafındaki dönüşünden</b> kaynaklanan "serbest" hızdır.
                            Jeosenkron yörüngeye ulaşmak için gereken delta-V'yi <b style="color:#ffe600;">~${fuel_saving_pct}% daha fazla yakıtla</b> kapatmak zorundadır.
                            <br><br>
                            <span style="color:#aaa; font-size:0.75rem;">Formül: V_dönüş = 465.1 × cos(enlem°) m/s | GTO delta-V ≈ 9.4 km/s</span>
                        </div>
                    </div>

                    <div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:6px;">
                        <span style="background:rgba(255,230,0,0.15); border:1px solid rgba(255,230,0,0.3); padding:3px 8px; border-radius:12px; font-size:0.7rem; color:#ffe600;"><i class="ri-check-line"></i> Atlantik Okyanusu Kıyısı</span>
                        <span style="background:rgba(255,230,0,0.15); border:1px solid rgba(255,230,0,0.3); padding:3px 8px; border-radius:12px; font-size:0.7rem; color:#ffe600;"><i class="ri-check-line"></i> Düşen Roket Aşamaları = Okyanus</span>
                        <span style="background:rgba(255,230,0,0.15); border:1px solid rgba(255,230,0,0.3); padding:3px 8px; border-radius:12px; font-size:0.7rem; color:#ffe600;"><i class="ri-check-line"></i> Tam Ekvator Penceresi</span>
                        <span style="background:rgba(255,230,0,0.15); border:1px solid rgba(255,230,0,0.3); padding:3px 8px; border-radius:12px; font-size:0.7rem; color:#ffe600;"><i class="ri-check-line"></i> Tüm Yörüngeler Erişilebilir</span>
                    </div>
                </div>`;
            }
            
            condBox.innerHTML = weatherCardsHtml;
        }
    }

    document.getElementById('closeModal').addEventListener('click', () => {
        modal.classList.add('hidden');
        iframe.src = ""; // Stop video playback
    });

    document.getElementById('selectRegionBtn').addEventListener('click', () => {
        if (selectedPointToLoad) {
            const val = `${selectedPointToLoad.lat},${selectedPointToLoad.lng}`;
            const select = document.getElementById('spaceportSelect');
            
            // Seçenekler arasında doğru value'yu bul ve seç
            Array.from(select.options).forEach(opt => {
                if(opt.value.includes(selectedPointToLoad.lat.toFixed(4))) {
                    select.value = opt.value;
                }
            });

            modal.classList.add('hidden');
            iframe.src = "";
            triggerSimulation(selectedPointToLoad.lat, selectedPointToLoad.lng);
        }
    });

    // Algo Tooltip Events
    const algoBtn = document.getElementById('algoInfoBtn');
    const algoTooltip = document.getElementById('algoTooltip');
    algoBtn.addEventListener('click', () => {
        algoTooltip.classList.toggle('active');
    });

    // Ekvator Toggle Button
    let isEquatorVisible = true;
    const toggleEqBtn = document.getElementById('toggleEquatorBtn');
    if(toggleEqBtn) {
        toggleEqBtn.classList.add('active');
        toggleEqBtn.addEventListener('click', () => {
            isEquatorVisible = !isEquatorVisible;
            if (isEquatorVisible) {
                world.pathsData([equatorPath]);
                toggleEqBtn.classList.add('active');
                toggleEqBtn.innerHTML = '<i class="ri-arrow-left-right-line"></i> Ekvator: AÇIK';
            } else {
                world.pathsData([]);
                toggleEqBtn.classList.remove('active');
                toggleEqBtn.innerHTML = '<i class="ri-arrow-left-right-line"></i> Ekvator: KAPALI';
            }
        });
    }

    // Terminal Toggle Button
    let isTerminalOp = false;
    const toggleTermBtn = document.getElementById('toggleTerminalBtn');
    const termOverlay = document.getElementById('terminalOverlay');
    if (toggleTermBtn && termOverlay) {
        toggleTermBtn.addEventListener('click', () => {
            isTerminalOp = !isTerminalOp;
            if (isTerminalOp) {
                termOverlay.classList.remove('hidden');
                toggleTermBtn.classList.add('active');
                toggleTermBtn.style.color = "var(--success-color)";
                toggleTermBtn.style.borderColor = "var(--success-color)";
                toggleTermBtn.innerHTML = '<i class="ri-terminal-window-line"></i> Algoritma Terminali: AÇIK';
                terminalLog(`[SYSTEM] Manuel override! CORTEX_TERMINAL Aktifleştirildi.`, 'sys');
            } else {
                termOverlay.classList.add('hidden');
                toggleTermBtn.classList.remove('active');
                toggleTermBtn.style.color = "var(--text-secondary)";
                toggleTermBtn.style.borderColor = "var(--danger-color)";
                toggleTermBtn.innerHTML = '<i class="ri-terminal-window-line"></i> Algoritma Terminali: KAPALI';
            }
        });
    }

    // Lojistik Toggle Button Events
    let isArcsVisible = true;
    const toggleArcsBtn = document.getElementById('toggleLogisticsBtn');
    toggleArcsBtn.classList.add('active'); // active statüsü default

    toggleArcsBtn.addEventListener('click', () => {
        isArcsVisible = !isArcsVisible;
        if (isArcsVisible) {
            world.arcsData(logisticsArcs);
            toggleArcsBtn.classList.add('active');
            toggleArcsBtn.innerHTML = '<i class="ri-flow-chart"></i> Lojistik Ağlar Çizim: AÇIK';
        } else {
            world.arcsData([]);
            toggleArcsBtn.classList.remove('active');
            toggleArcsBtn.innerHTML = '<i class="ri-flow-chart"></i> Lojistik Ağlar Çizim: KAPALI';
        }
    });

    // Terminal Log Sistemi
    function terminalLog(msg, type = 'info') {
        const stream = document.getElementById('terminalStream');
        if (!stream) return;
        const line = document.createElement('div');
        let typeClass = '';
        if (type === 'warn') typeClass = 'term-warn';
        if (type === 'err') typeClass = 'term-err';
        if (type === 'sys') typeClass = 'term-sys';
        line.className = `term-line ${typeClass}`;
        
        const d = new Date();
        const timeStr = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}.${d.getMilliseconds().toString().padStart(3,'0')}`;
        
        line.innerHTML = `<span class="term-time">[${timeStr}]</span> ${msg}`;
        stream.appendChild(line);
        if (stream.childNodes.length > 50) stream.removeChild(stream.firstChild);
        stream.scrollTop = stream.scrollHeight;
    }

    // 2. Open Meteo İstek Mantığı
    let currentWeatherData = null;
    let vehProgress = 85;
    let fuelProgress = 62;

    // Seçilen Bölge (Init Terminal)
    document.getElementById('spaceportSelect').addEventListener('change', (e) => {
        const coords = e.target.value.split(',');
        const lat = parseFloat(coords[0]);
        const lng = parseFloat(coords[1]);
        
        const pt = spaceports.find(s => Math.abs(s.lat - lat) < 0.01 && Math.abs(s.lng - lng) < 0.01);
        if (pt) {
            terminalLog(`[CMD] Hedef kilitlendi: ${pt.name} (LAT/LNG: {${lat}, ${lng}})`, 'sys');
        }

        // Kamerayı bölgeye odakla
        world.pointOfView({ lat: lat, lng: lng, altitude: 2 }, 2000);
        
        // Yeni veriyi çek
        fetchWeather(lat, lng).then(data => {
            if (data) {
                currentWeatherData = data;
                updateUI(data);
            }
        });
    });

    async function fetchWeather(lat, lng) {
        try {
            terminalLog(`[API_REQ] REST GET Canlı Sensör Akışı Başlatılıyor: lat=${lat}&lon=${lng}...`, 'sys');
            const API = "https://api.open-meteo.com/v1/forecast";
            
            // KULLANICI İSTEĞİ: Open-Meteo API 'Hourly' bloğundan anlık zamana en yakın olanı çekeceğiz
            const url = `${API}?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,precipitation,wind_speed_10m,wind_speed_120m,wind_speed_80m,wind_speed_180m,wind_direction_10m,wind_direction_80m,wind_direction_120m,wind_direction_180m,temperature_80m,temperature_120m,temperature_180m,wind_gusts_10m,cloud_cover_high,cloud_cover_mid,cloud_cover_low,cloud_cover,surface_pressure,pressure_msl,visibility,rain,precipitation_probability&forecast_days=3&timeformat=unixtime`;
            
            const req = await fetch(url);
            if (!req.ok) throw new Error("API sunucusu yanıt vermedi.");
            
            const raw = await req.json();
            
            terminalLog(`[SYS] API Bağlantısı Başarılı. Sensör Baz Verileri Yüklendi.`);
            document.getElementById('systemStatus').innerHTML = `Son Çekim: ${new Date().toLocaleTimeString()} - API BAĞLANTISI`;
            
            // Şu anki gerçek zamanı bul (O saniyenin gerçek saat dilimi)
            const nowUnix = Math.floor(Date.now() / 1000);
            let timeIdx = 0;
            let minDiff = Infinity;
            if (raw.hourly && raw.hourly.time) {
                raw.hourly.time.forEach((t, i) => {
                    const diff = Math.abs(t - nowUnix);
                    if (diff < minDiff) { minDiff = diff; timeIdx = i; }
                });
            }
            
            const hr = raw.hourly;
            const boundedIdx = timeIdx;
            
            window.baseLiveData = {
                wind_speed_10m: hr.wind_speed_10m[boundedIdx],
                wind_gusts_10m: hr.wind_gusts_10m[boundedIdx],
                surface_pressure: hr.surface_pressure[boundedIdx],
                cloud_cover: hr.cloud_cover[boundedIdx],
                visibility: hr.visibility[boundedIdx] ?? 30000,
                precipitation: hr.precipitation[boundedIdx],
                rain: hr.rain?.[boundedIdx] ?? 0,
                precipitation_probability: hr.precipitation_probability?.[boundedIdx] ?? 0,
                temperature_2m: hr.temperature_2m[boundedIdx],
                pressure_msl: hr.pressure_msl[boundedIdx] ?? (hr.surface_pressure[boundedIdx] + 2),
                wind_speed_80m: hr.wind_speed_80m[boundedIdx],
                wind_speed_120m: hr.wind_speed_120m[boundedIdx],
                wind_speed_180m: hr.wind_speed_180m[boundedIdx],
                temperature_80m: hr.temperature_80m[boundedIdx],
                temperature_120m: hr.temperature_120m[boundedIdx],
                temperature_180m: hr.temperature_180m[boundedIdx]
            };
            
            return window.baseLiveData;
        } catch (err) {
            terminalLog(`[API_ERROR] Veri Çekim Hatası: ${err.message}`, 'err');
            console.error(err);
            return null;
        }
    }

    // 3. UI Çizim
    function updateUI(data) {
        const grid = document.getElementById('weatherGrid');
        const bars = document.getElementById('windBars');
        
        if (!data) {
            grid.innerHTML = '<div style="color:#ff003c; padding:2rem;">Veri Çekim Hatası...</div>';
            return;
        }

        grid.innerHTML = `
            <div class="data-card"><div class="d-label"><i class="ri-windy-line"></i> Yüzey Rüzgarı</div><div class="d-value">${data.wind_speed_10m.toFixed(1)} km/s</div></div>
            <div class="data-card"><div class="d-label"><i class="ri-typhoon-line"></i> Rüzgar Hamlesi</div><div class="d-value">${data.wind_gusts_10m.toFixed(1)} km/s</div></div>
            <div class="data-card"><div class="d-label"><i class="ri-cloud-line"></i> Bulut Oranı</div><div class="d-value">${data.cloud_cover}%</div></div>
            <div class="data-card"><div class="d-label"><i class="ri-dashboard-3-line"></i> Atmosfer Basıncı</div><div class="d-value">${data.surface_pressure.toFixed(1)} hPa</div></div>
            <div class="data-card"><div class="d-label"><i class="ri-eye-line"></i> Görüş Mesafesi</div><div class="d-value">${(data.visibility/1000).toFixed(1)} km</div></div>
            <div class="data-card"><div class="d-label"><i class="ri-heavy-showers-line"></i> Yağış (Precip)</div><div class="d-value">${data.precipitation} mm</div></div>
        `;

        const layers = [
            { a: '180m', v: data.wind_speed_180m },
            { a: '120m', v: data.wind_speed_120m },
            { a: '80m',  v: data.wind_speed_80m },
            { a: '10m',  v: data.wind_speed_10m }
        ];

        bars.innerHTML = layers.map(l => {
            const w = Math.min((l.v / 120) * 100, 100);
            let c = l.v > 65 ? 'var(--danger-color)' : l.v > 45 ? 'var(--warning-color)' : 'var(--success-color)';
            return `<div class="wind-layer"><div class="w-alt">${l.a}</div><div class="w-bar-bg"><div class="w-bar-fill" style="width:${w}%;background:${c}"></div></div><div class="w-val">${l.v.toFixed(1)} km/s</div></div>`;
        }).join('');
        
        calcScore(data);
    }

    function calcScore(d) {
        let score = 100;
        let reasons = [];
        
        terminalLog(`[CALC] Fırlatma Uygunluk Puanlaması (GO/NO-GO) Başlatıldı...`, 'sys');

        if (d.wind_speed_10m > 40) { 
            score -= 40; reasons.push("10m şiddetli yüzey rüzgarı."); 
            terminalLog(`[LOGIC] Yüzey rüzgarı limiti %40 aşıldı! (${d.wind_speed_10m.toFixed(1)} km/s) -> Puan: -40`, 'err');
        } else if (d.wind_speed_10m > 25) { 
            score -= 15; reasons.push("Uyarı: Yüzey rüzgarı toleransı."); 
            terminalLog(`[LOGIC] Yüzey rüzgarı sınır değerlerde (${d.wind_speed_10m.toFixed(1)} km/s) -> Puan: -15`, 'warn');
        } else {
            terminalLog(`[LOGIC] Yüzey Rüzgar Profili: GÜVENLİ (${d.wind_speed_10m.toFixed(1)} km/s)`, 'info');
        }

        if (d.wind_speed_180m > 65) { 
            score -= 30; reasons.push("180m sert İrtifa Rüzgarı."); 
            terminalLog(`[LOGIC] İrtifa rüzgar makası tehlikesi! (${d.wind_speed_180m.toFixed(1)} km/s) -> Puan: -30`, 'err');
        } else {
            terminalLog(`[LOGIC] Üst Atmosfer Akımı: GÜVENLİ (${d.wind_speed_180m.toFixed(1)} km/s)`, 'info');
        }
        
        if (d.temperature_180m !== undefined && d.temperature_2m !== undefined) {
            terminalLog(`[PYTHON_SYNC] Termal İrtifa Profili: Yüzey(2m)=${d.temperature_2m.toFixed(1)}°C | 80m=${d.temperature_80m.toFixed(1)}°C | 180m=${d.temperature_180m.toFixed(1)}°C`, 'sys');
            if (d.temperature_180m < -50 || d.temperature_180m > 60) {
                 score -= 15; reasons.push("Aşırı termal stres tespit edildi.");
                 terminalLog(`[LOGIC] Kritik İrtifa Sıcaklık Sınırı İhlali! (${d.temperature_180m.toFixed(1)}°C) -> -15 Puan`, 'warn');
            }
        }

        if (d.precipitation > 0.5) { 
            score -= 20; reasons.push("Aktif veya olası yağış/nem."); 
            terminalLog(`[LOGIC] Aktif yağış/nem/buzlanma ihtimali (${d.precipitation} mm) -> Puan: -20`, 'err');
        } else {
            terminalLog(`[LOGIC] Yağış Sensörü: TEMİZ (${d.precipitation} mm)`, 'info');
        }

        if (d.cloud_cover > 85) { 
            score -= 10; reasons.push("Yoğun bulutlanma tespit edildi."); 
            terminalLog(`[LOGIC] Yüksek bulutlanma tabakası (%${d.cloud_cover}) -> Puan: -10`, 'warn');
        }

        if (d.visibility < 3000) { 
            score -= 30; reasons.push("Görüş mesafesi 3km'nin altında."); 
            terminalLog(`[LOGIC] Düşük görüş mesafesi (< 3000m) FTS sensör engeli -> Puan: -30`, 'err');
        }

        if (vehProgress < 90 || fuelProgress < 80) { 
            score -= 15; reasons.push("Lojistik matrisi henüz güvenli değil."); 
            terminalLog(`[LOGIC] Lojistik/Yakıt GSE dolumu tamamlanmadı -> Puan: -15`, 'warn');
        }

        score = Math.floor(Math.max(0, score));
        terminalLog(`[RESULT] Nihai Fırlatma Skoru = ${score}/100`, 'sys');

        document.getElementById('scoreCircle').setAttribute('stroke-dasharray', `${score}, 100`);
        document.getElementById('scoreValue').textContent = `${score}%`;

        let statusText = document.getElementById('decisionText');
        let reasonText = document.getElementById('decisionReason');
        let infoBtn = document.getElementById('algoInfoBtn');
        
        if (score >= 85) {
            statusText.textContent = "GO FOR LAUNCH";
            statusText.style.color = "var(--success-color)";
            reasonText.textContent = "Tüm meteorolojik istasyonlar ve lojistik uygun.";
            document.getElementById('scoreCircle').style.stroke = "var(--success-color)";
            infoBtn.style.color = "var(--success-color)";
            terminalLog(`[SYS_CMD] TUA_COMMAND: GÖREV ONAYLANDI (GO) 🚀`, 'sys');
        } else if (score >= 60) {
            statusText.textContent = "HOLD (TOLERANSLI)";
            statusText.style.color = "var(--warning-color)";
            reasonText.textContent = reasons[0] || "Telsiz sessizliği. Değerler inceleniyor.";
            document.getElementById('scoreCircle').style.stroke = "var(--warning-color)";
            infoBtn.style.color = "var(--warning-color)";
            terminalLog(`[SYS_CMD] TUA_COMMAND: GÖREV BEKLEMEDE (STANDBY) ⚠️`, 'warn');
        } else {
            statusText.textContent = "NO-GO / SCRUB";
            statusText.style.color = "var(--danger-color)";
            reasonText.textContent = "FIRLATMA İPTAL. " + reasons.join(' ');
            document.getElementById('scoreCircle').style.stroke = "var(--danger-color)";
            infoBtn.style.color = "var(--danger-color)";
            terminalLog(`[SYS_CMD] TUA_COMMAND: FIRLATMA İPTAL (NO-GO) 🔴`, 'err');
        }
    }

    // 4. Etkileşim
    async function triggerSimulation(forcedLat = null, forcedLng = null) {
        let lat, lng;
        if (forcedLat && forcedLng) {
            lat = forcedLat; lng = forcedLng;
        } else {
            const val = document.getElementById('spaceportSelect').value;
            [lat, lng] = val.split(',');
        }
        
        document.getElementById('coordDisplay').textContent = `${parseFloat(lat).toFixed(2)}°N, ${parseFloat(lng).toFixed(2)}°E`;
        
        if (world) {
            world.pointOfView({ lat: parseFloat(lat), lng: parseFloat(lng), altitude: 1.5 }, 2000);
            setTimeout(() => {
                world.controls().autoRotate = false;
            }, 2000);
        }
        
        const data = await fetchWeather(lat, lng);
        currentWeatherData = data;
        updateUI(data);
    }

    document.getElementById('spaceportSelect').addEventListener('change', () => triggerSimulation());
    document.getElementById('recalcBtn').addEventListener('click', () => {
        document.getElementById('recalcBtn').innerHTML = `<i class="ri-loader-4-line ri-spin"></i> Yenileniyor...`;
        triggerSimulation().then(() => {
            setTimeout(() => {
                document.getElementById('recalcBtn').innerHTML = `<i class="ri-refresh-line"></i> Akışı Yenile & Simüle Et`;
            }, 800);
        });
    });

    // Ana Loop: Lojistik Güncellemesi
    setInterval(() => {
        if(vehProgress < 100) vehProgress++;
        if(fuelProgress < 100) fuelProgress += 2;
        
        document.querySelector('.veh-fill').style.width = vehProgress + '%';
        document.getElementById('veh-status').textContent = vehProgress + (vehProgress===100?'% - Hazır':'% - Taşınmada');
        
        const fuel = document.querySelector('.fuel-fill');
        fuel.style.width = fuelProgress + '%';
        if (fuelProgress >= 80) fuel.style.background = 'var(--success-color)';
        document.getElementById('fuel-status').textContent = fuelProgress + (fuelProgress===100?'% - Dolu':'% - Kritik');
    }, 4000);

    // Gerçek Zamanlı 'Live Sensor' Akışı (1 Hz Micro-Fluctuation Engine)
    setInterval(() => {
        if (!window.baseLiveData) return;
        const bd = window.baseLiveData;
        
        // Pseudo-Sensor Verisi Üretimi: Tabana Küçük Titreşimler (Gürültü) Ekle
        const d = {
            ...bd, // Yeni eklenen tüm statik API parametrelerini otomatik koru (Örn: rain)
            wind_speed_10m: Math.max(0, bd.wind_speed_10m + (Math.random() - 0.5) * 0.8),
            wind_gusts_10m: Math.max(0, bd.wind_gusts_10m + (Math.random() - 0.5) * 1.5),
            surface_pressure: bd.surface_pressure + (Math.random() - 0.5) * 0.2,
            cloud_cover: Math.min(100, Math.max(0, bd.cloud_cover + Math.round((Math.random() - 0.5) * 2))),
            visibility: Math.max(0, bd.visibility + (Math.random() - 0.5) * 150),
            temperature_2m: bd.temperature_2m + (Math.random() - 0.5) * 0.1,
            pressure_msl: bd.pressure_msl + (Math.random() - 0.5) * 0.2,
            wind_speed_80m: Math.max(0, bd.wind_speed_80m + (Math.random() - 0.5) * 1.0),
            wind_speed_120m: Math.max(0, bd.wind_speed_120m + (Math.random() - 0.5) * 1.2),
            wind_speed_180m: Math.max(0, bd.wind_speed_180m + (Math.random() - 0.5) * 1.5),
            temperature_80m: bd.temperature_80m + (Math.random() - 0.5) * 0.1,
            temperature_120m: bd.temperature_120m + (Math.random() - 0.5) * 0.1,
            temperature_180m: bd.temperature_180m + (Math.random() - 0.5) * 0.1
        };
        
        // GUI Güncellemesi
        const progressStr = `CANLI SENSÖR: AKTİF (${new Date().toLocaleTimeString()})`;
        document.getElementById('lastSyncTime').textContent = progressStr;
        
        window.simSecondsCounter = (window.simSecondsCounter || 0) + 1;
        if (window.simSecondsCounter % 5 === 0) {
            terminalLog(`[1_HZ_TELEM] Sensörler: Rüzgar=${d.wind_speed_10m.toFixed(1)}km/s | Rakım(180m)=${d.wind_speed_180m.toFixed(1)}km/s | Isı=${d.temperature_2m.toFixed(1)}°C`, 'info');
        }
        
        // Update main dashboard UI
        updateUI(d);
        
        // Update Modal if open
        const statusEl = document.getElementById('mc_status');
        if (statusEl && !document.getElementById('regionModal').classList.contains('hidden')) {
            let s = 100;
            if (d.wind_speed_10m > 40) s -= 40; else if(d.wind_speed_10m > 25) s -= 15;
            if (d.cloud_cover > 85) s -= 10;
            if (d.precipitation > 0.5) s -= 20;
            if (d.visibility < 3000) s -= 30;
            s = Math.max(0, s);
            
            let status = s >= 85 ? '<span style="color:var(--success-color)">GO</span>' : (s >= 60 ? '<span style="color:var(--warning-color)">HOLD</span>' : '<span style="color:var(--danger-color)">NO-GO</span>');
            
            document.getElementById('mc_status').innerHTML = status;
            document.getElementById('mc_cloud').innerText = `%${Math.round(d.cloud_cover)}`;
            document.getElementById('mc_wind').innerText = `${d.wind_speed_10m.toFixed(1)} km/s`;
            document.getElementById('mc_temp').innerText = `${d.temperature_2m.toFixed(1)}°C`;
        }
    }, 1000);

    // Her 3 dakikada bir ana API senkronizasyonu
    setInterval(() => {
        triggerSimulation();
    }, 180000);

    // Initial Trigger
    triggerSimulation();
});
