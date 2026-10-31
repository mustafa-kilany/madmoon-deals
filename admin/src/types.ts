// Response shapes of the admin endpoints (docs/API.md → Admin dashboard).

export type Admin = { id: string; name: string; email: string };

export type LoginStart = {
  challenge: string;
  /** Until the authenticator app is set up: show the QR code. */
  setup?: { secret: string; otpauthUrl: string };
};

export type LoginDone = { token: string; expiresInHours: number; admin: Admin };

type Money = { count: number; totalFils: number };

export type Stats = {
  users: { total: number; newThisWeek: number };
  listings: { active: number; newThisWeek: number };
  orders: {
    awaitingPayment: number;
    escrowHeld: Money;
    toAssign: number;
    completedLast30Days: Money;
  };
  payouts: { pending: { count: number; amountFils: number } };
  queues: { hiddenByReports: number; riskFlags: number; certificates: number };
  couriers: { active: number };
};
