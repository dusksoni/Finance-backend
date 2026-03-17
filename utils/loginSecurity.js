const axios = require("axios");
const crypto = require("crypto");

const GEO_TTL_MS = 1000 * 60 * 60 * 24;
const ipGeoCache = new Map();

const toNumberOrNull = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const trimIpv4MappedPrefix = (ip) => {
  if (!ip) return "";
  return String(ip).replace(/^::ffff:/i, "").trim();
};

const isPrivateIp = (ip) => {
  const value = trimIpv4MappedPrefix(ip);
  if (!value) return true;

  if (value === "127.0.0.1" || value === "::1") return true;
  if (value.startsWith("10.")) return true;
  if (value.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(value)) return true;
  if (value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:")) return true;

  return false;
};

const normalizeClientIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  const candidate = Array.isArray(forwarded)
    ? forwarded[0]
    : String(forwarded || req.socket?.remoteAddress || "");

  const first = candidate.split(",")[0]?.trim();
  return trimIpv4MappedPrefix(first);
};

const lookupIpGeo = async (ipAddress) => {
  const ip = trimIpv4MappedPrefix(ipAddress);
  if (!ip || isPrivateIp(ip)) return null;

  const cached = ipGeoCache.get(ip);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  try {
    const url = `https://ipwho.is/${encodeURIComponent(ip)}`;
    const { data } = await axios.get(url, { timeout: 1500 });
    if (data?.success === false) return null;

    const value = {
      country: data.country || null,
      region: data.region || null,
      city: data.city || null,
      timezone: data.timezone?.id || data.timezone || null,
      latitude: toNumberOrNull(data.latitude),
      longitude: toNumberOrNull(data.longitude),
      isProxy: Boolean(data.security?.proxy),
      isHosting: Boolean(
        data.security?.hosting || data.security?.tor || data.security?.vpn
      ),
      isMobileNetwork: Boolean(data.connection?.mobile),
      isp: data.connection?.isp || null,
      provider: "ipwho.is",
    };

    ipGeoCache.set(ip, {
      value,
      expiresAt: Date.now() + GEO_TTL_MS,
    });

    return value;
  } catch {
    return null;
  }
};

const buildGpsLocation = ({ latitude, longitude, accuracyMeters }) => {
  const hasGps = latitude !== null && longitude !== null;
  if (!hasGps) return null;

  const confidence =
    accuracyMeters === null
      ? "MEDIUM"
      : accuracyMeters <= 50
        ? "HIGH"
        : accuracyMeters <= 250
          ? "MEDIUM"
          : "LOW";

  return {
    source: "GPS",
    confidence,
    latitude,
    longitude,
    accuracyMeters,
    label: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
  };
};

const buildIpLocation = (ipGeo) => {
  if (!ipGeo) return null;

  const labelParts = [ipGeo.city, ipGeo.region, ipGeo.country].filter(Boolean);
  return {
    source: "IP",
    confidence: "LOW",
    latitude: ipGeo.latitude,
    longitude: ipGeo.longitude,
    accuracyMeters: null,
    label: labelParts.length ? labelParts.join(", ") : "Approximate location by IP",
  };
};

const getLocationContext = ({ latitude, longitude, accuracyMeters, ipGeo }) => {
  const gps = buildGpsLocation({ latitude, longitude, accuracyMeters });
  if (gps) return gps;

  const ipLocation = buildIpLocation(ipGeo);
  if (ipLocation) return ipLocation;

  return {
    source: "NONE",
    confidence: "NONE",
    latitude: null,
    longitude: null,
    accuracyMeters: null,
    label: "Location unavailable",
  };
};

const computeRisk = ({ ipAddress, userAgent, deviceName, ipGeo, location }) => {
  const reasons = [];
  let score = 0;

  if (!location || location.source === "NONE") {
    score += 25;
    reasons.push("No location captured");
  } else if (location.source === "IP") {
    score += 15;
    reasons.push("Only approximate IP location available");
  }

  if (!deviceName) {
    score += 10;
    reasons.push("Missing device name");
  }

  if (!userAgent) {
    score += 10;
    reasons.push("Missing user-agent");
  }

  if (isPrivateIp(ipAddress)) {
    score += 15;
    reasons.push("Private/local IP detected");
  }

  if (ipGeo?.isProxy || ipGeo?.isHosting) {
    score += 35;
    reasons.push("Proxy/hosting network detected");
  }

  const clamped = Math.min(100, score);
  const level = clamped >= 65 ? "HIGH" : clamped >= 35 ? "MEDIUM" : "LOW";

  return {
    score: clamped,
    level,
    reasons,
  };
};

const buildDeviceFingerprint = ({ deviceName, deviceType, userAgent, ipAddress }) => {
  const seed = [deviceName, deviceType, userAgent, ipAddress].filter(Boolean).join("|");
  if (!seed) return null;
  return crypto.createHash("sha256").update(seed).digest("hex");
};

const buildLoginSecurityContext = async ({
  req,
  deviceName,
  deviceType,
  latitude,
  longitude,
  locationAccuracy,
  alertsEnabled = false,
}) => {
  const normalizedIp = normalizeClientIp(req);
  const userAgent = req.headers["user-agent"] || null;
  const lat = toNumberOrNull(latitude);
  const lng = toNumberOrNull(longitude);
  const accuracyMeters = toNumberOrNull(locationAccuracy);
  const ipGeo = await lookupIpGeo(normalizedIp);
  const location = getLocationContext({
    latitude: lat,
    longitude: lng,
    accuracyMeters,
    ipGeo,
  });
  const risk = computeRisk({
    ipAddress: normalizedIp,
    userAgent,
    deviceName,
    ipGeo,
    location,
  });

  return {
    normalizedIp,
    latitude: lat,
    longitude: lng,
    context: {
      ipAddress: normalizedIp,
      location,
      ipGeo,
      device: {
        deviceName: deviceName || null,
        deviceType: deviceType || null,
        userAgent,
        fingerprint: buildDeviceFingerprint({
          deviceName,
          deviceType,
          userAgent,
          ipAddress: normalizedIp,
        }),
      },
      risk,
      alerts: {
        enabled: Boolean(alertsEnabled),
        queued: false,
      },
      capturedAt: new Date().toISOString(),
    },
  };
};

const decorateLoginActivity = (entry) => {
  if (!entry) return entry;
  const context = entry.context && typeof entry.context === "object" ? entry.context : {};
  const location = context.location && typeof context.location === "object" ? context.location : {};
  const risk = context.risk && typeof context.risk === "object" ? context.risk : {};

  const lat = entry.latitude ?? toNumberOrNull(location.latitude);
  const lng = entry.longitude ?? toNumberOrNull(location.longitude);
  const derivedLabel =
    typeof location.label === "string" && location.label.trim()
      ? location.label
      : lat !== null && lng !== null
        ? `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`
        : "—";

  return {
    ...entry,
    latitude: lat,
    longitude: lng,
    locationLabel: derivedLabel,
    locationSource: location.source || (lat !== null && lng !== null ? "GPS" : "NONE"),
    locationConfidence: location.confidence || (lat !== null && lng !== null ? "MEDIUM" : "NONE"),
    riskScore: Number.isFinite(Number(risk.score)) ? Number(risk.score) : 0,
    riskLevel: risk.level || "LOW",
    riskReasons: Array.isArray(risk.reasons) ? risk.reasons : [],
  };
};

module.exports = {
  buildLoginSecurityContext,
  decorateLoginActivity,
  normalizeClientIp,
  isPrivateIp,
};
