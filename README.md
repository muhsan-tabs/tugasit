# SHIPFLOW — Cargo & Logistics

Prototype web app pengiriman cargo sesuai spesifikasi teknis SHIPFLOW. Antarmuka berbahasa Indonesia, responsif untuk desktop dan ponsel, serta dapat dipasang sebagai PWA dari browser yang mendukung instalasi web app. Ini bukan APK Android native.

## Menjalankan demo lokal

Perlu Node.js 18 atau lebih baru. Tidak ada dependency npm tambahan.

```powershell
cd outputs/shipflow
node scripts/serve.mjs
```

Buka `http://127.0.0.1:4173`. Alternatifnya, jalankan `npm start` dari folder `shipflow`. Jalankan melalui server lokal agar ES modules dan service worker berfungsi.

Halaman masuk menyediakan dua mode: **Akun Firebase** untuk Authentication + Realtime Database, dan tombol akun demo untuk simulasi `localStorage` di browser ini. Mode Firebase memerlukan koneksi internet dan Rules database yang sudah diterapkan.

| Peran | Email | Kata sandi |
| --- | --- | --- |
| Pelanggan | `customer.demo@shipflow.test` | `demo123` |
| Operator | `admin.demo@shipflow.test` | `demo123` |
| Kurir | `courier.demo@shipflow.test` | `demo123` |

## Alur demo

1. Masuk sebagai pelanggan, buat pengiriman melalui wizard tiga langkah, lalu lihat resi dan timeline.
2. Keluar dan masuk sebagai operator. Tinjau pesanan, konfirmasi atau tolak dengan alasan, tetapkan kurir, dan periksa laporan.
3. Keluar dan masuk sebagai kurir. Buka hanya tugas yang ditetapkan kepada akun tersebut dan majukan status sesuai urutan. Nama penerima wajib saat status menjadi **Terkirim**; alasan wajib saat **Gagal dikirim**.
4. Lacak resi lewat halaman publik untuk melihat status, kota, dan timeline yang sudah dibatasi.

Data dapat dihapus lewat pengaturan penyimpanan situs di browser. Muat ulang demo akan membuat fixture awal kembali jika penyimpanan SHIPFLOW telah dihapus.

## Fitur prototype

- Firebase Authentication email/password untuk akun jarak jauh, serta login demo lokal untuk tiga peran.
- Dashboard pelanggan, operator, dan kurir dengan pembatasan tampilan berdasarkan peran.
- Estimasi ongkir deterministik berdasarkan zona demo, berat tagih, dan kelas layanan. Berat volumetrik memakai `P × L × T / 4000`, lalu berat tagih dibulatkan ke atas per kg.
- Nomor resi acak berformat `SF-YYMM-XXXXXX`; mode Firebase mencadangkan resi unik di Realtime Database.
- Review pesanan, penugasan kurir aktif, transisi status berurutan, alasan penolakan/gagal, nama penerima, timeline, pelacakan publik teredaksi, cetak ringkasan, dan ekspor CSV tanpa nomor telepon/alamat.
- Shell PWA dengan cache app shell untuk akses lokal setelah halaman pertama dimuat melalui HTTPS atau localhost.

## Batas demo

Ini bukan sistem ekspedisi produksi. Tarif, notifikasi, lokasi, dan konfirmasi tetap simulasi; tidak ada pembayaran nyata, GPS, ETA, SMS/WhatsApp/email, unggah bukti, pajak, asuransi, COD, settlement, atau SLA. Mode Firebase memakai project dan URL Realtime Database yang diberikan, tetapi tetap perlu setup Authentication, data role operator/kurir, dan Rules di bawah.

Pendaftaran demo lokal menyimpan hash kata sandi di browser. Itu bukan pengganti Firebase Authentication; data demo lokal dapat dibaca atau diubah oleh pemilik browser melalui developer tools.

## Firebase Realtime Database

Konfigurasi project yang diberikan tersimpan di `src/js/firebase/config.js`; `databaseURL` menunjuk ke Realtime Database project `tugas-it-2`. `src/js/firebase/service.js` memakai Firebase JS SDK modular melalui CDN. `database.rules.json` menjadi aturan akses awal dan `firebase.json` menunjuk ke file tersebut.

Langkah penyiapan:

1. Di Firebase Console project `tugas-it-2`, aktifkan **Authentication → Email/Password**.
2. Terapkan Rules dari folder proyek dengan `firebase deploy --only database`. Rules membatasi kiriman berdasarkan `users/{uid}.role` dan hanya membuka kota/status/timeline umum pada `trackingIndex`.
3. Pendaftaran aplikasi membuat profil ber-role `customer`. Buat akun operator dan kurir melalui Authentication, lalu isi `users/{uid}` dari Firebase Console memakai UID akun, `role` (`admin` atau `courier`), `displayName`, `email`, `active: true`, `phone`, dan `serviceAreas` untuk kurir. Jangan memberi role melalui form publik.
4. Jalankan aplikasi melalui server lokal, lalu pilih **Akun Firebase** saat masuk atau mendaftar. Tombol akun demo tetap memakai penyimpanan lokal.
5. Uji Rules dengan Firebase Emulator Suite sebelum demo publik. Periksa kuota, App Check, domain yang diizinkan, dan akun demo.

Untuk deploy Hosting setelah setup Firebase CLI: `firebase deploy --only hosting`. Pasang Rules Realtime Database sebelum menguji alur Firebase.

## Struktur

```text
shipflow/
├── index.html
├── manifest.webmanifest
├── service-worker.js
├── firebase.json
├── database.rules.json
├── src/
│   ├── css/styles.css
│   └── js/
│       ├── domain.js
│       ├── store.js
│       ├── main.js
│       └── firebase/ (client, service, config)
└── scripts/serve.mjs
```
