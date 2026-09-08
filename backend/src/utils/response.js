/** Every successful response uses this envelope, so the client can unwrap once. */
const ok = (res, data, message) => res.json({ success: true, data, message });

const created = (res, data, message) => res.status(201).json({ success: true, data, message });

module.exports = { ok, created };
