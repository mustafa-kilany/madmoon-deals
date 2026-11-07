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
    problems: number;
    completedLast30Days: Money;
  };
  payouts: { pending: { count: number; amountFils: number } };
  queues: { hiddenByReports: number; reportedListings: number; reportedUsers: number; riskFlags: number; certificates: number };
  couriers: { active: number };
};

export type Person = { id: string; name: string; email: string };

export type OrderStatus = 'awaiting_payment' | 'escrow_held' | 'completed' | 'refunded' | 'cancelled';
export type CourierStatus = 'to_pickup' | 'picked_up' | 'delivered' | 'failed';

export type OrderSummary = {
  id: string;
  status: OrderStatus;
  courierStatus: CourierStatus | null;
  item: { id: string; title: string; imageUrl: string };
  totalFils: number;
  buyer: Person | null;
  seller: Person | null;
  courier: { id: string; name: string } | null;
  /** B15.4: a failed delivery or the buyer's report at the door, waiting for an admin. */
  problem: boolean;
  createdAt: string;
};

/** Why an order didn't arrive (reason ids: frontend/src/lib/deliveryProblems.ts). */
export type Problem = { reason: string; note: string | null; at: string | null };

type Address = { name: string | null; phone: string | null; cityId: string | null; address: string | null; notes: string | null };

export type Order = OrderSummary & {
  itemPriceFils: number;
  buyerProtectionFils: number;
  deliveryFils: number;
  offerId: string | null;
  pinAttempts: number;
  pinLocked: boolean;
  delivery: Address;
  pickup: Address | null;
  paidAt: string | null;
  assignedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  refundedAt: string | null;
  cancel: Problem | null;
  itemIssue: Problem | null;
  deliveryFailed: (Problem & { stage: 'pickup' | 'dropoff' }) | null;
  problemResolution: { action: 'retry' | 'refund'; at: string | null } | null;
  payments: { id: string; provider: string; status: string; amountFils: number; createdAt: string }[];
  payout: { id: string; status: string; amountFils: number; paidAt: string | null } | null;
};

export type Payout = {
  id: string;
  orderId: string;
  itemTitle: string;
  seller: Person | null;
  amountFils: number;
  status: 'pending' | 'paid' | 'failed';
  createdAt: string;
  paidAt: string | null;
};

export type Courier = { id: string; name: string; email: string; active: boolean; createdAt: string };

export type UserSummary = {
  id: string;
  name: string;
  email: string;
  method: 'email' | 'google' | 'apple';
  role: 'courier' | 'admin' | null;
  verified: boolean;
  suspended: boolean;
  cityId: string;
  createdAt: string;
};

type OrderBrief = { id: string; status: OrderStatus; totalFils: number; createdAt: string };

export type UserDetail = UserSummary & {
  listings: Partial<Record<'active' | 'reserved' | 'sold' | 'withdrawn', number>>;
  counts: { orders: number; sales: number; reportsAboutUser: number; reportsAboutListings: number; blockedBy: number };
  riskFlags: { id: string; score: number; status: string; aiSummary: string | null; createdAt: string; reviewedAt: string | null }[];
  recentOrders: OrderBrief[];
  recentSales: OrderBrief[];
};

export type AdminAction = {
  id: string;
  admin: Person | null;
  action: string;
  target?: { type: string; id: string };
  details?: unknown;
  createdAt: string;
};

// ── Review queues (B8.3) ──────────────────────────────────────────────────────

export type ReportReason = 'scam' | 'prohibited' | 'offensive' | 'wrong_info' | 'other';

export type Report = {
  id: string;
  reporter: { id: string; name: string };
  reason: ReportReason;
  details: string | null;
  createdAt: string;
};

export type ReportedListing = {
  listing: {
    id: string;
    title: string;
    imageUrl: string;
    priceFils: number;
    status: 'active' | 'reserved' | 'sold' | 'withdrawn';
    reportHidden: boolean;
    createdAt: string;
  };
  /** A brand store has email "" and is never suspended; null = a deleted account. */
  seller: (Person & { suspended: boolean }) | null;
  reasons: Partial<Record<ReportReason, number>>;
  reports: Report[];
};

export type ReportedUser = {
  user: Person & { suspended: boolean; createdAt: string };
  reasons: Partial<Record<ReportReason, number>>;
  reports: Report[];
};

export type RiskFlagStatus = 'open' | 'dismissed' | 'actioned';

export type RiskFlag = {
  id: string;
  user: Person & { suspended: boolean; createdAt: string };
  score: number;
  signals: { kind: string; points: number; details: Record<string, unknown> }[];
  aiSummary: string | null;
  status: RiskFlagStatus;
  reviewedBy: { id: string; name: string } | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

export type CertificateToCheck = {
  id: string;
  listing: { id: string; title: string; imageUrl: string; priceFils: number; status: string } | null;
  seller: Person;
  /** What the seller chose when listing. */
  device: { category: string; type: string; brand: string; model: string | null };
  /** What was read off the paper. */
  read: { shopName: string | null; shopPhone: string | null; testedAt: string | null; device: string | null; specs: string[] };
  blurredUrl: string | null;
  createdAt: string;
};

// ── Certified Refurbished (B8.4) ──────────────────────────────────────────────

export type StoreKey = { id: string; label: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null };

export type Store = {
  id: string;
  nameEn: string;
  nameAr: string;
  onSale: number;
  lastImportAt: string | null;
  /** Where couriers collect this store's orders; null until set. */
  pickup: { phone: string; cityId: string; address: string } | null;
  keys: StoreKey[];
  createdAt: string;
};

export type ImportRowError = { row: number; sku?: string; field: string; message: string };

export type ImportResult = {
  dryRun: boolean;
  created: number;
  updated: number;
  withdrawn: number;
  errors: ImportRowError[];
  rows: number;
};

export type ImportRun = {
  id: string;
  source: string;
  mode: 'upsert' | 'replace';
  created: number;
  updated: number;
  withdrawn: number;
  errors: ImportRowError[];
  createdAt: string;
};

// ── Analytics (B8.8) ─────────────────────────────────────────────────────────

type PeriodTotals = { signups: number; listings: number; paidOrders: number; salesFils: number; reports: number };

export type Analytics = {
  days: 7 | 30 | 90;
  /** Jordan days, "2026-11-01". */
  from: string;
  to: string;
  timeZone: string;
  totals: PeriodTotals;
  /** The same length of time right before `from`. */
  previous: PeriodTotals;
  daily: ({ day: string } & PeriodTotals)[];
  ordersByStatus: Record<OrderStatus, number>;
  customersBySignIn: Record<'email' | 'google' | 'apple', number>;
  listingsByCategory: { category: string; count: number }[];
  listingsByArea: { areaId: string; count: number }[];
};
