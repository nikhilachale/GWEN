// src/tools/weather.js — weather via wttr.in (no API key required).
import fetch from "node-fetch";

/**
 * Get current conditions and a short forecast.
 * @param {{ location?: string, days?: number }} args
 *   location = city, airport code, or coords ("lat,lon"). Empty = caller's IP geolocation.
 */
export async function getWeather({ location = "", days = 1 } = {}) {
  const loc = encodeURIComponent(location);
  const url = `https://wttr.in/${loc}?format=j1`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Gwen-Assistant" } });
    if (!res.ok) return `Weather lookup failed (${res.status}).`;
    const data = await res.json();
    const cur = data.current_condition?.[0];
    const area = data.nearest_area?.[0];
    const place = area
      ? `${area.areaName?.[0]?.value || ""}, ${area.region?.[0]?.value || ""}`.replace(/^, |, $/g, "")
      : (location || "your location");
    if (!cur) return `No conditions returned for ${place}.`;

    const tempF = cur.temp_F, tempC = cur.temp_C;
    const desc = cur.weatherDesc?.[0]?.value || "unknown";
    const feels = cur.FeelsLikeF;
    const wind = `${cur.windspeedMiles} mph ${cur.winddir16Point}`;
    const humidity = cur.humidity;

    let summary = `${place}: ${desc}, ${tempF}°F (${tempC}°C), feels like ${feels}°F. Wind ${wind}, humidity ${humidity}%.`;

    if (days > 1 && data.weather?.length) {
      const forecasts = data.weather.slice(0, Math.min(days, 3)).map((d) => {
        const date = new Date(d.date);
        const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
        return `${dayName}: ${d.mintempF}–${d.maxtempF}°F, ${d.hourly?.[4]?.weatherDesc?.[0]?.value || ""}`;
      });
      summary += " Forecast: " + forecasts.join("; ") + ".";
    }
    return summary;
  } catch (err) {
    return `Couldn't get weather: ${err.message}`;
  }
}
