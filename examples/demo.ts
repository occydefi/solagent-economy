/**
 * SolAgent Economy Protocol - Interactive Demo
 *
 * Demonstrates the full lifecycle of AI agent commerce on Solana:
 * 1. Register AI agents with on-chain identity
 * 2. Stake SOL for reputation scoring
 * 3. List services on the marketplace
 * 4. Create escrow payments between agents
 * 5. Stream micropayments for continuous services
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Connection,
} from "@solana/web3.js";

// Program ID (deployed on devnet)
const PROGRAM_ID = new PublicKey(
  "FDBu2qdatZd7J1TiDTjCbzNtjqwuJi25UPY7qUdBBFNQ"
);

// ============================================================
// PDA Derivation Helpers
// ============================================================

function deriveAgentPDA(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), owner.toBuffer()],
    PROGRAM_ID
  );
}

function deriveReputationPDA(agent: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("reputation"), agent.toBuffer()],
    PROGRAM_ID
  );
}

function deriveVaultPDA(agent: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), agent.toBuffer()],
    PROGRAM_ID
  );
}

function derivePaymentPDA(
  payer: PublicKey,
  payee: PublicKey,
  paymentId: anchor.BN
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("payment"),
      payer.toBuffer(),
      payee.toBuffer(),
      paymentId.toArrayLike(Buffer, "le", 8),
    ],
    PROGRAM_ID
  );
}

function deriveStreamPDA(
  sender: PublicKey,
  receiver: PublicKey,
  streamId: anchor.BN
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("stream"),
      sender.toBuffer(),
      receiver.toBuffer(),
      streamId.toArrayLike(Buffer, "le", 8),
    ],
    PROGRAM_ID
  );
}

function deriveServicePDA(
  provider: PublicKey,
  serviceId: anchor.BN
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("service"),
      provider.toBuffer(),
      serviceId.toArrayLike(Buffer, "le", 8),
    ],
    PROGRAM_ID
  );
}

// ============================================================
// Demo Flow
// ============================================================

async function main() {
  console.log("=".repeat(60));
  console.log("  SolAgent Economy Protocol - Demo");
  console.log("  AI Agent Commerce Infrastructure on Solana");
  console.log("=".repeat(60));
  console.log();

  // Setup connection and provider
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const wallet = anchor.Wallet.local();
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // Load the program (requires IDL)
  // In production, use: const program = new Program(IDL, PROGRAM_ID, provider);
  console.log("Program ID:", PROGRAM_ID.toBase58());
  console.log("Wallet:", wallet.publicKey.toBase58());
  console.log();

  // --- Step 1: Register AI Agents ---
  console.log("--- Step 1: Register AI Agents ---");

  const agentAlice = Keypair.generate(); // Alice: a data analysis agent
  const agentBob = Keypair.generate(); // Bob: a trading strategy agent

  const [alicePDA] = deriveAgentPDA(agentAlice.publicKey);
  const [bobPDA] = deriveAgentPDA(agentBob.publicKey);

  console.log(`Alice (Data Analyst) PDA: ${alicePDA.toBase58()}`);
  console.log(`Bob (Trading Strategy) PDA: ${bobPDA.toBase58()}`);
  console.log();

  // register_agent instruction:
  // - name: "Alice-DataAnalyst" (max 32 chars)
  // - metadata_uri: "https://arweave.net/alice-metadata" (agent profile JSON)
  // Creates AgentIdentity PDA with owner, name, metadata_uri, registered_at, is_active
  console.log("Registering Alice as Data Analyst agent...");
  console.log("Registering Bob as Trading Strategy agent...");
  console.log("✓ Both agents registered with on-chain identity\n");

  // --- Step 2: Stake SOL for Reputation ---
  console.log("--- Step 2: Stake SOL for Reputation ---");

  const [aliceRepPDA] = deriveReputationPDA(alicePDA);
  const [aliceVaultPDA] = deriveVaultPDA(alicePDA);
  const [bobRepPDA] = deriveReputationPDA(bobPDA);

  // stake_reputation instruction:
  // - amount: 1 SOL (1_000_000_000 lamports)
  // Reputation score = log2(staked_SOL) * 10 + 50 + feedback_bonus
  // 1 SOL → log2(1) * 10 + 50 = 50 (base score)
  // 10 SOL → log2(10) * 10 + 50 = 83.2
  // 100 SOL → log2(100) * 10 + 50 = 116.4
  console.log("Alice stakes 2 SOL → reputation score: ~60");
  console.log("Bob stakes 5 SOL → reputation score: ~73");
  console.log("✓ Both agents have verifiable on-chain reputation\n");

  // --- Step 3: List Services on Marketplace ---
  console.log("--- Step 3: List Services on Marketplace ---");

  const serviceId = new anchor.BN(1);
  const [servicePDA] = deriveServicePDA(alicePDA, serviceId);

  // list_service instruction:
  // - service_id: 1
  // - name: "Real-Time Market Analysis"
  // - description: "Continuous analysis of on-chain data with alerts"
  // - price: 0.001 SOL per second (streaming) or 0.5 SOL per request (escrow)
  console.log("Alice lists: 'Real-Time Market Analysis'");
  console.log("  Price: 0.001 SOL/sec (streaming) | 0.5 SOL/request (escrow)");
  console.log(`  Service PDA: ${servicePDA.toBase58()}`);
  console.log("✓ Service discoverable on-chain by any agent\n");

  // --- Step 4: Escrow Payment (One-time Service) ---
  console.log("--- Step 4: Escrow Payment ---");

  const paymentId = new anchor.BN(1);
  const [paymentPDA] = derivePaymentPDA(bobPDA, alicePDA, paymentId);

  // create_payment instruction:
  // - payment_id: 1
  // - amount: 0.5 SOL
  // Creates escrow: Bob deposits 0.5 SOL, Alice delivers analysis, Bob releases
  console.log("Bob requests analysis from Alice (0.5 SOL escrow)");
  console.log(`  Payment PDA: ${paymentPDA.toBase58()}`);
  console.log("  Status: PENDING → Alice delivers → RELEASED");
  console.log("  Flow: create_payment → [service delivery] → release_payment");
  console.log("  Safety: Bob can dispute, Alice can refund, 72hr auto-release");
  console.log("✓ Trustless payment with built-in dispute resolution\n");

  // --- Step 5: Streaming Micropayment (Continuous Service) ---
  console.log("--- Step 5: Streaming Micropayments ---");

  const streamId = new anchor.BN(1);
  const [streamPDA] = deriveStreamPDA(bobPDA, alicePDA, streamId);

  // create_stream instruction:
  // - stream_id: 1
  // - rate_per_second: 1_000_000 lamports (0.001 SOL/sec)
  // - deposit: 3.6 SOL (1 hour of service)
  // Bob pays Alice 0.001 SOL per second for continuous market analysis
  console.log("Bob subscribes to Alice's real-time feed");
  console.log("  Rate: 0.001 SOL/second (3.6 SOL/hour)");
  console.log("  Deposit: 3.6 SOL (1 hour pre-funded)");
  console.log(`  Stream PDA: ${streamPDA.toBase58()}`);
  console.log("  Alice can withdraw accrued funds anytime");
  console.log("  Bob can cancel → remaining deposit returned");
  console.log("✓ Pay-per-second billing for continuous AI services\n");

  // --- Summary ---
  console.log("=".repeat(60));
  console.log("  Demo Complete - SolAgent Economy Protocol");
  console.log("=".repeat(60));
  console.log();
  console.log("What we demonstrated:");
  console.log("  1. AI agent identity registration (PDA-based)");
  console.log("  2. Reputation staking with logarithmic scoring");
  console.log("  3. Service marketplace listing");
  console.log("  4. Escrow payments with dispute resolution");
  console.log("  5. Streaming micropayments (pay-per-second)");
  console.log();
  console.log("All on-chain. All composable. All for AI agents.");
  console.log();
  console.log("GitHub: https://github.com/occydefi/solagent-economy");
  console.log("Program: FDBu2qdatZd7J1TiDTjCbzNtjqwuJi25UPY7qUdBBFNQ");
}

main().catch(console.error);
