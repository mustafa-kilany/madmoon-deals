// `requireAuth(route)`: open the route if signed in, otherwise sign in first
// and continue there afterwards.

import { go, startAuth, type AppRoute } from '../authFlow';
import { useUser } from '../sessionStore';

export function useRequireAuth(): (route: AppRoute) => void {
  const user = useUser();
  return route => (user ? go(route) : startAuth(route));
}
