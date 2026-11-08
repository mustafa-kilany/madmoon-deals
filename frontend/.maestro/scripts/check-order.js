// The newest order of ahmad@sahla.jo: is its price what was agreed? Input: LISTING, PRICE (fils).
const base = (typeof API !== 'undefined' ? API : 'http://localhost:4000') + '/v1';
const login = http.post(base + '/auth/login', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ahmad@sahla.jo', password: 'sahla1234' }) });
const auth = { Authorization: 'Bearer ' + json(login.body).token };
const orders = json(http.get(base + '/me/orders', { headers: auth }).body).filter(o => o.itemId === LISTING);
if (!orders.length) throw new Error('No order for ' + LISTING);
if (orders[0].itemPriceFils !== Number(PRICE)) throw new Error('Order price ' + orders[0].itemPriceFils + ', expected ' + PRICE);
if (orders[0].status !== 'escrow_held') throw new Error('Order status ' + orders[0].status);
output.orderId = orders[0].id;
