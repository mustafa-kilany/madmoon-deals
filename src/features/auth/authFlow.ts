// Sign-in gating (DEVELOPMENT_GUIDE §3.4). A guest who tries to buy, bid,
// chat or sell is sent to sign in, and lands where they were going once
// they're in (prototype requireAuth / pendingAction / finishAuth).

import { CommonActions } from '@react-navigation/native';
import { create } from 'zustand';
import { navigationRef } from '@/navigation/navigationRef';
import type { RootStackParamList } from '@/navigation/types';

/** Any root route with its params, e.g. { name: 'Checkout', params: { itemId } }. */
export type AppRoute = {
  [K in keyof RootStackParamList]: {
    name: K;
    params?: RootStackParamList[K];
  };
}[keyof RootStackParamList];

/** Screens of the sign-in flow, removed from history once signed in. */
const AUTH_ROUTES: string[] = ['Auth', 'EmailAuth', 'IdVerification'];

type AuthFlowState = {
  pending: AppRoute | null;
  setPending: (route: AppRoute | null) => void;
};

export const useAuthFlowStore = create<AuthFlowState>()(set => ({
  pending: null,
  setPending: pending => set({ pending }),
}));

export const go = ({ name, params }: AppRoute) => {
  if (navigationRef.isReady()) {
    navigationRef.dispatch(CommonActions.navigate(name, params));
  }
};

/** Start sign-in, remembering where to continue afterwards. */
export function startAuth(then: AppRoute | null) {
  useAuthFlowStore.getState().setPending(then);
  if (navigationRef.isReady()) {
    navigationRef.navigate('Auth');
  }
}

/** Close the sign-in screens and continue to the pending route, if any. */
export function leaveAuth() {
  const { pending, setPending } = useAuthFlowStore.getState();
  setPending(null);
  if (navigationRef.isReady()) {
    navigationRef.dispatch(state => {
      const routes = state.routes.filter(r => !AUTH_ROUTES.includes(r.name));
      return CommonActions.reset({ ...state, routes, index: routes.length - 1 });
    });
    if (pending) go(pending);
  }
}
