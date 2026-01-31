/**
 * Real-Time Weather Application Controller
 * Updated to fix UI overlap and grid layout issues
 * Added: Clickable 10-day forecast details
 */

const cityInput = document.getElementById('citySearch');
const searchBtn = document.getElementById('searchBtn');
const locationBtn = document.getElementById('locationBtn');
const statusDiv = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const weatherApp = document.getElementById('weatherContainer');

let weatherData = null; // Store data globally for interactions

// Initialize
window.addEventListener('load', initApp);

// Controls
searchBtn.addEventListener('click', handleManualSearch);
cityInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleManualSearch();
});
locationBtn.addEventListener('click', initApp);

function initApp() {
    if (navigator.geolocation) {
        setLoadingState("Finding your current location...");
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const { latitude, longitude } = pos.coords;
                // Fetch location with pin/zip code
                const cityDetails = await reverseLookup(latitude, longitude);
                getWeather(latitude, longitude, cityDetails);
            },
            () => {
                setLoadingState("Location denied. Please search manually.");
            }
        );
    } else {
        setLoadingState("Geolocation not supported.");
    }
}

async function handleManualSearch() {
    const val = cityInput.value.trim();
    if (!val) return;

    setLoadingState(`Searching for ${val}...`);
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(val)}`);
        const results = await res.json();
        if (results.length > 0) {
            const data = results[0];
            const lat = data.lat;
            const lon = data.lon;
            
            // Construct name from search result
            let displayName = data.address.city || data.address.town || data.address.village || data.address.county || "Unknown Location";
            if (data.address.postcode) {
                displayName += `, ${data.address.postcode}`;
            }

            getWeather(lat, lon, displayName);
        } else {
            setLoadingState("City not found.");
        }
    } catch {
        setLoadingState("Search connection error.");
    }
}

async function getWeather(lat, lon, cityName) {
    try {
        // Added wind_speed_10m_max to daily query for detailed views
        const endpoint = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max,precipitation_probability_max,wind_speed_10m_max&timezone=auto&forecast_days=10`;
        const res = await fetch(endpoint);
        const data = await res.json();
        
        weatherData = { ...data, cityName }; // Store for interactions
        populateUI(weatherData);
    } catch {
        setLoadingState("Weather data unavailable.");
    }
}

function populateUI(data) {
    // 1. Force Hide Status (Loader)
    statusDiv.style.display = 'none'; 
    statusDiv.classList.add('hidden'); // Double safety

    // 2. Force Show App
    weatherApp.style.display = 'block'; // Explicit display
    weatherApp.classList.remove('hidden');

    // 3. Grid Fix for Laptop screens (Prevent blowout)
    const forecastSection = document.querySelector('.forecast-section');
    if (forecastSection) {
        forecastSection.style.minWidth = '0'; 
    }

    // Default to showing current weather. This will also render hourly list.
    renderMainView(data, -1);

    // Lists (Daily is static list, hourly is dynamic inside renderMainView)
    renderDaily(data.daily);
}

/**
 * Renders the main card. 
 * index -1 = Current Weather
 * index >= 0 = Daily Forecast View
 */
function renderMainView(data, index) {
    const isCurrent = index === -1;
    let meta, tempDisplay, dateString, precipVal, humidityVal, windVal, uvVal;

    if (isCurrent) {
        const cur = data.current;
        meta = parseWeather(cur.weather_code, cur.is_day);
        
        dateString = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        tempDisplay = `${Math.round(cur.temperature_2m)}`;
        
        precipVal = `${cur.precipitation} mm`;
        humidityVal = `${cur.relative_humidity_2m}%`;
        windVal = `${Math.round(cur.wind_speed_10m)} km/h`;
        uvVal = data.daily.uv_index_max[0];
    } else {
        const day = data.daily;
        meta = parseWeather(day.weather_code[index], 1); // Always day icon for forecast
        
        const date = new Date(day.time[index]);
        dateString = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        
        // Show Max / Min for forecast
        tempDisplay = `<span style="font-size: 0.6em">${Math.round(day.temperature_2m_max[index])}° / ${Math.round(day.temperature_2m_min[index])}</span>`;
        
        precipVal = `${day.precipitation_probability_max[index]}%`;
        humidityVal = "--"; // Daily humidity not available in this query
        windVal = `${Math.round(day.wind_speed_10m_max[index])} km/h`;
        uvVal = day.uv_index_max[index];
    }

    // Header
    document.getElementById('cityName').innerText = data.cityName;
    document.getElementById('currentDay').innerText = dateString;
    document.getElementById('conditionDesc').innerText = meta.label;
    
    // Handle Temp HTML specially to support font-size change for range
    const tempEl = document.getElementById('tempNow');
    if (isCurrent) {
        tempEl.innerText = tempDisplay;
        document.querySelector('.deg').style.display = 'inline';
    } else {
        tempEl.innerHTML = tempDisplay;
        document.querySelector('.deg').style.display = 'none'; // Hide degree symbol for range view
    }
    
    document.getElementById('weatherIcon').src = meta.icon;

    // Grid
    document.getElementById('precip').innerText = precipVal;
    document.getElementById('humidity').innerText = humidityVal;
    document.getElementById('wind').innerText = windVal;
    document.getElementById('uv').innerText = uvVal;

    // Theme & Animations
    document.body.className = `theme-${meta.theme}`;

    // Update Hourly List based on selection
    renderHourly(data.hourly, index, data.daily);
}

