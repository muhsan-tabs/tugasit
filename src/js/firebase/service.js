import { firebaseConfig } from './config.js';
import { generateId, generateTrackingNumber, statusLabel } from '../domain.js';

const SDK_VERSION = '13.3.0';
const SDK_BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
const [appSdk, authSdk, databaseSdk] = await Promise.all([
  import(`${SDK_BASE}/firebase-app.js`),
  import(`${SDK_BASE}/firebase-auth.js`),
  import(`${SDK_BASE}/firebase-database.js`),
]);

const app = appSdk.initializeApp(firebaseConfig);
const auth = authSdk.getAuth(app);
const database = databaseSdk.getDatabase(app, firebaseConfig.databaseURL);

const dbRef = databaseSdk.ref;
const { get, set, update, query, orderByChild, equalTo, onValue, runTransaction, push, serverTimestamp } = databaseSdk;

function profileFromSnapshot(snapshot, fallbackUser) {
  const value = snapshot.val();
  if (!value) return null;
  return {
    uid: fallbackUser.uid,
    email: value.email || fallbackUser.email || '',
    displayName: value.displayName || fallbackUser.displayName || 'Pengguna SHIPFLOW',
    phone: value.phone || '',
    role: value.role,
    active: value.active !== false,
    serviceAreas: Array.isArray(value.serviceAreas) ? value.serviceAreas : Object.values(value.serviceAreas || {}),
    createdAt: value.createdAt || null,
  };
}

function snapshotUsers(snapshot) {
  const raw = snapshot.val() || {};
  return Object.entries(raw).map(([uid, value]) => ({
    uid,
    email: value.email || '',
    displayName: value.displayName || 'Pengguna SHIPFLOW',
    phone: value.phone || '',
    role: value.role || 'customer',
    active: value.active !== false,
    serviceAreas: Array.isArray(value.serviceAreas) ? value.serviceAreas : Object.values(value.serviceAreas || {}),
    createdAt: value.createdAt || null,
  }));
}

function snapshotShipments(snapshot) {
  const raw = snapshot.val() || {};
  return Object.entries(raw).map(([id, value]) => ({
    ...value,
    id,
    events: Object.entries(value.events || {}).map(([eventId, event]) => ({ ...event, id: event.id || eventId }))
      .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0)),
  })).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
}

function shipmentQuery(profile) {
  const shipmentsRef = dbRef(database, 'shipments');
  if (profile.role === 'admin') return shipmentsRef;
  const field = profile.role === 'customer' ? 'ownerUid' : 'assignedCourierUid';
  return query(shipmentsRef, orderByChild(field), equalTo(profile.uid));
}

export function observeAuth(callback) {
  return authSdk.onAuthStateChanged(auth, callback);
}

export function currentAuthUser() {
  return auth.currentUser;
}

export async function signIn(email, password) {
  const credential = await authSdk.signInWithEmailAndPassword(auth, email.trim(), password);
  return credential.user;
}

export async function registerCustomer({ displayName, email, phone, password }) {
  const credential = await authSdk.createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
  const profile = {
    displayName: displayName.trim(),
    email: credential.user.email || email.trim().toLowerCase(),
    phone: phone.trim(),
    role: 'customer',
    active: true,
    createdAt: serverTimestamp(),
  };
  await authSdk.updateProfile(credential.user, { displayName: profile.displayName });
  await set(dbRef(database, `users/${credential.user.uid}`), profile);
  return credential.user;
}

export async function signOut() {
  await authSdk.signOut(auth);
}

export async function loadInitialData(user) {
  const profileSnapshot = await get(dbRef(database, `users/${user.uid}`));
  const profile = profileFromSnapshot(profileSnapshot, user);
  if (!profile) throw new Error('Profil Firebase belum tersedia. Akun operator/kurir perlu dibuat oleh admin terlebih dahulu.');
  if (!profile.active) throw new Error('Akun ini dinonaktifkan. Hubungi operator.');
  if (!['customer', 'admin', 'courier'].includes(profile.role)) throw new Error('Role akun tidak dikenali.');
  const [shipmentSnapshot, userSnapshot] = await Promise.all([
    get(shipmentQuery(profile)),
    profile.role === 'admin' ? get(dbRef(database, 'users')) : Promise.resolve(profileSnapshot),
  ]);
  return {
    profile,
    shipments: snapshotShipments(shipmentSnapshot),
    users: profile.role === 'admin' ? snapshotUsers(userSnapshot) : [profile],
  };
}

export function watchData(profile, onData, onError = () => {}) {
  let shipments = [];
  let users = profile.role === 'admin' ? [] : [profile];
  const emit = () => onData({ shipments, users });
  const stopShipments = onValue(shipmentQuery(profile), (snapshot) => {
    shipments = snapshotShipments(snapshot);
    emit();
  }, onError);
  let stopUsers = () => {};
  if (profile.role === 'admin') {
    stopUsers = onValue(dbRef(database, 'users'), (snapshot) => {
      users = snapshotUsers(snapshot);
      emit();
    }, onError);
  }
  return () => { stopShipments(); stopUsers(); };
}

