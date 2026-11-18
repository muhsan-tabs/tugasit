import { generateId, generateTrackingNumber, STATUS } from './domain.js';

const USERS_KEY = 'shipflow_demo_users_v1';
const SHIPMENTS_KEY = 'shipflow_demo_shipments_v1';
const SESSION_KEY = 'shipflow_demo_session_v1';
let remoteMode = false;
let remoteData = { users: [], shipments: [] };

const isoMinutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();

function makeShipment({ id, trackingNumber, ownerUid, status, originCity, destinationCity, description, weight, courierUid, ageHours = 2 }) {
  const createdAt = isoMinutesAgo(ageHours * 60);
  const journey = ['pending_review', 'confirmed', 'pickup_assigned', 'picked_up', 'in_transit', 'at_hub', 'out_for_delivery', 'delivered'];
  const path = status === 'rejected'
    ? ['pending_review', 'rejected']
    : status === 'delivery_failed'
      ? [...journey.slice(0, 7), 'delivery_failed']
      : journey.slice(0, Math.max(1, journey.indexOf(status) + 1));
  const eventStepMs = Math.min((ageHours * 60 * 60_000) / Math.max(path.length, 2), 45 * 60_000);
  const eventNotes = {
    pending_review: 'Pesanan diterima untuk diperiksa operator.',
    confirmed: 'Data rute dan paket sudah diperiksa.',
    pickup_assigned: 'Kurir telah dijadwalkan untuk penjemputan.',
    picked_up: 'Paket telah dijemput dari pengirim.',
    in_transit: 'Paket sedang bergerak menuju kota tujuan.',
    at_hub: 'Paket tercatat tiba di hub tujuan.',
    out_for_delivery: 'Kurir membawa paket untuk diantarkan.',
    delivery_failed: 'Penerima belum dapat ditemui. Hubungi operator untuk jadwal ulang.',
    delivered: 'Paket diterima oleh penerima.',
    rejected: 'Pesanan ditolak karena data demonstrasi perlu diperiksa.',
  };
  const events = path.map((eventStatus, index) => ({
    id: generateId('evt'),
    status: eventStatus,
    label: STATUS[eventStatus]?.label || eventStatus,
    note: eventNotes[eventStatus] || '',
    locationLabel: ['picked_up', 'pickup_assigned'].includes(eventStatus) ? originCity : ['at_hub', 'out_for_delivery', 'delivered'].includes(eventStatus) ? destinationCity : '',
    actorUid: eventStatus === 'pending_review' ? ownerUid : eventStatus === 'rejected' || eventStatus === 'confirmed' ? 'uid_admin_demo' : courierUid || 'uid_admin_demo',
    actorRole: eventStatus === 'pending_review' ? 'customer' : eventStatus === 'rejected' || eventStatus === 'confirmed' ? 'admin' : 'courier',
    createdAt: new Date(new Date(createdAt).getTime() + index * eventStepMs).toISOString(),
    ...(eventStatus === 'delivery_failed' ? { reason: 'Penerima belum dapat ditemui.' } : {}),
    ...(eventStatus === 'delivered' ? { recipientName: 'Penerima Demo' } : {}),
  }));
  return {
    id,
    trackingNumber,
    ownerUid,
    status,
    serviceLevel: 'cargo_regular',
    origin: { city: originCity, address: `Jl. Contoh ${id.slice(-2)}, ${originCity}`, contactName: 'Pengirim Demo', phone: '0800-0000-0000' },
    destination: { city: destinationCity, address: `Jl. Fiktif ${id.slice(-2)}, ${destinationCity}`, contactName: 'Penerima Demo', phone: '0800-0000-0001' },
    package: { description, category: 'general', actualWeightKg: weight, pieces: 1, lengthCm: 35, widthCm: 30, heightCm: 25, instructions: 'Tangani dengan hati-hati.' },
    quote: { billableWeightKg: weight, estimatedAmountIdr: 74000 + weight * 4500, currency: 'IDR' },
    assignedCourierUid: courierUid || null,
    createdAt,
    updatedAt: createdAt,
    ...(status === 'confirmed' ? { confirmedAt: createdAt } : {}),
    ...(status === 'delivered' ? { deliveredAt: isoMinutesAgo(20), recipientName: 'Penerima Demo' } : {}),
    ...(status === 'rejected' ? { rejectionReason: 'Data alamat perlu dilengkapi.' } : {}),
    events,
  };
}

