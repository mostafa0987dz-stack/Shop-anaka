// ============================================================
//  api/order.js - وظيفة Vercel لاستقبال الطلبات وإرسالها إلى GAS
// ============================================================

export default async function handler(req, res) {
  // 1) السماح فقط بـ POST
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // 2) قراءة البيانات
  const body = req.body || {};

  // 3) مصيدة العسل (Honeypot): إذا امتلأ هذا الحقل فالمرسل روبوت
  if (body.website && body.website.trim() !== '') {
    // نعيد نجاحاً وهمياً حتى لا يعرف الروبوت أنه مكشوف
    return res.status(200).json({ ok: true });
  }

  // 4) التحقق من رقم الهاتف الجزائري
  const phone = String(body.phone || '').trim();
  if (!/^0[5-7][0-9]{8}$/.test(phone)) {
    return res.status(400).json({ ok: false, error: 'Invalid phone' });
  }

  // 5) التحقق من الاسم
  const name = String(body.name || '').trim().slice(0, 50);
  if (name.length < 2) {
    return res.status(400).json({ ok: false, error: 'Invalid name' });
  }

  // 6) التحقق من البلدية
  const commune = String(body.commune || '').trim().slice(0, 40);
  if (commune.length < 2) {
    return res.status(400).json({ ok: false, error: 'Invalid commune' });
  }

  // 7) التحقق من Turnstile (إن كنت قد فعّلته)
  const turnstileToken = body['cf-turnstile-response'];
  if (process.env.TURNSTILE_SECRET && turnstileToken) {
    const verified = await verifyTurnstile(turnstileToken, req);
    if (!verified) {
      return res.status(403).json({ ok: false, error: 'Captcha failed' });
    }
  }

  // 8) بناء تجزئة IP مختصرة (لا نخزن IP الخام احتراماً للخصوصية)
  const rawIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ipHash = rawIp
    ? Buffer.from(rawIp).toString('base64').slice(0, 10)
    : '';

  // 9) قراءة متغيرات البيئة
  const GAS_URL = process.env.GAS_WEBAPP_URL;
  const SECRET  = process.env.GAS_SECRET;

  if (!GAS_URL || !SECRET) {
    console.error('Missing env vars: GAS_WEBAPP_URL أو GAS_SECRET');
    return res.status(500).json({ ok: false, error: 'Server misconfigured' });
  }

  // 10) الإرسال إلى Google Apps Script
  try {
    const gasRes = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token:    SECRET,          // السر المشترك - لا يراه المستخدم أبداً
        name:     name,
        phone:    phone,
        commune:  commune,
        qty:      parseInt(body.qty, 10) || 1,
        product:  'دشداشة بني بقبة صينية',
        delivery: 500,
        total:    parseFloat(body.total) || 0,
        ipHash:   ipHash
      }),
      // إذا تجاوز GAS 10 ثوانٍ نُعيد خطأ
      signal: AbortSignal.timeout(10000)
    });

    const gasData = await gasRes.json();

    if (!gasData.ok) {
      console.error('GAS rejected:', gasData);
      return res.status(502).json({ ok: false, error: 'Order rejected' });
    }

    return res.status(200).json({ ok: true, message: 'Order received' });

  } catch (err) {
    console.error('GAS fetch error:', err.message);
    return res.status(502).json({ ok: false, error: 'Upstream error' });
  }
}

// ---------- التحقق من Cloudflare Turnstile ----------
async function verifyTurnstile(token, req) {
  try {
    const formData = new URLSearchParams();
    formData.append('secret', process.env.TURNSTILE_SECRET);
    formData.append('response', token);
    formData.append('remoteip', (req.headers['x-forwarded-for'] || '').split(',')[0]);

    const r = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body: formData }
    );
    const data = await r.json();
    return data.success === true;
  } catch {
    return false;
  }
}
