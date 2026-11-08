// The seller's side of an offer, as the seller's own phone would do it, through the API.
// Input: SELLER (the demo seller's email), COUNTER (fils). Counters the newest offer and writes a message.
const base = (typeof API !== 'undefined' ? API : 'http://localhost:4000') + '/v1';
const headers = { 'Content-Type': 'application/json' };
const login = http.post(base + '/auth/login', { headers: headers, body: JSON.stringify({ email: SELLER, password: 'sahla1234' }) });
const token = json(login.body).token;
if (!token) throw new Error('Seller log-in failed: ' + login.body);
const auth = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const chats = json(http.get(base + '/chats', { headers: auth }).body);
if (!chats.length) throw new Error('The seller has no chat: the buyer’s offer did not arrive');
const messages = json(http.get(base + '/chats/' + chats[0].id + '/messages', { headers: auth }).body);
const fromBuyer = messages.filter(m => m.text === 'Is it still available?');
if (!fromBuyer.length) throw new Error('The seller did not get the buyer’s message');
const withOffer = messages.filter(m => m.offer);
const offer = withOffer[withOffer.length - 1].offer;
const answered = http.post(base + '/offers/' + offer.id + '/respond', { headers: auth, body: JSON.stringify({ status: 'countered', counterAmountFils: Number(COUNTER) }) });
if (answered.status !== 200) throw new Error('Counter failed: ' + answered.status + ' ' + answered.body);
const sent = http.post(base + '/chats/' + chats[0].id + '/messages', { headers: auth, body: JSON.stringify({ text: 'Yes, and I can do this price' }) });
if (sent.status !== 201) throw new Error('Message failed: ' + sent.status + ' ' + sent.body);