function seedUsers() {
  const now = new Date().toISOString();
  return [
    { uid: 'uid_customer_demo', email: 'customer.demo@shipflow.test', displayName: 'Rina Rahma', phone: '0812-0000-0101', role: 'customer', active: true, createdAt: now },
    { uid: 'uid_admin_demo', email: 'admin.demo@shipflow.test', displayName: 'Dimas Pratama', phone: '0812-0000-0202', role: 'admin', active: true, createdAt: now },
    { uid: 'uid_courier_demo', email: 'courier.demo@shipflow.test', displayName: 'Andi Saputra', phone: '0812-0000-0303', role: 'courier', active: true, serviceAreas: ['Jabodetabek', 'Jawa Barat'], createdAt: now },
    { uid: 'uid_courier_two', email: 'courier.2@shipflow.test', displayName: 'Siti Rahmawati', phone: '0812-0000-0404', role: 'courier', active: true, serviceAreas: ['Jawa Tengah', 'Jawa Timur'], createdAt: now },
    { uid: 'uid_customer_other', email: 'customer.lain@shipflow.test', displayName: 'Budi Santoso', phone: '0812-0000-0505', role: 'customer', active: true, createdAt: now },
  ];
}

function seedShipments() {
  return [
    makeShipment({ id: 'shp_1001', trackingNumber: 'SF-2611-104283', ownerUid: 'uid_customer_demo', status: 'pending_review', originCity: 'Jakarta', destinationCity: 'Bandung', description: 'Peralatan sekolah', weight: 18, ageHours: 1 }),
    makeShipment({ id: 'shp_1002', trackingNumber: 'SF-2611-209144', ownerUid: 'uid_customer_demo', status: 'in_transit', originCity: 'Jakarta', destinationCity: 'Semarang', description: 'Buku dan arsip', weight: 12, courierUid: 'uid_courier_demo', ageHours: 20 }),
    makeShipment({ id: 'shp_1003', trackingNumber: 'SF-2611-482013', ownerUid: 'uid_customer_other', status: 'confirmed', originCity: 'Bandung', destinationCity: 'Jakarta', description: 'Komponen elektronik', weight: 7, ageHours: 18 }),
    makeShipment({ id: 'shp_1004', trackingNumber: 'SF-2611-055821', ownerUid: 'uid_customer_other', status: 'pickup_assigned', originCity: 'Jakarta', destinationCity: 'Bandung', description: 'Peralatan rumah', weight: 15, courierUid: 'uid_courier_demo', ageHours: 16 }),
    makeShipment({ id: 'shp_1005', trackingNumber: 'SF-2611-838406', ownerUid: 'uid_customer_other', status: 'at_hub', originCity: 'Semarang', destinationCity: 'Surabaya', description: 'Bahan kerajinan', weight: 9, courierUid: 'uid_courier_two', ageHours: 13 }),
    makeShipment({ id: 'shp_1006', trackingNumber: 'SF-2611-015962', ownerUid: 'uid_customer_other', status: 'delivery_failed', originCity: 'Surabaya', destinationCity: 'Semarang', description: 'Perlengkapan kantor', weight: 6, courierUid: 'uid_courier_two', ageHours: 30 }),
    makeShipment({ id: 'shp_1007', trackingNumber: 'SF-2611-634250', ownerUid: 'uid_customer_other', status: 'delivered', originCity: 'Jakarta', destinationCity: 'Yogyakarta', description: 'Koleksi buku', weight: 4, courierUid: 'uid_courier_two', ageHours: 48 }),
    makeShipment({ id: 'shp_1008', trackingNumber: 'SF-2611-754109', ownerUid: 'uid_customer_other', status: 'rejected', originCity: 'Bandung', destinationCity: 'Makassar', description: 'Barang demo', weight: 3, ageHours: 52 }),
  ];
}

