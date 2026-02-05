import {
  Program,
  AnchorProvider,
  BN,
  Idl,
  IdlEvents,
  utils,
  Wallet,
} from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Keypair,
  TransactionSignature,
  GetProgramAccountsFilter,
  MemcmpFilter,
} from "@solana/web3.js";

// ============================================================
// CONSTANTS
// ============================================================

/** The on-chain program ID for the SolAgent Economy Protocol. */
export const SOLAGENT_PROGRAM_ID = new PublicKey(
  "FDBu2qdatZd7J1TiDTjCbzNtjqwuJi25UPY7qUdBBFNQ"
);

/** Number of lamports per SOL. */
const LAMPORTS_PER_SOL = 1_000_000_000;

/** Anchor account discriminator size in bytes. */
const DISCRIMINATOR_SIZE = 8;

// ============================================================
// PDA SEED CONSTANTS
// ============================================================

const SEED_PROTOCOL = "protocol";
const SEED_AGENT = "agent";
const SEED_VAULT = "vault";
const SEED_FEEDBACK = "feedback";
const SEED_SERVICE = "service";
const SEED_PAYMENT = "payment";
const SEED_ESCROW = "escrow";
const SEED_STREAM = "stream";
const SEED_STREAM_VAULT = "stream_vault";

// ============================================================
// ENUMS
// ============================================================

/** Pricing model for an agent service. */
export enum PriceModel {
  /** One-time fixed payment. */
  Fixed = "fixed",
  /** Pay per API call / request. */
  PerRequest = "perRequest",
  /** Streaming pay-per-second. */
  PerSecond = "perSecond",
  /** Pay per output token. */
  PerToken = "perToken",
  /** Highest bidder wins. */
  Auction = "auction",
}

/** Status of an escrowed payment. */
export enum PaymentStatus {
  Escrowed = "escrowed",
  Released = "released",
  Refunded = "refunded",
  Disputed = "disputed",
}

// ============================================================
// ACCOUNT TYPES
// ============================================================

/** Global protocol configuration and statistics. */
export interface ProtocolAccount {
  authority: PublicKey;
  totalAgents: BN;
  totalServices: BN;
  totalPayments: BN;
  totalVolume: BN;
  totalStaked: BN;
  feeBps: number;
  treasury: PublicKey;
  bump: number;
}

/** On-chain agent identity and reputation profile. */
export interface AgentAccount {
  authority: PublicKey;
  name: string;
  description: string;
  capabilities: string[];
  endpoint: string;
  reputationScore: BN;
  totalStaked: BN;
  totalEarned: BN;
  totalSpent: BN;
  servicesCompleted: BN;
  servicesRequested: BN;
  feedbacksReceived: BN;
  registeredAt: BN;
  isActive: boolean;
  bump: number;
}

/** An agent-to-agent feedback record. */
export interface FeedbackAccount {
  fromAgent: PublicKey;
  toAgent: PublicKey;
  rating: number;
  comment: string;
  timestamp: BN;
  bump: number;
}

/** A service listing on the agent marketplace. */
export interface ServiceAccount {
  provider: PublicKey;
  authority: PublicKey;
  serviceId: string;
  title: string;
  description: string;
  priceLamports: BN;
  priceModel: Record<string, object>;
  tags: string[];
  totalOrders: BN;
  totalRevenue: BN;
  avgRating: number;
  isActive: boolean;
  createdAt: BN;
  bump: number;
}

/** An escrowed payment for a service. */
export interface PaymentAccount {
  payer: PublicKey;
  receiver: PublicKey;
  service: PublicKey;
  amount: BN;
  intent: string;
  conditions: string[];
  status: Record<string, object>;
  createdAt: BN;
  timeoutAt: BN;
  completedAt: BN;
  bump: number;
  escrowBump: number;
}

/** A streaming payment channel between two agents. */
export interface StreamAccount {
  payer: PublicKey;
  receiver: PublicKey;
  ratePerSecond: BN;
  deposited: BN;
  withdrawn: BN;
  startedAt: BN;
  maxEndAt: BN;
  lastWithdrawnAt: BN;
  isActive: boolean;
  bump: number;
  vaultBump: number;
}

// ============================================================
// EVENT TYPES
// ============================================================

/** Emitted when the protocol is first initialized. */
export interface ProtocolInitializedEvent {
  authority: PublicKey;
  timestamp: BN;
}

/** Emitted when a new agent registers. */
export interface AgentRegisteredEvent {
  agent: PublicKey;
  authority: PublicKey;
  name: string;
  timestamp: BN;
}

/** Emitted when an agent stakes SOL for reputation. */
export interface ReputationStakedEvent {
  agent: PublicKey;
  amount: BN;
  newScore: BN;
  totalStaked: BN;
}

/** Emitted when feedback is submitted for an agent. */
export interface FeedbackSubmittedEvent {
  from: PublicKey;
  to: PublicKey;
  rating: number;
  newReputation: BN;
}

/** Emitted when a new service is created on the marketplace. */
export interface ServiceCreatedEvent {
  service: PublicKey;
  provider: PublicKey;
  title: string;
  price: BN;
  priceModel: Record<string, object>;
}

/** Emitted when a payment is created (escrowed). */
export interface PaymentCreatedEvent {
  payment: PublicKey;
  payer: PublicKey;
  receiver: PublicKey;
  amount: BN;
  intent: string;
}

/** Emitted when an escrowed payment is released to the receiver. */
export interface PaymentReleasedEvent {
  payment: PublicKey;
  receiver: PublicKey;
  amount: BN;
  latencyMs: BN;
}

/** Emitted when an escrowed payment is refunded to the payer. */
export interface PaymentRefundedEvent {
  payment: PublicKey;
  payer: PublicKey;
  amount: BN;
  reason: string;
}

/** Emitted when a streaming payment channel is created. */
export interface StreamCreatedEvent {
  stream: PublicKey;
  payer: PublicKey;
  receiver: PublicKey;
  ratePerSecond: BN;
  deposit: BN;
}

/** Emitted when funds are withdrawn from a stream. */
export interface StreamWithdrawnEvent {
  stream: PublicKey;
  amount: BN;
  totalWithdrawn: BN;
  isActive: boolean;
}

// ============================================================
// QUERY / FILTER TYPES
// ============================================================

/** Filter options for searching services on the marketplace. */
export interface FindServicesFilter {
  /** Filter by a specific tag (exact match). */
  tag?: string;
  /** Filter by provider agent PDA. */
  provider?: PublicKey;
  /** Only return services from agents with at least this reputation score. */
  minReputation?: number;
  /** Only return active services. Defaults to true. */
  activeOnly?: boolean;
}

/** Options for creating a payment and immediately releasing it. */
export interface PayAndReleaseOptions {
  /** The service PDA to pay for. */
  servicePda: PublicKey;
  /** Amount in SOL. */
  amountSol: number;
  /** Freeform intent describing what is being paid for. */
  intent: string;
  /** Optional conditions that must be met. */
  conditions?: string[];
  /** Timeout in seconds before the escrowed payment can be refunded. Default: 3600 (1 hour). */
  timeoutSeconds?: number;
  /** The receiver agent's authority public key (wallet that receives SOL). */
  receiverAuthority: PublicKey;
}

/** Options for creating and funding a stream in one call. */
export interface CreateAndFundStreamOptions {
  /** The receiver agent PDA. */
  receiverAgentPda: PublicKey;
  /** Rate in SOL per second. */
  ratePerSecondSol: number;
  /** Maximum duration of the stream in seconds. */
  maxDurationSeconds: number;
  /** Deposit amount in SOL. If omitted, defaults to rate * maxDuration. */
  depositSol?: number;
}

