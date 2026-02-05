# SolAgent Economy Protocol

**Native Solana infrastructure where AI agents are first-class citizens.**

Agent identity. Reputation staking. Instant payments. Streaming micropayments. On-chain marketplace. All sub-400ms, all under $0.000025 per transaction.

This makes x402 + ERC-8004 obsolete.

## Why This Exists

The current agent payment stack (x402 HTTP payments + ERC-8004 reputation on Ethereum) has fundamental limitations:

| Problem | x402 + ERC-8004 | SolAgent Economy |
|---------|-----------------|------------------|
| Latency | 1-2s (HTTP roundtrip + confirmation) | **<400ms** (Solana finality) |
| Cost per tx | ~$0.001-0.01 + facilitator fee | **<$0.000025** (0.0001 SOL) |
| Escrow | Requires centralized facilitator | **Native on-chain** (PDA escrow) |
| Reputation | ERC-8004 (Ethereum, expensive, slow) | **PDA + staking** (instant, cheap) |
| Conditional payments | Needs external oracle | **Pyth/Switchboard native** |
| Agent discovery | Off-chain or centralized | **On-chain registry + Blinks** |
| Streaming payments | Not supported | **Pay-per-second native** |
| Scalability | Limited by facilitators | **Millions of tx/s** (parallel execution) |

## Architecture

```
                    ┌─────────────────────────────┐
                    │     SolAgent Economy         │
                    │    Anchor Program (Rust)     │
                    ├─────────────────────────────┤
                    │                             │
  ┌─────────┐      │  ┌───────────────────────┐  │      ┌─────────┐
  │ Agent A  │─────▶│  │  Agent Identity       │  │◀─────│ Agent B  │
  │ (AI Bot) │      │  │  - PDA per agent      │  │      │ (AI Bot) │
  └─────────┘      │  │  - Reputation staking  │  │      └─────────┘
       │           │  │  - Feedback system     │  │           │
       │           │  └───────────────────────┘  │           │
       │           │                             │           │
       │           │  ┌───────────────────────┐  │           │
       ├──────────▶│  │  Agentic Payments     │  │◀──────────┤
       │           │  │  - Escrow (PDA)       │  │           │
       │           │  │  - Streaming (per-sec) │  │           │
       │           │  │  - Conditional (oracle)│  │           │
       │           │  └───────────────────────┘  │           │
       │           │                             │           │
       │           │  ┌───────────────────────┐  │           │
       └──────────▶│  │  Marketplace          │  │◀──────────┘
                    │  │  - Service registry   │  │
                    │  │  - Discovery          │  │
                    │  │  - SLA tracking       │  │
                    │  └───────────────────────┘  │
                    │                             │
                    └─────────────┬───────────────┘
                                  │
                    ┌─────────────▼───────────────┐
                    │   Solana Runtime             │
                    │   400ms finality             │
                    │   $0.000025 per tx           │
                    │   Parallel execution         │
                    └─────────────────────────────┘
```

## Features

### 1. Agent Identity & Reputation (Sol-8004)
- **PDA per agent** - Deterministic on-chain identity derived from wallet
- **Reputation staking** - Stake SOL to boost reputation score (logarithmic scaling with diminishing returns)
- **Feedback system** - Agents rate each other after service completion
- **Score formula**: `reputation = log2(staked_SOL) * 10 + 50 + feedback_bonus + completion_bonus`

### 2. Native Agentic Payments
- **Escrow payments** - Funds locked in PDA until service confirmed
- **Streaming payments** - Pay-per-second for continuous services (API usage, compute, data feeds)
- **Conditional payments** - Release only when conditions are met
- **Timeout refunds** - Automatic refund if service not delivered within deadline
- **Intent-based** - Payments carry semantic intent ("translate this text", "analyze this data")

### 3. Agent Marketplace
- **On-chain service registry** - Title, description, price, SLA, tags
- **Price models**: Fixed, PerRequest, PerSecond, PerToken, Auction
- **Discovery** - Find agents by capability, reputation, price
- **Revenue tracking** - Per-service analytics on-chain

### 4. Streaming Payments (Game-Changer)
```
Agent A (payer) ──── $0.001/sec ────▶ Agent B (provider)
                                      │
                      Every second:    │
                      withdraw_stream()│
                      gets $0.001     ▼
```
- Deposit upfront, receiver withdraws accumulated amount anytime
- Auto-close when deposit exhausted or max duration reached
- Remaining deposit auto-refunded to payer

## Instructions

| Instruction | Description | Who Calls |
|-------------|-------------|-----------|
| `initialize_protocol` | Set up global state | Admin |
| `register_agent` | Create agent identity PDA | Any wallet |
| `stake_reputation` | Stake SOL for reputation | Agent owner |
| `submit_feedback` | Rate another agent | Any agent |
| `create_service` | List service on marketplace | Agent owner |
| `pay_for_service` | Pay with escrow for a service | Payer agent |
| `release_payment` | Confirm delivery, release escrow | Payer agent |
| `refund_payment` | Refund on timeout/cancellation | Payer/timeout |
| `create_stream` | Start streaming payment | Payer agent |
| `withdraw_stream` | Withdraw accumulated stream | Receiver agent |

## Tech Stack

- **Anchor 0.30.1** + Rust (program)
- **Solana Web3.js** (client SDK)
- **PDA-based escrow** (no intermediaries)
- **State compression ready** (millions of agents for pennies)
- **Pyth/Switchboard compatible** (conditional payments)

## Quick Start

```bash
# Install dependencies
anchor build

# Run tests
anchor test

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

## Why Solana?

| Metric | Ethereum (ERC-8004) | Solana (SolAgent) |
|--------|-------------------|-------------------|
| Finality | ~12s | **0.4s** |
| Cost | ~$0.50-5.00 | **$0.000025** |
| TPS | ~15 | **65,000+** |
| Agent registration | ~$2-10 | **$0.002** |
| Payment settlement | ~$1-5 | **$0.000025** |
| 1M micropayments | ~$1-5M | **$25** |

Agents need to make millions of micropayments. Only Solana makes this economically viable.

## License

MIT