export async function lookupPublicTracking(trackingNumber) {
  const snapshot = await get(dbRef(database, `trackingIndex/${trackingNumber}`));
  return snapshot.exists() ? snapshot.val() : null;
}

export async function createShipment(shipment) {
  let trackingNumber = '';
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = generateTrackingNumber([]);
    const reservation = await runTransaction(dbRef(database, `trackingReservations/${candidate}`), (current) => {
      if (current != null) return;
      return true;
    }, { applyLocally: false });
    if (reservation.committed) { trackingNumber = candidate; break; }
  }
  if (!trackingNumber) throw new Error('Resi unik belum dapat dibuat. Coba kirim kembali.');

  const id = push(dbRef(database, 'shipments')).key;
  const now = Date.now();
  const initialEvent = {
    id: generateId('evt'),
    status: 'pending_review',
    label: statusLabel('pending_review'),
    note: 'Pesanan dikirim dan menunggu pemeriksaan operator.',
    locationLabel: '',
    actorUid: auth.currentUser.uid,
    actorRole: 'customer',
    createdAt: serverTimestamp(),
  };
  const remoteShipment = {
    ...shipment,
    id,
    trackingNumber,
    ownerUid: auth.currentUser.uid,
    status: 'pending_review',
    assignedCourierUid: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastEventId: initialEvent.id,
    events: { [initialEvent.id]: initialEvent },
  };
  const publicEntry = {
    shipmentId: id,
    trackingNumber,
    status: 'pending_review',
    lastEventId: initialEvent.id,
    originCity: shipment.origin.city,
    destinationCity: shipment.destination.city,
    timeline: {
      [initialEvent.id]: {
        status: initialEvent.status,
        label: initialEvent.label,
        locationLabel: '',
        createdAt: serverTimestamp(),
      },
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await update(dbRef(database), {
    [`shipments/${id}`]: remoteShipment,
    [`trackingIndex/${trackingNumber}`]: publicEntry,
  });
  return {
    ...remoteShipment,
    createdAt: now,
    updatedAt: now,
    events: [{ ...initialEvent, createdAt: now }],
  };
}

export async function saveShipmentTransition(shipment, event) {
  const updates = {
    [`shipments/${shipment.id}/status`]: shipment.status,
    [`shipments/${shipment.id}/updatedAt`]: serverTimestamp(),
    [`shipments/${shipment.id}/lastEventId`]: event.id,
    [`shipments/${shipment.id}/events/${event.id}`]: { ...event, createdAt: serverTimestamp() },
    [`trackingIndex/${shipment.trackingNumber}/status`]: shipment.status,
    [`trackingIndex/${shipment.trackingNumber}/updatedAt`]: serverTimestamp(),
    [`trackingIndex/${shipment.trackingNumber}/lastEventId`]: event.id,
    [`trackingIndex/${shipment.trackingNumber}/timeline/${event.id}`]: {
      status: event.status,
      label: event.label,
      locationLabel: event.locationLabel || publicCityForStatus(shipment, event.status),
      createdAt: serverTimestamp(),
    },
  };
  if (shipment.assignedCourierUid) updates[`shipments/${shipment.id}/assignedCourierUid`] = shipment.assignedCourierUid;
  if (shipment.confirmedAt && event.status === 'confirmed') updates[`shipments/${shipment.id}/confirmedAt`] = serverTimestamp();
  if (shipment.deliveredAt && event.status === 'delivered') updates[`shipments/${shipment.id}/deliveredAt`] = serverTimestamp();
  if (event.status === 'delivered') {
    updates[`shipments/${shipment.id}/recipientName`] = event.recipientName;
    updates[`trackingIndex/${shipment.trackingNumber}/deliveredAt`] = serverTimestamp();
  }
  if (event.status === 'delivery_failed') updates[`shipments/${shipment.id}/failureReason`] = event.reason || event.note;
  if (['pickup_assigned', 'out_for_delivery'].includes(event.status)) updates[`shipments/${shipment.id}/failureReason`] = null;
  if (event.status === 'rejected') updates[`shipments/${shipment.id}/rejectionReason`] = event.note;
  await update(dbRef(database), updates);
}

function publicCityForStatus(shipment, status) {
  return ['pickup_assigned', 'picked_up'].includes(status) ? shipment.origin.city
    : ['at_hub', 'out_for_delivery', 'delivered'].includes(status) ? shipment.destination.city : '';
}

export async function updateProfile(profile, changes) {
  const displayName = changes.displayName.trim();
  const phone = changes.phone.trim();
  await Promise.all([
    authSdk.updateProfile(auth.currentUser, { displayName }),
    update(dbRef(database, `users/${profile.uid}`), { displayName, phone, updatedAt: serverTimestamp() }),
  ]);
  return { ...profile, displayName, phone };
}
