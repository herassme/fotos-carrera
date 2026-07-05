// ============================================================================
//  FOTOS DE CARRERA  ·  servidor unico (Express + MongoDB + Cloudinary)
//  Sin paso de build. Render corre:  npm install  ->  npm start
// ============================================================================
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const path = require('path');
// ---------------------------------------------------------------------------
//  Variables de entorno (se configuran en Render → Environment)
// ---------------------------------------------------------------------------
const {
  MONGODB_URI,
  CLOUDINARY_URL,                 // formato: cloudinary://API_KEY:API_SECRET@CLOUD_NAME
  CLOUDINARY_CLOUD_NAME,          // (alternativa a CLOUDINARY_URL)
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  CLOUDINARY_FOLDER = 'carrera',  // carpeta donde subes las fotos en Cloudinary
  ADMIN_TOKEN = 'cambia-esta-clave',
  WHATSAPP_NUMBER = '18093031224',// tu numero con codigo pais, sin + ni espacios
  PHOTO_PRICE = '5',
  CURRENCY = 'USD',
  EVENT_NAME = 'SD Corre 5K',
  EVENT_DATE = '5 Julio 2026',
  PORT = 3000,
} = process.env;
// Cloudinary: usa CLOUDINARY_URL si existe, si no las 3 llaves sueltas.
if (CLOUDINARY_URL) {
  cloudinary.config({ secure: true });
} else {
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });
}
// ---------------------------------------------------------------------------
//  Base de datos
// ---------------------------------------------------------------------------
const photoSchema = new mongoose.Schema({
  publicId: { type: String, unique: true, index: true },
  width: Number,
  height: Number,
  format: String,
  bibs: { type: [String], index: true, default: [] },
  ocrDone: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});
const Photo = mongoose.model('Photo', photoSchema);
mongoose
  .connect(MONGODB_URI)
  .then(() => console.log('✓ MongoDB conectado'))
  .catch((e) => console.error('✗ Error MongoDB:', e.message));
