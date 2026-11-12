// Turns an uploaded picture of a signature into a small transparent PNG data URL:
//   1. scale it down for processing
//   2. make the (near-)white paper transparent, keep the ink
//   3. crop away the empty margins
//   4. shrink to at most 400 x 150 px
// The result is a short text string (about 10-60 KB) that fits in the Firestore
// profile document, so no file storage is needed.

export const MAX_SIGNATURE_BYTES = 150 * 1024;   // length of the data URL string

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file is not an image.")); };
    img.src = url;
  });
}

function makeCanvas(w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  return canvas;
}

export async function processSignature(file, { maxW = 400, maxH = 150 } = {}) {
  if (!file || !file.type.startsWith("image/")) {
    throw new Error("Please choose an image file (PNG or JPG).");
  }

  const img = await loadImage(file);

  // 1. working copy, at most 1000 px wide
  const work = Math.min(1, 1000 / img.naturalWidth);
  const base = makeCanvas(img.naturalWidth * work, img.naturalHeight * work);
  const ctx = base.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, base.width, base.height);

  // 2. paper -> transparent. Light pixels fade out, dark ink stays solid.
  const data = ctx.getImageData(0, 0, base.width, base.height);
  const px = data.data;
  const LIGHT = 225;   // at or above this brightness: fully transparent
  const DARK = 150;    // at or below this brightness: fully opaque
  let minX = base.width, minY = base.height, maxX = -1, maxY = -1;

  for (let y = 0; y < base.height; y++) {
    for (let x = 0; x < base.width; x++) {
      const i = (y * base.width + x) * 4;
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      const sourceAlpha = px[i + 3] / 255;
      const ink = Math.min(1, Math.max(0, (LIGHT - lum) / (LIGHT - DARK)));
      const alpha = Math.round(ink * sourceAlpha * 255);
      px[i + 3] = alpha;
      if (alpha > 40) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) throw new Error("Couldn't find any ink in that picture. Try a clearer photo on white paper.");
  ctx.putImageData(data, 0, 0);

  // 3. crop to the ink with a little padding
  const pad = 6;
  const cx = Math.max(0, minX - pad);
  const cy = Math.max(0, minY - pad);
  const cw = Math.min(base.width - cx, maxX - minX + 1 + pad * 2);
  const ch = Math.min(base.height - cy, maxY - minY + 1 + pad * 2);

  // 4. scale down to fit the box, retrying smaller if the string is too long
  let scale = Math.min(1, maxW / cw, maxH / ch);
  for (let attempt = 0; attempt < 4; attempt++) {
    const out = makeCanvas(cw * scale, ch * scale);
    const octx = out.getContext("2d");
    octx.imageSmoothingQuality = "high";
    octx.drawImage(base, cx, cy, cw, ch, 0, 0, out.width, out.height);
    const dataUrl = out.toDataURL("image/png");
    if (dataUrl.length <= MAX_SIGNATURE_BYTES) return dataUrl;
    scale *= 0.7;
  }
  throw new Error("That signature image is too detailed. Try a simpler, cleaner picture.");
}
