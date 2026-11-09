// The seller writes in their newest chat, as their own phone would. Input: SELLER (email), TEXTS (separated by |).
const base = (typeof API !== 'undefined' ? API : 'http://localhost:4000') + '/v1';
const headers = { 'Content-Type': 'application/json' };
const login = http.post(base + '/auth/login', { headers: headers, body: JSON.stringify({ email: SELLER, password: 'sahla1234' }) });
const token = json(login.body).token;
if (!token) throw new Error('Seller log-in failed: ' + login.body);
const auth = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const chats = json(http.get(base + '/chats', { headers: auth }).body);
if (!chats.length) throw new Error('The seller has no chat: run 05 first');
TEXTS.split('|').forEach(text => {
  const sent = http.post(base + '/chats/' + chats[0].id + '/messages', { headers: auth, body: JSON.stringify({ text: text }) });
  if (sent.status !== 201) throw new Error('Message failed: ' + sent.status + ' ' + sent.body);
});
