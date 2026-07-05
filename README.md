# Fotos de carrera · guía rápida
App para que los corredores busquen sus fotos por dorsal y las compren por WhatsApp.
Sin paso de build. Se sube tal cual a GitHub y se deploya en Render.
---
## 1. Cuenta de Cloudinary (gratis, ~2 min)
1. Crea cuenta en cloudinary.com.
2. En el **Dashboard** copia tu **API Environment variable**, que se ve así:
   `cloudinary://123456789:AbCdEf@tu-cloud-name`
   Ese texto completo es tu `CLOUDINARY_URL`.
3. (Opcional pero recomendado) Activa el add-on de OCR: menú **Add-ons → "OCR Text Detection and Extraction" → Subscribe** (tiene plan gratis con límite mensual). Sin esto, el Paso 2 (detección automática) no leerá números, pero todo lo demás funciona y puedes etiquetar a mano.
## 2. Subir a GitHub
Crea un repo nuevo y sube estos archivos con esta estructura (respeta las carpetas):
```
package.json
server.js
public/index.html
public/admin.html
public/logo.png
```
En el editor web de GitHub, para crear los de la carpeta escribe el nombre como `public/index.html`. El `logo.png` se sube con "Add file → Upload files".
## 3. Deploy en Render
1. **New → Web Service** y conecta el repo.
2. Build Command: `npm install`  ·  Start Command: `npm start`
3. En **Environment** agrega estas variables:
| Variable | Valor |
|---|---|
| `MONGODB_URI` | tu cadena de MongoDB Atlas |
| `CLOUDINARY_URL` | la que copiaste (cloudinary://...) |
| `CLOUDINARY_FOLDER` | `carrera` (o el nombre que uses) |
| `ADMIN_TOKEN` | una clave secreta tuya (para /admin) |
| `WHATSAPP_NUMBER` | tu número con código país, sin + ni espacios (ej. `18091234567`) |
| `PHOTO_PRICE` | `5` |
| `CURRENCY` | `USD` |
| `EVENT_NAME` | nombre del evento (ej. `SD Corre 5K`) |
4. Deploy. Render te da una URL tipo `https://tu-app.onrender.com`.
> Nota: el plan gratis de Render "duerme" tras inactividad; la primera visita tarda ~30 s en despertar. Para el día del evento, ábrela una vez temprano para despertarla.
## 4. El día de la carrera
1. Sube TODAS las fotos a la carpeta `carrera` en Cloudinary (Media Library → arrastra y suelta; aguanta miles).
2. Abre `https://tu-app.onrender.com/admin` y entra con tu `ADMIN_TOKEN`.
3. **Paso 1 – Registrar fotos**: pulsa una vez, registra todo lo que subiste.
4. **Paso 2 – Detectar dorsales (OCR)**: opcional. Lee los números automáticamente.
5. **Paso 3 – Corregir a mano**: revisa las que no leyeron bien y escribe el dorsal.
6. Comparte el link principal (`https://tu-app.onrender.com`) con los corredores.
## Cómo cobras
El corredor busca su dorsal → ve la foto con marca de agua → toca **"Comprar por WhatsApp"**.
Te llega el mensaje con el ID de la foto. Confirmas el pago (transferencia / tPago / etc.) y le
envías el original sin marca de agua. Los originales quedan intactos en tu Cloudinary; la marca
de agua solo se pone al vuelo en lo que ve el público.
## Ideas para después
- LLC en EE.UU. → habilita Stripe + Payoneer legítimo y cobro automático con tarjeta.
- Paquetes (todas mis fotos por US$X).
- Descarga automática tras pago cuando tengas pasarela.