function read(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function initializeDemoData() {
  if (!localStorage.getItem(USERS_KEY)) write(USERS_KEY, seedUsers());
  if (!localStorage.getItem(SHIPMENTS_KEY)) write(SHIPMENTS_KEY, seedShipments());
}

export function getUsers() {
  initializeDemoData();
  if (remoteMode) return remoteData.users;
  return read(USERS_KEY, []);
}

export function getShipments() {
  initializeDemoData();
  if (remoteMode) return remoteData.shipments;
  return read(SHIPMENTS_KEY, []);
}

export function setRemoteMode(enabled) {
  remoteMode = enabled;
}

export function setRemoteData(data) {
  remoteData = { users: data.users || [], shipments: data.shipments || [] };
}

export function replaceRemoteShipment(shipment) {
  const shipments = remoteData.shipments.filter((item) => item.id !== shipment.id);
  remoteData = { ...remoteData, shipments: [shipment, ...shipments] };
}

export function replaceRemoteUser(user) {
  const users = remoteData.users.filter((item) => item.uid !== user.uid);
  remoteData = { ...remoteData, users: [user, ...users] };
}

export function getShipment(id) {
  return getShipments().find((shipment) => shipment.id === id) || null;
}

export function getUser(uid) {
  return getUsers().find((user) => user.uid === uid) || null;
}

export function getCurrentUser() {
  const uid = localStorage.getItem(SESSION_KEY);
  return uid ? getUser(uid) : null;
}

export function signOut() {
  localStorage.removeItem(SESSION_KEY);
}

async function passwordDigest(password) {
  try {
    const bytes = new TextEncoder().encode(password);
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    let hash = 2166136261;
    for (const character of password) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    return `local-demo-only:${(hash >>> 0).toString(16)}`;
  }
}

export async function signIn(email, password) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = getUsers().find((item) => item.email.toLowerCase() === normalizedEmail && item.active);
  if (!user) return { ok: false, error: 'Email atau kata sandi tidak cocok.' };
  if (user.passwordHash) {
    if (await passwordDigest(password) !== user.passwordHash) return { ok: false, error: 'Email atau kata sandi tidak cocok.' };
  } else if (password !== 'demo123') {
    return { ok: false, error: 'Email atau kata sandi tidak cocok.' };
  }
  localStorage.setItem(SESSION_KEY, user.uid);
  return { ok: true, user };
}

export async function registerCustomer({ displayName, email, phone, password }) {
  const users = getUsers();
  const normalizedEmail = email.trim().toLowerCase();
  if (users.some((user) => user.email.toLowerCase() === normalizedEmail)) {
    return { ok: false, error: 'Email sudah terdaftar. Silakan masuk.' };
  }
  const user = {
    uid: generateId('user'),
    displayName: displayName.trim(),
    email: normalizedEmail,
    phone: phone.trim(),
    role: 'customer',
    active: true,
    passwordHash: await passwordDigest(password),
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  write(USERS_KEY, users);
  localStorage.setItem(SESSION_KEY, user.uid);
  return { ok: true, user };
}

export function updateProfile(uid, changes) {
  const users = getUsers();
  const index = users.findIndex((user) => user.uid === uid);
  if (index < 0) return false;
  users[index] = { ...users[index], displayName: changes.displayName.trim(), phone: changes.phone.trim(), updatedAt: new Date().toISOString() };
  write(USERS_KEY, users);
  return true;
}

export function createShipment(shipment) {
  const shipments = getShipments();
  const complete = {
    ...shipment,
    id: generateId('shp'),
    trackingNumber: generateTrackingNumber(shipments.map((item) => item.trackingNumber)),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    events: [],
  };
  complete.events.push({
    id: generateId('evt'), status: 'pending_review', label: STATUS.pending_review.label,
    note: 'Pesanan dikirim dan menunggu pemeriksaan operator.', locationLabel: '',
    actorUid: shipment.ownerUid, actorRole: 'customer', createdAt: complete.createdAt,
  });
  shipments.unshift(complete);
  write(SHIPMENTS_KEY, shipments);
  return complete;
}

export function saveShipment(updatedShipment) {
  const shipments = getShipments();
  const index = shipments.findIndex((shipment) => shipment.id === updatedShipment.id);
  if (index < 0) return false;
  shipments[index] = { ...updatedShipment, updatedAt: new Date().toISOString() };
  write(SHIPMENTS_KEY, shipments);
  return true;
}