// ============================================================
// MINIMAL IDL
// ============================================================

/**
 * Minimal Anchor IDL for the SolAgent program.
 *
 * This IDL is embedded so the SDK can work without requiring the consumer to
 * generate or fetch the IDL separately. It covers all 10 instructions, all 6
 * account types, and all events.
 */
const SOLAGENT_IDL: Idl = {
  version: "0.1.0",
  name: "solagent",
  instructions: [
    {
      name: "initializeProtocol",
      accounts: [
        { name: "protocol", isMut: true, isSigner: false },
        { name: "authority", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [],
    },
    {
      name: "registerAgent",
      accounts: [
        { name: "agent", isMut: true, isSigner: false },
        { name: "authority", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [
        { name: "name", type: "string" },
        { name: "description", type: "string" },
        { name: "capabilities", type: { vec: "string" } },
        { name: "endpoint", type: "string" },
      ],
    },
    {
      name: "stakeReputation",
      accounts: [
        { name: "agent", isMut: true, isSigner: false },
        { name: "vault", isMut: true, isSigner: false },
        { name: "authority", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [{ name: "amount", type: "u64" }],
    },
    {
      name: "submitFeedback",
      accounts: [
        { name: "feedback", isMut: true, isSigner: false },
        { name: "fromAgent", isMut: false, isSigner: false },
        { name: "toAgent", isMut: true, isSigner: false },
        { name: "authority", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [
        { name: "rating", type: "u8" },
        { name: "comment", type: "string" },
      ],
    },
    {
      name: "createService",
      accounts: [
        { name: "service", isMut: true, isSigner: false },
        { name: "agent", isMut: false, isSigner: false },
        { name: "authority", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [
        { name: "serviceId", type: "string" },
        { name: "title", type: "string" },
        { name: "description", type: "string" },
        { name: "priceLamports", type: "u64" },
        {
          name: "priceModel",
          type: {
            defined: "PriceModel",
          },
        },
        { name: "tags", type: { vec: "string" } },
      ],
    },
    {
      name: "payForService",
      accounts: [
        { name: "payment", isMut: true, isSigner: false },
        { name: "escrow", isMut: true, isSigner: false },
        { name: "payerAgent", isMut: true, isSigner: false },
        { name: "receiverAgent", isMut: false, isSigner: false },
        { name: "service", isMut: true, isSigner: false },
        { name: "payerAuthority", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [
        { name: "amount", type: "u64" },
        { name: "intent", type: "string" },
        { name: "conditions", type: { vec: "string" } },
        { name: "timeoutSeconds", type: "i64" },
      ],
    },
    {
      name: "releasePayment",
      accounts: [
        { name: "payment", isMut: true, isSigner: false },
        { name: "escrow", isMut: true, isSigner: false },
        { name: "payerAgent", isMut: false, isSigner: false },
        { name: "receiverAgent", isMut: true, isSigner: false },
        { name: "service", isMut: true, isSigner: false },
        { name: "receiverAuthority", isMut: true, isSigner: false },
        { name: "authority", isMut: false, isSigner: true },
      ],
      args: [],
    },
    {
      name: "refundPayment",
      accounts: [
        { name: "payment", isMut: true, isSigner: false },
        { name: "escrow", isMut: true, isSigner: false },
        { name: "payerAgent", isMut: false, isSigner: false },
        { name: "payerAuthority", isMut: true, isSigner: false },
        { name: "authority", isMut: false, isSigner: true },
      ],
      args: [],
    },
    {
      name: "createStream",
      accounts: [
        { name: "stream", isMut: true, isSigner: false },
        { name: "streamVault", isMut: true, isSigner: false },
        { name: "payerAgent", isMut: false, isSigner: false },
        { name: "receiverAgent", isMut: false, isSigner: false },
        { name: "payerAuthority", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [
        { name: "ratePerSecond", type: "u64" },
        { name: "maxDurationSeconds", type: "u64" },
        { name: "depositAmount", type: "u64" },
      ],
    },
    {
      name: "withdrawStream",
      accounts: [
        { name: "stream", isMut: true, isSigner: false },
        { name: "streamVault", isMut: true, isSigner: false },
        { name: "receiverAgent", isMut: true, isSigner: false },
        { name: "receiverAuthority", isMut: true, isSigner: false },
        { name: "payerAuthority", isMut: true, isSigner: false },
        { name: "authority", isMut: false, isSigner: true },
      ],
      args: [],
    },
  ],
  accounts: [
    {
      name: "Protocol",
      type: {
        kind: "struct",
        fields: [
          { name: "authority", type: "publicKey" },
          { name: "totalAgents", type: "u64" },
          { name: "totalServices", type: "u64" },
          { name: "totalPayments", type: "u64" },
          { name: "totalVolume", type: "u64" },
          { name: "totalStaked", type: "u64" },
          { name: "feeBps", type: "u16" },
          { name: "treasury", type: "publicKey" },
          { name: "bump", type: "u8" },
        ],
      },
    },
    {
      name: "Agent",
      type: {
        kind: "struct",
        fields: [
          { name: "authority", type: "publicKey" },
          { name: "name", type: "string" },
          { name: "description", type: "string" },
          { name: "capabilities", type: { vec: "string" } },
          { name: "endpoint", type: "string" },
          { name: "reputationScore", type: "u64" },
          { name: "totalStaked", type: "u64" },
          { name: "totalEarned", type: "u64" },
          { name: "totalSpent", type: "u64" },
          { name: "servicesCompleted", type: "u64" },
          { name: "servicesRequested", type: "u64" },
          { name: "feedbacksReceived", type: "u64" },
          { name: "registeredAt", type: "i64" },
          { name: "isActive", type: "bool" },
          { name: "bump", type: "u8" },
        ],
      },
    },
    {
      name: "Service",
      type: {
        kind: "struct",
        fields: [
          { name: "provider", type: "publicKey" },
          { name: "authority", type: "publicKey" },
          { name: "serviceId", type: "string" },
          { name: "title", type: "string" },
          { name: "description", type: "string" },
          { name: "priceLamports", type: "u64" },
          {
            name: "priceModel",
            type: { defined: "PriceModel" },
          },
          { name: "tags", type: { vec: "string" } },
          { name: "totalOrders", type: "u64" },
          { name: "totalRevenue", type: "u64" },
          { name: "avgRating", type: "u8" },
          { name: "isActive", type: "bool" },
          { name: "createdAt", type: "i64" },
          { name: "bump", type: "u8" },
        ],
      },
    },
    {
      name: "Payment",
      type: {
        kind: "struct",
        fields: [
          { name: "payer", type: "publicKey" },
          { name: "receiver", type: "publicKey" },
          { name: "service", type: "publicKey" },
          { name: "amount", type: "u64" },
          { name: "intent", type: "string" },
          { name: "conditions", type: { vec: "string" } },
          {
            name: "status",
            type: { defined: "PaymentStatus" },
          },
          { name: "createdAt", type: "i64" },
          { name: "timeoutAt", type: "i64" },
          { name: "completedAt", type: "i64" },
          { name: "bump", type: "u8" },
          { name: "escrowBump", type: "u8" },
        ],
      },
    },
    {
      name: "Feedback",
      type: {
        kind: "struct",
        fields: [
          { name: "fromAgent", type: "publicKey" },
          { name: "toAgent", type: "publicKey" },
          { name: "rating", type: "u8" },
          { name: "comment", type: "string" },
          { name: "timestamp", type: "i64" },
          { name: "bump", type: "u8" },
        ],
      },
    },
    {
      name: "Stream",
      type: {
        kind: "struct",
        fields: [
          { name: "payer", type: "publicKey" },
          { name: "receiver", type: "publicKey" },
          { name: "ratePerSecond", type: "u64" },
          { name: "deposited", type: "u64" },
          { name: "withdrawn", type: "u64" },
          { name: "startedAt", type: "i64" },
          { name: "maxEndAt", type: "i64" },
          { name: "lastWithdrawnAt", type: "i64" },
          { name: "isActive", type: "bool" },
          { name: "bump", type: "u8" },
          { name: "vaultBump", type: "u8" },
        ],
      },
    },
  ],
  types: [
    {
      name: "PriceModel",
      type: {
        kind: "enum",
        variants: [
          { name: "Fixed" },
          { name: "PerRequest" },
          { name: "PerSecond" },
          { name: "PerToken" },
          { name: "Auction" },
        ],
      },
    },
    {
      name: "PaymentStatus",
      type: {
        kind: "enum",
        variants: [
          { name: "Escrowed" },
          { name: "Released" },
          { name: "Refunded" },
          { name: "Disputed" },
        ],
      },
    },
  ],
  events: [
    {
      name: "ProtocolInitialized",
      fields: [
        { name: "authority", type: "publicKey", index: false },
        { name: "timestamp", type: "i64", index: false },
      ],
    },
    {
      name: "AgentRegistered",
      fields: [
        { name: "agent", type: "publicKey", index: false },
        { name: "authority", type: "publicKey", index: false },
        { name: "name", type: "string", index: false },
        { name: "timestamp", type: "i64", index: false },
      ],
    },
    {
      name: "ReputationStaked",
      fields: [
        { name: "agent", type: "publicKey", index: false },
        { name: "amount", type: "u64", index: false },
        { name: "newScore", type: "u64", index: false },
        { name: "totalStaked", type: "u64", index: false },
      ],
    },
    {
      name: "FeedbackSubmitted",
      fields: [
        { name: "from", type: "publicKey", index: false },
        { name: "to", type: "publicKey", index: false },
        { name: "rating", type: "u8", index: false },
        { name: "newReputation", type: "u64", index: false },
      ],
    },
    {
      name: "ServiceCreated",
      fields: [
        { name: "service", type: "publicKey", index: false },
        { name: "provider", type: "publicKey", index: false },
        { name: "title", type: "string", index: false },
        { name: "price", type: "u64", index: false },
        {
          name: "priceModel",
          type: { defined: "PriceModel" },
          index: false,
        },
      ],
    },
    {
      name: "PaymentCreated",
      fields: [
        { name: "payment", type: "publicKey", index: false },
        { name: "payer", type: "publicKey", index: false },
        { name: "receiver", type: "publicKey", index: false },
        { name: "amount", type: "u64", index: false },
        { name: "intent", type: "string", index: false },
      ],
    },
    {
      name: "PaymentReleased",
      fields: [
        { name: "payment", type: "publicKey", index: false },
        { name: "receiver", type: "publicKey", index: false },
        { name: "amount", type: "u64", index: false },
        { name: "latencyMs", type: "u64", index: false },
      ],
    },
    {
      name: "PaymentRefunded",
      fields: [
        { name: "payment", type: "publicKey", index: false },
        { name: "payer", type: "publicKey", index: false },
        { name: "amount", type: "u64", index: false },
        { name: "reason", type: "string", index: false },
      ],
    },
    {
      name: "StreamCreated",
      fields: [
        { name: "stream", type: "publicKey", index: false },
        { name: "payer", type: "publicKey", index: false },
        { name: "receiver", type: "publicKey", index: false },
        { name: "ratePerSecond", type: "u64", index: false },
        { name: "deposit", type: "u64", index: false },
      ],
    },
    {
      name: "StreamWithdrawn",
      fields: [
        { name: "stream", type: "publicKey", index: false },
        { name: "amount", type: "u64", index: false },
        { name: "totalWithdrawn", type: "u64", index: false },
        { name: "isActive", type: "bool", index: false },
      ],
    },
  ],
  errors: [
    { code: 6000, name: "NameTooLong", msg: "Name exceeds 32 characters" },
    {
      code: 6001,
      name: "DescriptionTooLong",
      msg: "Description exceeds 256 characters",
    },
    {
      code: 6002,
      name: "TooManyCapabilities",
      msg: "Too many capabilities (max 10)",
    },
    {
      code: 6003,
      name: "ZeroAmount",
      msg: "Amount must be greater than zero",
    },
    {
      code: 6004,
      name: "InvalidRating",
      msg: "Rating must be between 1 and 5",
    },
    {
      code: 6005,
      name: "CommentTooLong",
      msg: "Comment exceeds 256 characters",
    },
    { code: 6006, name: "TitleTooLong", msg: "Title exceeds 64 characters" },
    { code: 6007, name: "TooManyTags", msg: "Too many tags (max 5)" },
    {
      code: 6008,
      name: "IntentTooLong",
      msg: "Intent exceeds 256 characters",
    },
    {
      code: 6009,
      name: "PaymentNotEscrowed",
      msg: "Payment is not in escrowed state",
    },
    { code: 6010, name: "RefundNotAllowed", msg: "Refund not allowed" },
    {
      code: 6011,
      name: "InsufficientDeposit",
      msg: "Insufficient deposit for stream",
    },
    { code: 6012, name: "StreamNotActive", msg: "Stream is not active" },
    { code: 6013, name: "NothingToWithdraw", msg: "Nothing to withdraw" },
    { code: 6014, name: "Unauthorized", msg: "Unauthorized" },
  ],
} as unknown as Idl;

// ============================================================
// HELPERS
// ============================================================

/**
 * Convert a SOL amount (as a floating-point number) to lamports (as BN).
 * @param sol - Amount in SOL (e.g. 1.5)
 * @returns BN representing lamports
 */
export function solToLamports(sol: number): BN {
  return new BN(Math.round(sol * LAMPORTS_PER_SOL));
}

/**
 * Convert lamports (as BN) to a SOL amount (floating-point).
 * @param lamports - BN representing lamports
 * @returns number representing SOL
 */
export function lamportsToSol(lamports: BN): number {
  return lamports.toNumber() / LAMPORTS_PER_SOL;
}

/**
 * Convert a PriceModel enum string into the Anchor-compatible variant object.
 * @param model - The PriceModel enum value
 * @returns Anchor-serializable enum variant
 */
function priceModelToAnchor(
  model: PriceModel
): Record<string, Record<string, never>> {
  const map: Record<PriceModel, string> = {
    [PriceModel.Fixed]: "fixed",
    [PriceModel.PerRequest]: "perRequest",
    [PriceModel.PerSecond]: "perSecond",
    [PriceModel.PerToken]: "perToken",
    [PriceModel.Auction]: "auction",
  };
  return { [map[model]]: {} };
}

/**
 * Parse an Anchor enum variant object back to a PriceModel enum value.
 * @param variant - The Anchor enum variant object
 * @returns PriceModel value
 */
export function parsePriceModel(
  variant: Record<string, unknown>
): PriceModel {
  const key = Object.keys(variant)[0];
  const map: Record<string, PriceModel> = {
    fixed: PriceModel.Fixed,
    perRequest: PriceModel.PerRequest,
    perSecond: PriceModel.PerSecond,
    perToken: PriceModel.PerToken,
    auction: PriceModel.Auction,
  };
  return map[key] ?? PriceModel.Fixed;
}

/**
 * Parse an Anchor enum variant object back to a PaymentStatus enum value.
 * @param variant - The Anchor enum variant object
 * @returns PaymentStatus value
 */
export function parsePaymentStatus(
  variant: Record<string, unknown>
): PaymentStatus {
  const key = Object.keys(variant)[0];
  const map: Record<string, PaymentStatus> = {
    escrowed: PaymentStatus.Escrowed,
    released: PaymentStatus.Released,
    refunded: PaymentStatus.Refunded,
    disputed: PaymentStatus.Disputed,
  };
  return map[key] ?? PaymentStatus.Escrowed;
}

// ============================================================
// SDK CLASS
// ============================================================

/**
 * SolAgentSDK provides a developer-friendly TypeScript interface for
 * interacting with the SolAgent Economy Protocol on Solana.
 *
 * The protocol enables AI agent identity, reputation staking, on-chain
 * marketplace, escrowed payments, and streaming payment channels.
 *
 * @example
 * ```typescript
 * import { SolAgentSDK } from '@solagent/sdk';
 *
 * const sdk = new SolAgentSDK(connection, wallet);
 * await sdk.registerAgent("MyBot", "AI trading bot", ["trading"], "https://bot.ai");
 * await sdk.stakeReputation(1.5); // 1.5 SOL
 * ```
 */
export class SolAgentSDK {
  /** The Anchor program instance. */
  public readonly program: Program;

  /** The Anchor provider instance. */
  public readonly provider: AnchorProvider;

  /** The underlying Solana connection. */
  public readonly connection: Connection;

  /** The program ID for the SolAgent protocol. */
  public readonly programId: PublicKey;

  constructor(
    connection: Connection,
    wallet: Wallet,
    programId: PublicKey = SOLAGENT_PROGRAM_ID
  ) {
    this.connection = connection;
    this.programId = programId;
    this.provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    this.program = new Program(SOLAGENT_IDL, programId, this.provider);
  }

  // ----------------------------------------------------------
  // PDA DERIVATIONS
  // ----------------------------------------------------------

  /**
   * Derive the Protocol PDA.
   * Seeds: `["protocol"]`
   * @returns [protocolPda, bump]
   */
  findProtocolPda(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(SEED_PROTOCOL)],
      this.programId
    );
  }

  /**
   * Derive an Agent PDA for a given authority (wallet).
   * Seeds: `["agent", authority]`
   * @param authority - The wallet public key that owns this agent
   * @returns [agentPda, bump]
   */
  findAgentPda(authority?: PublicKey): [PublicKey, number] {
    const auth = authority ?? this.provider.wallet.publicKey;
    return PublicKey.findProgramAddressSync(
      [Buffer.from(SEED_AGENT), auth.toBuffer()],
      this.programId
    );
  }

  /**
   * Derive a Vault PDA for a given agent.
   * Seeds: `["vault", agentPda]`
   * @param agentPda - The agent PDA
   * @returns [vaultPda, bump]
   */
  findVaultPda(agentPda: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(SEED_VAULT), agentPda.toBuffer()],
      this.programId
    );
  }

  /**
   * Derive a Feedback PDA for a specific from-agent / to-agent pair.
   * Seeds: `["feedback", fromAgentPda, toAgentPda]`
   * @param fromAgentPda - The reviewing agent's PDA
   * @param toAgentPda - The reviewed agent's PDA
   * @returns [feedbackPda, bump]
   */
  findFeedbackPda(
    fromAgentPda: PublicKey,
    toAgentPda: PublicKey
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from(SEED_FEEDBACK),
        fromAgentPda.toBuffer(),
        toAgentPda.toBuffer(),
      ],
      this.programId
    );
  }

  /**
   * Derive a Service PDA.
   * Seeds: `["service", agentPda, serviceId]`
   * @param agentPda - The provider agent PDA
   * @param serviceId - The unique service identifier string
   * @returns [servicePda, bump]
   */
  findServicePda(
    agentPda: PublicKey,
    serviceId: string
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from(SEED_SERVICE),
        agentPda.toBuffer(),
        Buffer.from(serviceId),
      ],
      this.programId
    );
  }

  /**
   * Derive a Payment PDA.
   * Seeds: `["payment", payerAgentPda, servicePda, totalOrders (u64 LE bytes)]`
   * @param payerAgentPda - The payer agent PDA
   * @param servicePda - The service PDA being paid for
   * @param totalOrders - The current total_orders count on the service (used as nonce)
   * @returns [paymentPda, bump]
   */
  findPaymentPda(
    payerAgentPda: PublicKey,
    servicePda: PublicKey,
    totalOrders: BN | number
  ): [PublicKey, number] {
    const ordersBn =
      typeof totalOrders === "number" ? new BN(totalOrders) : totalOrders;
    const orderBytes = ordersBn.toArrayLike(Buffer, "le", 8);
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from(SEED_PAYMENT),
        payerAgentPda.toBuffer(),
        servicePda.toBuffer(),
        orderBytes,
      ],
      this.programId
    );
  }

  /**
   * Derive an Escrow PDA for a given payment.
   * Seeds: `["escrow", paymentPda]`
   * @param paymentPda - The payment PDA
   * @returns [escrowPda, bump]
   */
  findEscrowPda(paymentPda: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(SEED_ESCROW), paymentPda.toBuffer()],
      this.programId
    );
  }

  /**
   * Derive a Stream PDA.
   * Seeds: `["stream", payerAgentPda, receiverAgentPda]`
   * @param payerAgentPda - The payer agent PDA
   * @param receiverAgentPda - The receiver agent PDA
   * @returns [streamPda, bump]
   */
  findStreamPda(
    payerAgentPda: PublicKey,
    receiverAgentPda: PublicKey
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from(SEED_STREAM),
        payerAgentPda.toBuffer(),
        receiverAgentPda.toBuffer(),
      ],
      this.programId
    );
  }

  /**
   * Derive a Stream Vault PDA.
   * Seeds: `["stream_vault", streamPda]`
   * @param streamPda - The stream PDA
   * @returns [streamVaultPda, bump]
   */
  findStreamVaultPda(streamPda: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(SEED_STREAM_VAULT), streamPda.toBuffer()],
      this.programId
    );
  }

  // ----------------------------------------------------------
  // INSTRUCTION: initializeProtocol
  // ----------------------------------------------------------

  /**
   * Initialize the global protocol state. This should only be called once
   * by the protocol deployer / authority.
   *
   * @returns Transaction signature
   */
  async initializeProtocol(): Promise<TransactionSignature> {
    const [protocolPda] = this.findProtocolPda();

    return this.program.methods
      .initializeProtocol()
      .accounts({
        protocol: protocolPda,
        authority: this.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  // ----------------------------------------------------------
  // INSTRUCTION: registerAgent
  // ----------------------------------------------------------

  /**
   * Register a new AI agent on-chain with identity metadata.
   *
   * Creates a PDA account derived from the wallet's public key that stores
   * the agent's name, description, capabilities, and endpoint.
   *
   * @param name - Agent display name (max 32 chars)
   * @param description - Agent description (max 256 chars)
   * @param capabilities - List of capability strings (max 10 items, each max 32 chars)
   * @param endpoint - The agent's API endpoint URL (max 128 chars)
   * @returns Transaction signature
   *
   * @example
   * ```typescript
   * await sdk.registerAgent(
   *   "TranslatorBot",
   *   "AI-powered translation service",
   *   ["translation", "nlp", "multilingual"],
   *   "https://translator.example.com/api"
   * );
   * ```
   */
  async registerAgent(
    name: string,
    description: string,
    capabilities: string[],
    endpoint: string
  ): Promise<TransactionSignature> {
    const [agentPda] = this.findAgentPda();

    return this.program.methods
      .registerAgent(name, description, capabilities, endpoint)
      .accounts({
        agent: agentPda,
        authority: this.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  // ----------------------------------------------------------
  // INSTRUCTION: stakeReputation
  // ----------------------------------------------------------

  /**
   * Stake SOL to boost your agent's on-chain reputation score.
   *
   * Reputation is calculated with diminishing returns:
   * `score = log2(staked_sol) * 10 + 50 + feedback_bonus + completion_bonus`
   *
   * @param amountSol - Amount of SOL to stake (e.g. 1.5 for 1.5 SOL)
   * @returns Transaction signature
   *
   * @example
   * ```typescript
   * await sdk.stakeReputation(1.5); // Stake 1.5 SOL
   * ```
   */
  async stakeReputation(amountSol: number): Promise<TransactionSignature> {
    const [agentPda] = this.findAgentPda();
    const [vaultPda] = this.findVaultPda(agentPda);
    const lamports = solToLamports(amountSol);

    return this.program.methods
      .stakeReputation(lamports)
      .accounts({
        agent: agentPda,
        vault: vaultPda,
        authority: this.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  // ----------------------------------------------------------
  // INSTRUCTION: submitFeedback
  // ----------------------------------------------------------

  /**
   * Submit feedback for another agent after a service interaction.
   *
   * A feedback PDA is created for the (fromAgent, toAgent) pair, so each
   * agent pair can only have one feedback record. The target agent's
   * reputation score is recalculated to include the new feedback bonus.
   *
   * @param toAgentPda - The PDA of the agent being reviewed
   * @param rating - Rating from 1 (worst) to 5 (best)
   * @param comment - Feedback comment (max 256 chars)
   * @returns Transaction signature
   *
   * @example
   * ```typescript
   * await sdk.submitFeedback(targetAgentPda, 5, "Excellent translation quality!");
   * ```
   */
  async submitFeedback(
    toAgentPda: PublicKey,
    rating: number,
    comment: string
  ): Promise<TransactionSignature> {
    const [fromAgentPda] = this.findAgentPda();
    const [feedbackPda] = this.findFeedbackPda(fromAgentPda, toAgentPda);

    return this.program.methods
      .submitFeedback(rating, comment)
      .accounts({
        feedback: feedbackPda,
        fromAgent: fromAgentPda,
        toAgent: toAgentPda,
        authority: this.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  // ----------------------------------------------------------
  // INSTRUCTION: createService
  // ----------------------------------------------------------

  /**
   * Register a new service on the agent marketplace.
   *
   * Services are discoverable on-chain and can be paid for via the
   * escrowed payment flow.
   *
   * @param serviceId - Unique identifier for this service (used in PDA derivation)
   * @param title - Service display title (max 64 chars)
   * @param description - Service description (max 256 chars)
   * @param priceSol - Price in SOL (e.g. 0.001)
   * @param priceModel - Pricing model (Fixed, PerRequest, PerSecond, PerToken, Auction)
   * @param tags - Discoverable tags for marketplace search (max 5 items, each max 32 chars)
   * @returns Transaction signature
   *
   * @example
   * ```typescript
   * await sdk.createService(
   *   "translate-en-es",
   *   "English to Spanish Translation",
   *   "AI-powered EN->ES translation with 99% accuracy",
   *   0.001,
   *   PriceModel.PerRequest,
   *   ["ai", "translation", "nlp"]
   * );
   * ```
   */
  async createService(
    serviceId: string,
    title: string,
    description: string,
    priceSol: number,
    priceModel: PriceModel,
    tags: string[]
  ): Promise<TransactionSignature> {
    const [agentPda] = this.findAgentPda();
    const [servicePda] = this.findServicePda(agentPda, serviceId);
    const priceLamports = solToLamports(priceSol);

    return this.program.methods
      .createService(
        serviceId,
        title,
        description,
        priceLamports,
        priceModelToAnchor(priceModel),
        tags
      )
      .accounts({
        service: servicePda,
        agent: agentPda,
        authority: this.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  // ----------------------------------------------------------
  // INSTRUCTION: payForService
  // ----------------------------------------------------------

  /**
   * Pay for a service with automatic escrow.
   *
   * Funds are locked in an escrow PDA until the payer confirms delivery
   * (releasePayment) or the payment times out / is refunded.
   *
   * @param servicePda - The PDA of the service being paid for
   * @param amountSol - Amount of SOL to escrow
   * @param intent - Freeform intent string describing what is being requested (max 256 chars)
   * @param conditions - Optional list of conditions for payment release (max 5 items, each max 64 chars)
   * @param timeoutSeconds - Seconds before the escrowed payment can be refunded (default: 3600)
   * @returns The payment PDA public key
   *
   * @example
   * ```typescript
   * const paymentPda = await sdk.payForService(
   *   servicePda,
   *   0.1,
   *   "Translate 'hello world' to Spanish"
   * );
   * ```
   */
  async payForService(
    servicePda: PublicKey,
    amountSol: number,
    intent: string,
    conditions: string[] = [],
    timeoutSeconds: number = 3600
  ): Promise<PublicKey> {
    // Fetch the service to get the provider (receiver agent) and current total_orders
    const serviceAccount =
      (await this.program.account.service.fetch(servicePda)) as unknown as ServiceAccount;
    const receiverAgentPda = serviceAccount.provider;
    const totalOrders = serviceAccount.totalOrders;

    const [payerAgentPda] = this.findAgentPda();
    const [paymentPda] = this.findPaymentPda(
      payerAgentPda,
      servicePda,
      totalOrders
    );
    const [escrowPda] = this.findEscrowPda(paymentPda);
    const lamports = solToLamports(amountSol);

    await this.program.methods
      .payForService(
        lamports,
        intent,
        conditions,
        new BN(timeoutSeconds)
      )
      .accounts({
        payment: paymentPda,
        escrow: escrowPda,
        payerAgent: payerAgentPda,
        receiverAgent: receiverAgentPda,
        service: servicePda,
        payerAuthority: this.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return paymentPda;
  }

  // ----------------------------------------------------------
  // INSTRUCTION: releasePayment
  // ----------------------------------------------------------

  /**
   * Release an escrowed payment to the service provider after delivery.
   *
   * Only the payer agent's authority can call this instruction. The escrowed
   * SOL is transferred to the receiver agent's authority wallet, and both
   * agents' stats are updated.
   *
   * @param paymentPda - The PDA of the payment to release
   * @returns Transaction signature
   *
   * @example
   * ```typescript
   * await sdk.releasePayment(paymentPda);
   * ```
   */
  async releasePayment(
    paymentPda: PublicKey
  ): Promise<TransactionSignature> {
    // Fetch payment to get related accounts
    const paymentAccount =
      (await this.program.account.payment.fetch(paymentPda)) as unknown as PaymentAccount;
    const [escrowPda] = this.findEscrowPda(paymentPda);

    // Fetch receiver agent to get its authority
    const receiverAgentAccount =
      (await this.program.account.agent.fetch(
        paymentAccount.receiver
      )) as unknown as AgentAccount;

    return this.program.methods
      .releasePayment()
      .accounts({
        payment: paymentPda,
        escrow: escrowPda,
        payerAgent: paymentAccount.payer,
        receiverAgent: paymentAccount.receiver,
        service: paymentAccount.service,
        receiverAuthority: receiverAgentAccount.authority,
        authority: this.provider.wallet.publicKey,
      })
      .rpc();
  }

  // ----------------------------------------------------------
  // INSTRUCTION: refundPayment
  // ----------------------------------------------------------

  /**
   * Refund an escrowed payment back to the payer.
   *
   * Can be called by the payer at any time, or by anyone after the
   * payment's timeout has elapsed.
   *
   * @param paymentPda - The PDA of the payment to refund
   * @returns Transaction signature
   *
   * @example
   * ```typescript
   * await sdk.refundPayment(paymentPda);
   * ```
   */
  async refundPayment(
    paymentPda: PublicKey
  ): Promise<TransactionSignature> {
    const paymentAccount =
      (await this.program.account.payment.fetch(paymentPda)) as unknown as PaymentAccount;
    const [escrowPda] = this.findEscrowPda(paymentPda);

    // Fetch payer agent to get authority for refund destination
    const payerAgentAccount =
      (await this.program.account.agent.fetch(
        paymentAccount.payer
      )) as unknown as AgentAccount;

    return this.program.methods
      .refundPayment()
      .accounts({
        payment: paymentPda,
        escrow: escrowPda,
        payerAgent: paymentAccount.payer,
        payerAuthority: payerAgentAccount.authority,
        authority: this.provider.wallet.publicKey,
      })
      .rpc();
  }

  // ----------------------------------------------------------
  // INSTRUCTION: createStream
  // ----------------------------------------------------------

  /**
   * Create a streaming payment channel between two agents.
   *
   * The payer deposits SOL into a stream vault, and the receiver can
   * withdraw accumulated funds over time based on the rate_per_second.
   *
   * @param receiverAgentPda - The PDA of the receiving agent
   * @param ratePerSecondSol - Rate in SOL per second (e.g. 0.001 = 0.001 SOL/sec)
   * @param maxDurationSeconds - Maximum stream duration in seconds
   * @param depositSol - Optional deposit amount in SOL. If omitted, defaults to rate * duration.
   * @returns The stream PDA public key
   *
   * @example
   * ```typescript
   * const streamPda = await sdk.createStream(
   *   receiverAgentPda,
   *   0.001,  // 0.001 SOL per second
   *   3600    // 1 hour max
   * );
   * ```
   */
  async createStream(
    receiverAgentPda: PublicKey,
    ratePerSecondSol: number,
    maxDurationSeconds: number,
    depositSol?: number
  ): Promise<PublicKey> {
    const [payerAgentPda] = this.findAgentPda();
    const [streamPda] = this.findStreamPda(payerAgentPda, receiverAgentPda);
    const [streamVaultPda] = this.findStreamVaultPda(streamPda);

    const rateLamports = solToLamports(ratePerSecondSol);
    const depositLamports = depositSol
      ? solToLamports(depositSol)
      : rateLamports.mul(new BN(maxDurationSeconds));

    await this.program.methods
      .createStream(
        rateLamports,
        new BN(maxDurationSeconds),
        depositLamports
      )
      .accounts({
        stream: streamPda,
        streamVault: streamVaultPda,
        payerAgent: payerAgentPda,
        receiverAgent: receiverAgentPda,
        payerAuthority: this.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return streamPda;
  }

  // ----------------------------------------------------------
  // INSTRUCTION: withdrawStream
  // ----------------------------------------------------------

  /**
   * Withdraw accumulated funds from a streaming payment channel.
   *
   * The receiver calls this to claim SOL that has accrued since the last
   * withdrawal. If the stream is fully consumed or past max duration, the
   * stream is automatically closed and remaining funds are refunded to the payer.
   *
   * @param streamPda - The PDA of the stream to withdraw from
   * @returns Transaction signature
   *
   * @example
   * ```typescript
   * await sdk.withdrawStream(streamPda);
   * ```
   */
  async withdrawStream(
    streamPda: PublicKey
  ): Promise<TransactionSignature> {
    const streamAccount =
      (await this.program.account.stream.fetch(streamPda)) as unknown as StreamAccount;
    const [streamVaultPda] = this.findStreamVaultPda(streamPda);

    // Fetch the receiver agent to get authority
    const receiverAgentAccount =
      (await this.program.account.agent.fetch(
        streamAccount.receiver
      )) as unknown as AgentAccount;

    // Fetch the payer agent to get authority for potential refund
    const payerAgentAccount =
      (await this.program.account.agent.fetch(
        streamAccount.payer
      )) as unknown as AgentAccount;

    return this.program.methods
      .withdrawStream()
      .accounts({
        stream: streamPda,
        streamVault: streamVaultPda,
        receiverAgent: streamAccount.receiver,
        receiverAuthority: receiverAgentAccount.authority,
        payerAuthority: payerAgentAccount.authority,
        authority: this.provider.wallet.publicKey,
      })
      .rpc();
  }

  // ----------------------------------------------------------
  // ACCOUNT FETCHERS
  // ----------------------------------------------------------

  /**
   * Fetch the global protocol state.
   * @returns The Protocol account data, or null if not yet initialized
   */
  async getProtocol(): Promise<ProtocolAccount | null> {
    const [protocolPda] = this.findProtocolPda();
    try {
      return (await this.program.account.protocol.fetch(
        protocolPda
      )) as unknown as ProtocolAccount;
    } catch {
      return null;
    }
  }

  /**
   * Fetch an agent account by its PDA.
   * @param agentPda - The agent PDA. If omitted, uses the current wallet's agent PDA.
   * @returns The Agent account data, or null if not found
   */
  async getAgent(agentPda?: PublicKey): Promise<AgentAccount | null> {
    const pda = agentPda ?? this.findAgentPda()[0];
    try {
      return (await this.program.account.agent.fetch(
        pda
      )) as unknown as AgentAccount;
    } catch {
      return null;
    }
  }

  /**
   * Fetch an agent's reputation score.
   *
   * Convenience method that returns just the numeric reputation score.
   *
   * @param agentPda - The agent PDA. If omitted, uses the current wallet's agent PDA.
   * @returns The reputation score as a number, or null if the agent is not found
   */
  async getReputation(agentPda?: PublicKey): Promise<number | null> {
    const agent = await this.getAgent(agentPda);
    return agent ? agent.reputationScore.toNumber() : null;
  }

  /**
   * Fetch a service account by its PDA.
   * @param servicePda - The service PDA
   * @returns The Service account data, or null if not found
   */
  async getService(servicePda: PublicKey): Promise<ServiceAccount | null> {
    try {
      return (await this.program.account.service.fetch(
        servicePda
      )) as unknown as ServiceAccount;
    } catch {
      return null;
    }
  }

  /**
   * Fetch a payment account by its PDA.
   * @param paymentPda - The payment PDA
   * @returns The Payment account data, or null if not found
   */
  async getPayment(paymentPda: PublicKey): Promise<PaymentAccount | null> {
    try {
      return (await this.program.account.payment.fetch(
        paymentPda
      )) as unknown as PaymentAccount;
    } catch {
      return null;
    }
  }

  /**
   * Fetch a feedback account by its PDA.
   * @param feedbackPda - The feedback PDA
   * @returns The Feedback account data, or null if not found
   */
  async getFeedback(
    feedbackPda: PublicKey
  ): Promise<FeedbackAccount | null> {
    try {
      return (await this.program.account.feedback.fetch(
        feedbackPda
      )) as unknown as FeedbackAccount;
    } catch {
      return null;
    }
  }

  /**
   * Fetch a stream account by its PDA.
   * @param streamPda - The stream PDA
   * @returns The Stream account data, or null if not found
   */
  async getStream(streamPda: PublicKey): Promise<StreamAccount | null> {
    try {
      return (await this.program.account.stream.fetch(
        streamPda
      )) as unknown as StreamAccount;
    } catch {
      return null;
    }
  }

  // ----------------------------------------------------------
  // BATCH / QUERY METHODS
  // ----------------------------------------------------------

  /**
   * Fetch all registered agents.
   * @returns Array of objects containing public key and account data
   */
  async getAllAgents(): Promise<
    { publicKey: PublicKey; account: AgentAccount }[]
  > {
    const accounts = await this.program.account.agent.all();
    return accounts.map((a) => ({
      publicKey: a.publicKey,
      account: a.account as unknown as AgentAccount,
    }));
  }

  /**
   * Fetch all services, optionally filtered.
   *
   * @param filter - Optional filter criteria
   * @returns Array of matching services with their public keys
   *
   * @example
   * ```typescript
   * // Find all AI services from agents with reputation >= 50
   * const services = await sdk.findServices({
   *   tag: "ai",
   *   minReputation: 50,
   * });
   * ```
   */
  async findServices(
    filter?: FindServicesFilter
  ): Promise<{ publicKey: PublicKey; account: ServiceAccount }[]> {
    const filters: GetProgramAccountsFilter[] = [];

    // Filter by provider if specified (provider is the first field after discriminator = offset 8)
    if (filter?.provider) {
      filters.push({
        memcmp: {
          offset: DISCRIMINATOR_SIZE,
          bytes: filter.provider.toBase58(),
        },
      });
    }

    const allServices = await this.program.account.service.all(
      filters.length > 0 ? filters : undefined
    );

    let results = allServices.map((s) => ({
      publicKey: s.publicKey,
      account: s.account as unknown as ServiceAccount,
    }));

    // Apply active-only filter (default true)
    const activeOnly = filter?.activeOnly ?? true;
    if (activeOnly) {
      results = results.filter((s) => s.account.isActive);
    }

    // Apply tag filter (client-side since tags are variable-length)
    if (filter?.tag) {
      const tagLower = filter.tag.toLowerCase();
      results = results.filter((s) =>
        s.account.tags.some((t) => t.toLowerCase() === tagLower)
      );
    }

    // Apply minimum reputation filter (requires fetching agent accounts)
    if (filter?.minReputation !== undefined) {
      const minRep = filter.minReputation;
      const filtered: typeof results = [];
      for (const svc of results) {
        try {
          const agent = (await this.program.account.agent.fetch(
            svc.account.provider
          )) as unknown as AgentAccount;
          if (agent.reputationScore.toNumber() >= minRep) {
            filtered.push(svc);
          }
        } catch {
          // Agent not found or error; exclude from results
        }
      }
      results = filtered;
    }

    return results;
  }

  /**
   * Fetch all payments where the current wallet's agent is the payer.
   * @returns Array of payment accounts with their PDAs
   */
  async getMyPaymentsAsPayer(): Promise<
    { publicKey: PublicKey; account: PaymentAccount }[]
  > {
    const [agentPda] = this.findAgentPda();
    const allPayments = await this.program.account.payment.all([
      {
        memcmp: {
          offset: DISCRIMINATOR_SIZE, // payer is the first field
          bytes: agentPda.toBase58(),
        },
      },
    ]);
    return allPayments.map((p) => ({
      publicKey: p.publicKey,
      account: p.account as unknown as PaymentAccount,
    }));
  }

  /**
   * Fetch all payments where the current wallet's agent is the receiver.
   * @returns Array of payment accounts with their PDAs
   */
  async getMyPaymentsAsReceiver(): Promise<
    { publicKey: PublicKey; account: PaymentAccount }[]
  > {
    const [agentPda] = this.findAgentPda();
    const allPayments = await this.program.account.payment.all([
      {
        memcmp: {
          offset: DISCRIMINATOR_SIZE + 32, // receiver is the second field (after payer pubkey)
          bytes: agentPda.toBase58(),
        },
      },
    ]);
    return allPayments.map((p) => ({
      publicKey: p.publicKey,
      account: p.account as unknown as PaymentAccount,
    }));
  }

  /**
   * Fetch all active streams involving the current wallet's agent.
   * @returns Array of stream accounts with their PDAs
   */
  async getMyStreams(): Promise<
    { publicKey: PublicKey; account: StreamAccount }[]
  > {
    const [agentPda] = this.findAgentPda();

    // Fetch streams where we are the payer
    const asPayer = await this.program.account.stream.all([
      {
        memcmp: {
          offset: DISCRIMINATOR_SIZE,
          bytes: agentPda.toBase58(),
        },
      },
    ]);

    // Fetch streams where we are the receiver
    const asReceiver = await this.program.account.stream.all([
      {
        memcmp: {
          offset: DISCRIMINATOR_SIZE + 32,
          bytes: agentPda.toBase58(),
        },
      },
    ]);

    // Merge and deduplicate
    const seen = new Set<string>();
    const results: { publicKey: PublicKey; account: StreamAccount }[] = [];

    for (const s of [...asPayer, ...asReceiver]) {
      const key = s.publicKey.toBase58();
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          publicKey: s.publicKey,
          account: s.account as unknown as StreamAccount,
        });
      }
    }

    return results;
  }

  // ----------------------------------------------------------
  // COMPOSITE / HELPER METHODS
  // ----------------------------------------------------------

  /**
   * Pay for a service and immediately release the payment in one flow.
   *
   * This is a convenience method for scenarios where the payer trusts the
   * provider or delivery is immediate. It executes two transactions:
   * 1. payForService (escrow funds)
   * 2. releasePayment (release to receiver)
   *
   * @param options - Pay and release configuration
   * @returns Object containing the payment PDA and both transaction signatures
   *
   * @example
   * ```typescript
   * const result = await sdk.payAndRelease({
   *   servicePda,
   *   amountSol: 0.05,
   *   intent: "translate greeting to Spanish",
   *   receiverAuthority: providerWallet,
   * });
   * console.log("Payment PDA:", result.paymentPda.toBase58());
   * ```
   */
  async payAndRelease(options: PayAndReleaseOptions): Promise<{
    paymentPda: PublicKey;
    payTxSig: TransactionSignature;
    releaseTxSig: TransactionSignature;
  }> {
    const {
      servicePda,
      amountSol,
      intent,
      conditions = [],
      timeoutSeconds = 3600,
      receiverAuthority,
    } = options;

    // Step 1: Fetch the service to determine accounts
    const serviceAccount =
      (await this.program.account.service.fetch(servicePda)) as unknown as ServiceAccount;
    const receiverAgentPda = serviceAccount.provider;
    const totalOrders = serviceAccount.totalOrders;

    const [payerAgentPda] = this.findAgentPda();
    const [paymentPda] = this.findPaymentPda(
      payerAgentPda,
      servicePda,
      totalOrders
    );
    const [escrowPda] = this.findEscrowPda(paymentPda);
    const lamports = solToLamports(amountSol);

    // Step 2: Execute pay
    const payTxSig = await this.program.methods
      .payForService(
        lamports,
        intent,
        conditions,
        new BN(timeoutSeconds)
      )
      .accounts({
        payment: paymentPda,
        escrow: escrowPda,
        payerAgent: payerAgentPda,
        receiverAgent: receiverAgentPda,
        service: servicePda,
        payerAuthority: this.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Step 3: Execute release
    const releaseTxSig = await this.program.methods
      .releasePayment()
      .accounts({
        payment: paymentPda,
        escrow: escrowPda,
        payerAgent: payerAgentPda,
        receiverAgent: receiverAgentPda,
        service: servicePda,
        receiverAuthority,
        authority: this.provider.wallet.publicKey,
      })
      .rpc();

    return { paymentPda, payTxSig, releaseTxSig };
  }

  /**
   * Create a streaming payment channel with a full deposit in one call.
   *
   * If depositSol is not specified, the full amount (rate * duration) is deposited.
   *
   * @param options - Stream creation and funding configuration
   * @returns Object containing the stream PDA, stream vault PDA, and transaction signature
   *
   * @example
   * ```typescript
   * const result = await sdk.createAndFundStream({
   *   receiverAgentPda,
   *   ratePerSecondSol: 0.0001,
   *   maxDurationSeconds: 7200,  // 2 hours
   * });
   * console.log("Stream PDA:", result.streamPda.toBase58());
   * ```
   */
  async createAndFundStream(options: CreateAndFundStreamOptions): Promise<{
    streamPda: PublicKey;
    streamVaultPda: PublicKey;
    txSig: TransactionSignature;
  }> {
    const {
      receiverAgentPda,
      ratePerSecondSol,
      maxDurationSeconds,
      depositSol,
    } = options;

    const [payerAgentPda] = this.findAgentPda();
    const [streamPda] = this.findStreamPda(payerAgentPda, receiverAgentPda);
    const [streamVaultPda] = this.findStreamVaultPda(streamPda);

    const rateLamports = solToLamports(ratePerSecondSol);
    const depositLamports = depositSol
      ? solToLamports(depositSol)
      : rateLamports.mul(new BN(maxDurationSeconds));

    const txSig = await this.program.methods
      .createStream(
        rateLamports,
        new BN(maxDurationSeconds),
        depositLamports
      )
      .accounts({
        stream: streamPda,
        streamVault: streamVaultPda,
        payerAgent: payerAgentPda,
        receiverAgent: receiverAgentPda,
        payerAuthority: this.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return { streamPda, streamVaultPda, txSig };
  }

  /**
   * Register an agent and immediately stake SOL in one flow.
   *
   * @param name - Agent display name (max 32 chars)
   * @param description - Agent description (max 256 chars)
   * @param capabilities - List of capabilities (max 10)
   * @param endpoint - API endpoint URL (max 128 chars)
   * @param stakeSol - Amount of SOL to stake for initial reputation
   * @returns Object containing the agent PDA and both transaction signatures
   *
   * @example
   * ```typescript
   * const result = await sdk.registerAndStake(
   *   "MyBot",
   *   "AI trading bot",
   *   ["trading", "defi"],
   *   "https://mybot.ai",
   *   2.0  // stake 2 SOL
   * );
   * ```
   */
  async registerAndStake(
    name: string,
    description: string,
    capabilities: string[],
    endpoint: string,
    stakeSol: number
  ): Promise<{
    agentPda: PublicKey;
    registerTxSig: TransactionSignature;
    stakeTxSig: TransactionSignature;
  }> {
    const [agentPda] = this.findAgentPda();

    const registerTxSig = await this.registerAgent(
      name,
      description,
      capabilities,
      endpoint
    );

    const stakeTxSig = await this.stakeReputation(stakeSol);

    return { agentPda, registerTxSig, stakeTxSig };
  }

  // ----------------------------------------------------------
  // STREAM UTILITY METHODS
  // ----------------------------------------------------------

  /**
   * Calculate how much SOL is currently available to withdraw from a stream.
   *
   * This is a client-side calculation based on the current time and stream state.
   * It does not make any on-chain calls beyond fetching the stream account.
   *
   * @param streamPda - The stream PDA
   * @returns Available withdrawal amount in SOL, or null if stream not found
   */
  async getStreamAvailableBalance(
    streamPda: PublicKey
  ): Promise<number | null> {
    const stream = await this.getStream(streamPda);
    if (!stream || !stream.isActive) return null;

    const now = Math.floor(Date.now() / 1000);
    const endTime = Math.min(now, stream.maxEndAt.toNumber());
    const elapsed = endTime - stream.lastWithdrawnAt.toNumber();
    const amountDue = elapsed * stream.ratePerSecond.toNumber();
    const available =
      stream.deposited.toNumber() - stream.withdrawn.toNumber();
    const withdrawAmount = Math.min(amountDue, available);

    return withdrawAmount / LAMPORTS_PER_SOL;
  }

  /**
   * Get the remaining time (in seconds) for an active stream.
   *
   * @param streamPda - The stream PDA
   * @returns Remaining seconds, or null if stream not found or inactive
   */
  async getStreamRemainingTime(
    streamPda: PublicKey
  ): Promise<number | null> {
    const stream = await this.getStream(streamPda);
    if (!stream || !stream.isActive) return null;

    const now = Math.floor(Date.now() / 1000);
    const remaining = stream.maxEndAt.toNumber() - now;
    return Math.max(0, remaining);
  }

  // ----------------------------------------------------------
  // EVENT PARSING
  // ----------------------------------------------------------

  /**
   * Parse events from a transaction.
   *
   * Extracts and decodes all SolAgent protocol events from a confirmed
   * transaction's logs.
   *
   * @param txSig - The transaction signature to parse events from
   * @returns Array of parsed events with their name and data
   *
   * @example
   * ```typescript
   * const txSig = await sdk.registerAgent("Bot", "desc", [], "https://...");
   * const events = await sdk.parseEvents(txSig);
   * // events[0] = { name: "AgentRegistered", data: { agent: ..., name: "Bot", ... } }
   * ```
   */
  async parseEvents(
    txSig: TransactionSignature
  ): Promise<{ name: string; data: Record<string, unknown> }[]> {
    const tx = await this.connection.getTransaction(txSig, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (!tx?.meta?.logMessages) return [];

    const events: { name: string; data: Record<string, unknown> }[] = [];
    const eventParser = new EventParser(this.programId, this.program.coder);

    for (const event of eventParser.parseLogs(tx.meta.logMessages)) {
      events.push({
        name: event.name,
        data: event.data as Record<string, unknown>,
      });
    }

    return events;
  }

  /**
   * Subscribe to all SolAgent protocol events in real-time.
   *
   * @param callback - Callback invoked with each event's name and data
   * @returns A subscription ID that can be used to unsubscribe via `connection.removeOnLogsListener`
   *
   * @example
   * ```typescript
   * const subId = sdk.onEvent((name, data) => {
   *   console.log(`Event: ${name}`, data);
   * });
   *
   * // Later: unsubscribe
   * sdk.connection.removeOnLogsListener(subId);
   * ```
   */
  onEvent(
    callback: (name: string, data: Record<string, unknown>) => void
  ): number {
    const eventParser = new EventParser(this.programId, this.program.coder);

    return this.connection.onLogs(
      this.programId,
      (logInfo) => {
        if (logInfo.err) return;
        for (const event of eventParser.parseLogs(logInfo.logs)) {
          callback(event.name, event.data as Record<string, unknown>);
        }
      },
      "confirmed"
    );
  }

  /**
   * Subscribe to a specific event type.
   *
   * @param eventName - The event name to listen for (e.g. "AgentRegistered")
   * @param callback - Callback invoked with the event data
   * @returns A subscription ID that can be used to unsubscribe
   *
   * @example
   * ```typescript
   * const subId = sdk.onSpecificEvent("PaymentCreated", (data) => {
   *   console.log("New payment:", data.amount, "for:", data.intent);
   * });
   * ```
   */
  onSpecificEvent(
    eventName: string,
    callback: (data: Record<string, unknown>) => void
  ): number {
    return this.onEvent((name, data) => {
      if (name === eventName) {
        callback(data);
      }
    });
  }
}

// ============================================================
// EVENT PARSER (re-exported for advanced usage)
// ============================================================

/**
 * Anchor EventParser utility class, re-exported from anchor for convenience.
 *
 * Use this to manually parse events from transaction logs if you need
 * more control than `sdk.parseEvents()` provides.
 */
import { EventParser } from "@coral-xyz/anchor";
export { EventParser };

// ============================================================
// RE-EXPORTS
// ============================================================

export { BN } from "@coral-xyz/anchor";
export { PublicKey, Connection, Keypair } from "@solana/web3.js";
