export const TimeSettings = {
  GLOBAL_TIMEZONE: null,
};

export function getLocalTimezone() {
  try {
    if (TimeSettings.GLOBAL_TIMEZONE) return TimeSettings.GLOBAL_TIMEZONE;
    if (process.env.TZ) return process.env.TZ;
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected) return detected;
  } catch (e) {
    return 'UTC';
  }
}

export function timestampToDate(timestamp) {
  const date = new Date(parseInt(timestamp) * 1000);
  const options = {
    timeZone: getLocalTimezone(),
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  };
  return date.toLocaleDateString(undefined, options);
}

export function timestampToTime(timestamp) {
  const date = new Date(parseInt(timestamp) * 1000);
  const options = {
    timeZone: getLocalTimezone(),
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false // for 24-hour format (use true for AM/PM)
  };
  return date.toLocaleTimeString(undefined, options);
}

export function timestampToDateTime(timestamp) {
  const date = new Date(parseInt(timestamp) * 1000);
  const options = {
    timeZone: getLocalTimezone(),
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false // for 24-hour format (use true for AM/PM)
  };
  return date.toLocaleString(undefined, options);
}