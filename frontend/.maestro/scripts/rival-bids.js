// Another person bids above Ahmad on an auction. Input: LISTING, AMOUNT (fils).
const base = (typeof API !== 'undefined' ? API : 'http://localhost:4000') + '/v1';
const headers = { 'Content-Type': 'application/json' };
const login = http.post(base + '/auth/login', { headers: headers, body: JSON.stringify({ email: 'sami@demo.sahla.jo', password: 'sahla1234' }) });
const auth = { Authorization: 'Bearer ' + json(login.body).token, 'Content-Type': 'application/json' };
const bid = http.post(base + '/listings/' + LISTING + '/bids', { headers: auth, body: JSON.stringify({ amountFils: Number(AMOUNT) }) });
if (bid.status !== 201) throw new Error('Rival bid failed: ' + bid.status + ' ' + bid.body);