// ---------------------------------------------------------------------------
//  Helpers de URL (marca de agua se aplica al vuelo; el original queda intacto)
// ---------------------------------------------------------------------------
function watermarkOverlay(size) {
  return {
    overlay: { font_family: 'Arial', font_weight: 'bold', font_size: size, text: 'COMPRA TU FOTO' },
    color: 'white',
    opacity: 32,
    angle: -30,
    flags: 'tiled',
  };
}
// Vista previa mediana (galeria ampliada)
function previewUrl(publicId) {
  return cloudinary.url(publicId, {
    secure: true,
    transformation: [{ width: 1200, crop: 'limit', quality: 'auto', fetch_format: 'auto' }, watermarkOverlay(70)],
  });
}
// Miniatura para la cuadricula
function thumbUrl(publicId) {
  return cloudinary.url(publicId, {
    secure: true,
    transformation: [{ width: 500, height: 500, crop: 'fill', gravity: 'auto', quality: 'auto', fetch_format: 'auto' }, watermarkOverlay(38)],
  });
}
function toPublicPhoto(p) {
  return { id: p.publicId, w: p.width, h: p.height, bibs: p.bibs, preview: previewUrl(p.publicId), thumb: thumbUrl(p.publicId) };
}
// ---------------------------------------------------------------------------
//  App
// ---------------------------------------------------------------------------
const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
function requireAdmin(req, res, next) {
  const token = req.get('x-admin-token');
  if (token !== ADMIN_TOKEN) return res.status(401).json({ error: 'No autorizado' });
  next();
}
// ---- Config publica que consume el frontend ----
app.get('/api/config', (req, res) => {
  res.json({ whatsapp: WHATSAPP_NUMBER, price: PHOTO_PRICE, currency: CURRENCY, eventName: EVENT_NAME, eventDate: EVENT_DATE });
});
// ---- Busqueda por dorsal ----
app.get('/api/photos/search', async (req, res) => {
  try {
    const bib = String(req.query.bib || '').replace(/\D/g, '');
    if (!bib) return res.json({ photos: [] });
    const docs = await Photo.find({ bibs: bib }).sort({ createdAt: 1 }).limit(60);
    res.json({ photos: docs.map(toPublicPhoto) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// ---- Ver todas (paginado) para quien no aparezca en la busqueda ----
app.get('/api/photos', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(48, parseInt(req.query.limit) || 24);
    const [docs, total] = await Promise.all([
      Photo.find().sort({ createdAt: 1 }).skip((page - 1) * limit).limit(limit),
      Photo.countDocuments(),
    ]);
    res.json({ photos: docs.map(toPublicPhoto), total, page, pages: Math.ceil(total / limit) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// ============================================================================
//  ADMIN
// ============================================================================
// 1) Registrar fotos: lee la carpeta de Cloudinary y las guarda en Mongo.
//    Rapido. Se llama en tandas (usa next_cursor) hasta terminar.
app.post('/api/admin/sync', requireAdmin, async (req, res) => {
  try {
    const cursor = req.query.cursor || undefined;
    const result = await cloudinary.api.resources({
      type: 'upload',
      prefix: CLOUDINARY_FOLDER + '/',
      max_results: 100,
      next_cursor: cursor,
    });
    let nuevas = 0;
    for (const r of result.resources) {
      const upserted = await Photo.updateOne(
        { publicId: r.public_id },
        { $setOnInsert: { publicId: r.public_id, width: r.width, height: r.height, format: r.format } },
        { upsert: true }
      );
      if (upserted.upsertedCount) nuevas++;
    }
    const total = await Photo.countDocuments();
    res.json({ procesadas: result.resources.length, nuevas, total, next_cursor: result.next_cursor || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// 2) Detectar dorsales con OCR (opcional, mas lento). Procesa en tandas
//    solo las fotos que aun no tienen OCR hecho.
app.post('/api/admin/ocr', requireAdmin, async (req, res) => {
  try {
    const batch = Math.min(15, parseInt(req.query.batch) || 8);
    const pendientes = await Photo.find({ ocrDone: false }).limit(batch);
    let conDorsal = 0;
    for (const p of pendientes) {
      let bibs = [];
      try {
        const r = await cloudinary.uploader.explicit(p.publicId, { type: 'upload', ocr: 'adv_ocr' });
        const text = r?.info?.ocr?.adv_ocr?.data?.[0]?.fullTextAnnotation?.text || '';
        bibs = [...new Set((text.match(/\d{1,5}/g) || []).filter((n) => n.length >= 1 && n.length <= 5))];
      } catch (err) {
        // OCR no disponible o fallo puntual: la foto queda sin dorsal (aparece en "Ver todas")
      }
      p.bibs = bibs;
      p.ocrDone = true;
      await p.save();
      if (bibs.length) conDorsal++;
    }
    const faltan = await Photo.countDocuments({ ocrDone: false });
    res.json({ procesadas: pendientes.length, conDorsal, faltan });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// 3) Listar / buscar fotos en el panel admin
app.get('/api/admin/photos', requireAdmin, async (req, res) => {
  try {
    const q = String(req.query.bib || '').replace(/\D/g, '');
    const filter = q ? { bibs: q } : {};
    const docs = await Photo.find(filter).sort({ createdAt: 1 }).limit(60);
    res.json({ photos: docs.map((p) => ({ ...toPublicPhoto(p), ocrDone: p.ocrDone })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// 4) Corregir dorsales a mano (para las que el OCR no leyo bien)
app.post('/api/admin/tag', requireAdmin, async (req, res) => {
  try {
    const { publicId, bibs } = req.body;
    const clean = [...new Set((bibs || []).map((b) => String(b).replace(/\D/g, '')).filter(Boolean))];
    const p = await Photo.findOneAndUpdate({ publicId }, { bibs: clean, ocrDone: true }, { new: true });
    if (!p) return res.status(404).json({ error: 'Foto no encontrada' });
    res.json({ ok: true, bibs: p.bibs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// 5) Estado general
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  const [total, sinOcr, sinDorsal] = await Promise.all([
    Photo.countDocuments(),
    Photo.countDocuments({ ocrDone: false }),
    Photo.countDocuments({ ocrDone: true, bibs: { $size: 0 } }),
  ]);
  res.json({ total, sinOcr, sinDorsal });
});
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`✓ Servidor en puerto ${PORT}`));
