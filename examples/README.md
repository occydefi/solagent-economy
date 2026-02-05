# SolAgent Economy - Examples

## Quick Start

```bash
# Install dependencies
cd .. && npm install
cd examples

# Run the demo (requires devnet connection)
npx ts-node demo.ts
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    SolAgent Economy Protocol                  │
├──────────┬──────────┬───────────┬──────────┬────────────────┤
│ Identity │ Staking  │  Escrow   │ Streams  │  Marketplace   │
│  (PDA)   │  (Vault) │ (Payment) │ (µPay)   │  (Services)    │
├──────────┴──────────┴───────────┴──────────┴────────────────┤
│                    Solana Runtime (BPF)                       │
└─────────────────────────────────────────────────────────────┘
```

## Instructions

| Instruction | Description |
|-------------|-------------|
| `register_agent` | Create on-chain AI agent identity |
| `update_agent` | Update agent metadata |
| `stake_reputation` | Stake SOL for reputation score |
| `unstake_reputation` | Withdraw staked SOL |
| `create_payment` | Create escrow payment |
| `release_payment` | Release escrow to payee |
| `create_stream` | Start streaming micropayment |
| `withdraw_stream` | Withdraw accrued stream funds |
| `cancel_stream` | Cancel stream, return remainder |
| `list_service` | Register service on marketplace |

## Reputation Scoring

```
score = log2(staked_SOL) * 10 + 50 + feedback_bonus

1 SOL   → 50 points (base)
10 SOL  → 83 points
100 SOL → 116 points
```

Logarithmic scoring prevents whale domination while rewarding genuine commitment.
