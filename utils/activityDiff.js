const normalizeForCompare = (value) => {
  if (value === undefined || value === null) return "";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).trim();
};

const toReadable = (value) => {
  if (value === undefined || value === null || value === "") return "-";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value) || typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const buildFieldChanges = (before = {}, after = {}, labels = {}) => {
  const keys = Object.keys(labels);
  const changes = [];

  keys.forEach((key) => {
    const fromRaw = before?.[key];
    const toRaw = after?.[key];
    if (normalizeForCompare(fromRaw) === normalizeForCompare(toRaw)) return;

    const label = labels[key] || key;
    const from = toReadable(fromRaw);
    const to = toReadable(toRaw);
    changes.push({
      field: key,
      label,
      from,
      to,
      message: `Updated ${label} from ${from} to ${to}`,
    });
  });

  return changes;
};

module.exports = {
  buildFieldChanges,
};
