// What an admin does in the dashboard (B14.6): give the paid order to the demo
// driver. Runs on this PC against the local backend; needs ADMIN_2FA=off in
// backend/.env (local development only). Input: output.orderId, or none = the
// newest paid order of ahmad@sahla.jo without a driver (the dashboard's list).
const base = 'http://localhost:4000/v1';
const jsonHeaders = { 'Content-Type': 'application/json' };
const login = http.post(base + '/admin/auth/login', {
  headers: jsonHeaders,
  body: JSON.stringify({ email: 'admin@sahla.jo', password: 'sahla1234' }),
});
const token = json(login.body).token;
if (!token) throw new Error('Admin log-in failed (is ADMIN_2FA=off in backend/.env?): ' + login.body);
const auth = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
if (!output.orderId) {
  const waiting = json(http.get(base + '/admin/orders?unassigned=true&q=ahmad%40sahla.jo', { headers: auth }).body);
  if (!waiting.length) throw new Error('No paid order of Ahmad waits for a driver');
  output.orderId = waiting[0].id;
}
const couriers = json(http.get(base + '/admin/couriers', { headers: auth }).body);
const courier = couriers.filter(c => c.email === 'courier@sahla.jo')[0];
const assigned = http.post(base + '/admin/orders/' + output.orderId + '/assign', {
  headers: auth,
  body: JSON.stringify({ courierId: courier.id }),
});
if (assigned.status !== 200) throw new Error('Assign failed: ' + assigned.status + ' ' + assigned.body);
