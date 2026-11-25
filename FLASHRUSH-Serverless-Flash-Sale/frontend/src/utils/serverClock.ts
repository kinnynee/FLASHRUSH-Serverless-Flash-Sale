let clockOffset = 0;

export function syncServerTime(serverTime: unknown, receivedAt = Date.now()) {
  if (typeof serverTime !== 'string') return;
  const timestamp = Date.parse(serverTime);
  if (Number.isFinite(timestamp)) clockOffset = timestamp - receivedAt;
}

export function getServerNow(clientNow = Date.now()) {
  return clientNow + clockOffset;
}

export function getClockOffset() {
  return clockOffset;
}
