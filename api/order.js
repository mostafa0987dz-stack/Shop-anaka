export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const body = req.body || {};

  // التحقق من رقم الهاتف
  const phone = String(body.phone || '').trim();
  if (!/^0[5-7][0-9]{8}$/.test(phone)) {
    return res.status(400).json({ ok: false, error: 'Invalid phone' });
  }

  const GAS_URL = process.env.GAS_WEBAPP_URL;

  if (!GAS_URL) {
    return res.status(500).json({ ok: false, error: 'Server misconfigured (Missing URL)' });
  }

  try {
    // إرسال البيانات إلى Google Script
    const gasRes = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:     body.name,
        phone:    phone,
        commune:  body.commune,
        qty:      parseInt(body.qty, 10) || 1,
        total:    parseFloat(body.total) || 0
      })
    });

    const gasData = await gasRes.json();

    if (!gasData.ok) {
      console.error('GAS rejected:', gasData);
      return res.status(502).json({ ok: false, error: gasData.error || 'Rejected by Google' });
    }

    return res.status(200).json({ ok: true, message: 'Order received' });

  } catch (err) {
    console.error('Fetch error:', err.message);
    return res.status(502).json({ ok: false, error: 'Connection to Google failed' });
  }
}
