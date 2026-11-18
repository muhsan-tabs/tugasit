export const STATUS = {
  pending_review: { label: 'Menunggu konfirmasi', tone: 'amber' },
  confirmed: { label: 'Dikonfirmasi', tone: 'blue' },
  pickup_assigned: { label: 'Kurir dijadwalkan', tone: 'blue' },
  picked_up: { label: 'Sudah dijemput', tone: 'teal' },
  in_transit: { label: 'Dalam perjalanan', tone: 'teal' },
  at_hub: { label: 'Tiba di hub', tone: 'blue' },
  out_for_delivery: { label: 'Dalam pengantaran', tone: 'teal' },
  delivered: { label: 'Terkirim', tone: 'green' },
  delivery_failed: { label: 'Gagal dikirim', tone: 'red' },
  rejected: { label: 'Ditolak', tone: 'red' },
  cancelled: { label: 'Dibatalkan', tone: 'gray' },
};

export const ROLE_LABEL = { customer: 'Pelanggan', admin: 'Operator', courier: 'Kurir' };

const NEXT = {
  pickup_assigned: ['picked_up'],
  picked_up: ['in_transit'],
  in_transit: ['at_hub'],
  at_hub: ['out_for_delivery'],
  out_for_delivery: ['delivered', 'delivery_failed'],
};

const ZONES = [
  { name: 'Jabodetabek', cities: ['jakarta', 'bekasi', 'depok', 'tangerang', 'bogor'] },
  { name: 'Jawa Barat', cities: ['bandung', 'cirebon', 'sukabumi', 'tasikmalaya'] },
  { name: 'Jawa Tengah', cities: ['semarang', 'yogyakarta', 'solo', 'surakarta'] },
  { name: 'Jawa Timur', cities: ['surabaya', 'malang', 'kediri'] },
  { name: 'Sumatera', cities: ['medan', 'palembang', 'pekanbaru', 'padang'] },
  { name: 'Sulawesi', cities: ['makassar', 'manado'] },
];

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

export function statusLabel(status) {
  return STATUS[status]?.label || 'Status tidak diketahui';
}

export function cityZone(city = '') {
  const normalized = city.trim().toLowerCase();
  return ZONES.find((zone) => zone.cities.includes(normalized))?.name || 'Zona lainnya';
}

export function calculateQuote({ originCity, destinationCity, actualWeightKg, lengthCm, widthCm, heightCm, serviceLevel }) {
  const actual = Number(actualWeightKg) || 0;
  const dimensionsComplete = [lengthCm, widthCm, heightCm].every((value) => Number(value) > 0);
  const volumetric = dimensionsComplete ? (Number(lengthCm) * Number(widthCm) * Number(heightCm)) / 4000 : 0;
  const billableWeightKg = Math.ceil(Math.max(actual, volumetric));
  const originIndex = Math.max(0, ZONES.findIndex((zone) => zone.name === cityZone(originCity)));
  const destinationIndex = Math.max(0, ZONES.findIndex((zone) => zone.name === cityZone(destinationCity)));
  const distanceBand = Math.abs(originIndex - destinationIndex);
  const baseFee = 28000 + distanceBand * 9000;
  const perKg = 5000 + distanceBand * 1250;
  const multiplier = { cargo_economy: 0.85, cargo_regular: 1, cargo_express: 1.6 }[serviceLevel] || 1;
  const amountIdr = Math.ceil(((baseFee + billableWeightKg * perKg) * multiplier) / 1000) * 1000;
  return {
    billableWeightKg,
    volumetricWeightKg: Number(volumetric.toFixed(2)),
    amountIdr,
    currency: 'IDR',
    baseFee,
    perKg,
    originZone: cityZone(originCity),
    destinationZone: cityZone(destinationCity),
    serviceLevel,
  };
}

export function availableTransitions(shipment, role, uid) {
  if (role === 'customer' && shipment.ownerUid === uid && shipment.status === 'pending_review') {
    return ['cancelled'];
  }
  if (role === 'courier' && shipment.assignedCourierUid === uid) {
    return NEXT[shipment.status] || [];
  }
  if (role === 'admin') {
    if (shipment.status === 'pending_review') return ['confirmed', 'rejected'];
    if (shipment.status === 'confirmed') return ['pickup_assigned'];
    if (shipment.status === 'delivery_failed') return ['pickup_assigned', 'out_for_delivery'];
    return NEXT[shipment.status] || [];
  }
  return [];
}

export function canTransition(shipment, targetStatus, role, uid) {
  return availableTransitions(shipment, role, uid).includes(targetStatus);
}

export function formatMoney(amount) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(amount) || 0);
}

export function formatDate(value, includeTime = true) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium', ...(includeTime ? { timeStyle: 'short' } : {}), timeZone: 'Asia/Jakarta',
  }).format(date);
}

export function generateId(prefix = 'id') {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function generateTrackingNumber(existing = []) {
  const date = new Date();
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const used = new Set(existing);
  let candidate;
  do {
    const random = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
    candidate = `SF-${year}${month}-${String(random).padStart(6, '0')}`;
  } while (used.has(candidate));
  return candidate;
}
