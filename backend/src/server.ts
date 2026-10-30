import { app } from './app';
import { env } from './env';

// Same port as the contract server, so the app's debug apiBaseUrl
// (http://10.0.2.2:4000/v1 on the Android emulator) reaches it unchanged.
// Run one or the other, not both.
app.listen(env.PORT, () => {
  console.log(`Sahla backend on http://localhost:${env.PORT}/v1`);
});
