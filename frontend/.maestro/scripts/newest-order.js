// The buyer's newest paid order and its delivery PIN, as the buyer's app shows
// them (GET /me/orders as ahmad@sahla.jo). Sets output.orderId and output.pin.
const base = (typeof API !== 'undefined' ? API : 'http://localhost:4000') + '/v1';
const login = http.post(base + '/auth/login', {
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'ahmad@sahla.jo', password: 'sahla1234' }),
});
const token = json(login.body).token;
const orders = json(http.get(base + '/me/orders', { headers: { Authorization: 'Bearer ' + token } }).body);
const paid = orders.filter(o => o.status === 'escrow_held')[0];
if (!paid) throw new Error('No paid order');
output.orderId = paid.id;
output.pin = paid.pin;
