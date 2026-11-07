// What an admin does in the dashboard (B14.6): give the paid order to the demo
// driver. Runs on this PC against the local backend; needs ADMIN_2FA=off in
// backend/.env (local development only). Input: output.orderId.
const base = 'http://localhost:4000/v1';
const jsonHeaders = { 'Content-Type': 'application/json' };
const login = http.post(base + '/admin/auth/login', {
  headers: jsonHeaders,
  body: JSON.stringify({ email: 'admin@sahla.jo', password: 'sahla1234' }),
});
const token = json(login.body).token;
if (!token) throw new Error('Admin log-in failed (is ADMIN_2FA=off in backend/.env?): ' + login.body);
const auth = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const couriers = json(http.get(base + '/admin/couriers', { headers: auth }).body);
const courier = couriers.filter(c => c.email === 'courier@sahla.jo')[0];
const assigned = http.post(base + '/admin/orders/' + output.orderId + '/assign', {
  headers: auth,
  body: JSON.stringify({ courierId: courier.id }),
});
if (assigned.status !== 200) throw new Error('Assign failed: ' + assigned.status + ' ' + assigned.body);