function renderHourly(hourly, dayIndex = -1, daily = null) {
    const box = document.getElementById('hourlyWrapper');
    box.innerHTML = '';
    
    let startIdx = 0;
    
    if (dayIndex === -1) {
        // Current: Start from now
        const now = new Date();
        startIdx = hourly.time.findIndex(t => new Date(t) > now);
        if (startIdx === -1) startIdx = 0;
    } else if (daily) {
        // Specific Day: Match the date string (YYYY-MM-DD)
        const targetDate = daily.time[dayIndex];
        startIdx = hourly.time.findIndex(t => t.startsWith(targetDate));
        if (startIdx === -1) startIdx = 0;
    }

    // Render 24 hours from the start index
    for (let i = startIdx; i < startIdx + 24; i++) {
        if (!hourly.time[i]) break; // Safety check
        const d = new Date(hourly.time[i]);
        const h = d.getHours();
        const label = h === 0 ? '12 AM' : h > 12 ? (h - 12) + ' PM' : h + ' AM';
        const m = parseWeather(hourly.weather_code[i], h > 6 && h < 19 ? 1 : 0);

        const el = document.createElement('div');
        el.className = 'hour-card';
        
        let timeLabel = label;
        // Only show "Now" if we are in current view and it's the first item
        if (dayIndex === -1 && i === startIdx) timeLabel = 'Now';

        el.innerHTML = `
            <p class="h-time">${timeLabel}</p>
            <img src="${m.icon}" class="h-icon" alt="icon">
            <p class="h-temp">${Math.round(hourly.temperature_2m[i])}°</p>
        `;
        
        // Click to return to current view
        el.style.cursor = 'pointer';
        el.onclick = () => {
             renderMainView(weatherData, -1);
             // Reset daily row styling
             document.querySelectorAll('.day-row').forEach(r => r.style.background = 'rgba(255,255,255,0.4)');
        };
        box.appendChild(el);
    }
}

function renderDaily(daily) {
    const box = document.getElementById('dailyWrapper');
    box.innerHTML = '';
    
    for (let i = 0; i < daily.time.length; i++) {
        const d = new Date(daily.time[i]);
        const day = i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'long' });
        const m = parseWeather(daily.weather_code[i], 1);
        const precip = daily.precipitation_probability_max[i];

        const row = document.createElement('div');
        row.className = 'day-row';
        row.style.cursor = 'pointer'; // Make it look clickable
        
        // Add click handler to show details for this day
        row.onclick = () => {
            renderMainView(weatherData, i);
            // Visual feedback: clear other active states (optional simple highlight)
            document.querySelectorAll('.day-row').forEach(r => r.style.background = 'rgba(255,255,255,0.4)');
            row.style.background = 'rgba(255,255,255,0.9)';
        };

        row.innerHTML = `
            <span class="d-name">${day}</span>
            ${precip > 0 ? `<span class="d-precip"><i class="fas fa-droplet"></i> ${precip}%</span>` : '<span></span>'}
            <img src="${m.icon}" class="d-icon" alt="icon">
            <div class="d-temps">
                <span class="d-high">${Math.round(daily.temperature_2m_max[i])}°</span>
                <span class="d-low">${Math.round(daily.temperature_2m_min[i])}°</span>
            </div>
        `;
        box.appendChild(row);
    }
}

function parseWeather(code, isDay) {
    const b = isDay ? 'd' : 'n';
    if (code === 0) return { label: 'Clear Sky', icon: `https://openweathermap.org/img/wn/01${b}@4x.png`, theme: isDay ? 'clear' : 'night' };
    if (code <= 3) return { label: 'Partly Cloudy', icon: `https://openweathermap.org/img/wn/02${b}@4x.png`, theme: 'cloudy' };
    if (code >= 45 && code <= 48) return { label: 'Foggy', icon: `https://openweathermap.org/img/wn/50${b}@4x.png`, theme: 'cloudy' };
    if (code >= 51 && code <= 67) return { label: 'Rain', icon: `https://openweathermap.org/img/wn/10${b}@4x.png`, theme: 'rain' };
    if (code >= 71 && code <= 86) return { label: 'Snowfall', icon: `https://openweathermap.org/img/wn/13${b}@4x.png`, theme: 'cloudy' };
    if (code >= 95) return { label: 'Thunderstorm', icon: `https://openweathermap.org/img/wn/11${b}@4x.png`, theme: 'rain' };
    return { label: 'Cloudy', icon: `https://openweathermap.org/img/wn/03${b}@4x.png`, theme: 'cloudy' };
}

function setLoadingState(msg) {
    // Force show Status
    statusDiv.style.display = 'flex';
    statusDiv.classList.remove('hidden');
    statusText.innerText = msg;
    
    // Force hide App
    weatherApp.style.display = 'none'; // Explicit display
    weatherApp.classList.add('hidden');
}

async function reverseLookup(lat, lon) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`);
        const data = await res.json();
        const addr = data.address;
        
        let locationName = addr.city || addr.town || addr.village || addr.county || "My Location";
        if (addr.postcode) {
            locationName += `, ${addr.postcode}`;
        }
        return locationName;
    } catch { return "My Location"; }
}