use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("SAGNTeco1111111111111111111111111111111111");

/// SolAgent Economy Protocol
/// Native Solana infrastructure for AI agent identity, reputation,
/// payments, and marketplace. Makes x402 + ERC-8004 obsolete.
///
/// Features:
/// - Agent Identity & Reputation (Sol-8004): PDA per agent, staking, feedback
/// - Native Agentic Payments: Escrow, streaming, conditional
/// - Agent Marketplace: On-chain service registry & discovery
/// - Multi-agent atomic workflows
#[program]
pub mod solagent {
    use super::*;

    // ============================================================
    // AGENT IDENTITY & REPUTATION (Sol-8004 equivalent)
    // ============================================================

    /// Register a new AI agent on-chain with identity metadata
    pub fn register_agent(
        ctx: Context<RegisterAgent>,
        name: String,
        description: String,
        capabilities: Vec<String>,
        endpoint: String,
    ) -> Result<()> {
        require!(name.len() <= 32, SolAgentError::NameTooLong);
        require!(description.len() <= 256, SolAgentError::DescriptionTooLong);
        require!(capabilities.len() <= 10, SolAgentError::TooManyCapabilities);

        let agent = &mut ctx.accounts.agent;
        agent.authority = ctx.accounts.authority.key();
        agent.name = name;
        agent.description = description;
        agent.capabilities = capabilities;
        agent.endpoint = endpoint;
        agent.reputation_score = 0;
        agent.total_staked = 0;
        agent.total_earned = 0;
        agent.total_spent = 0;
        agent.services_completed = 0;
        agent.services_requested = 0;
        agent.feedbacks_received = 0;
        agent.registered_at = Clock::get()?.unix_timestamp;
        agent.is_active = true;
        agent.bump = ctx.bumps.agent;

        emit!(AgentRegistered {
            agent: agent.key(),
            authority: ctx.accounts.authority.key(),
            name: agent.name.clone(),
            timestamp: agent.registered_at,
        });

        Ok(())
    }

    /// Stake SOL to boost reputation score
    pub fn stake_reputation(ctx: Context<StakeReputation>, amount: u64) -> Result<()> {
        require!(amount > 0, SolAgentError::ZeroAmount);

        // Transfer SOL to vault
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.authority.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            amount,
        )?;

        let agent = &mut ctx.accounts.agent;
        agent.total_staked += amount;

        // Reputation = log2(staked_lamports / 1_000_000) * 10 + feedback_bonus
        // More stake = higher reputation, with diminishing returns
        let staked_sol = agent.total_staked as f64 / 1_000_000_000.0;
        let base_rep = if staked_sol > 0.0 {
            (staked_sol.log2() * 10.0 + 50.0) as u64
        } else {
            0
        };
        let feedback_bonus = agent.feedbacks_received.min(100) * 2;
        let completion_bonus = agent.services_completed.min(500);
        agent.reputation_score = base_rep + feedback_bonus + completion_bonus;

        emit!(ReputationStaked {
            agent: agent.key(),
            amount,
            new_score: agent.reputation_score,
            total_staked: agent.total_staked,
        });

        Ok(())
    }

    /// Submit feedback for an agent after service completion
    pub fn submit_feedback(
        ctx: Context<SubmitFeedback>,
        rating: u8,
        comment: String,
    ) -> Result<()> {
        require!(rating >= 1 && rating <= 5, SolAgentError::InvalidRating);
        require!(comment.len() <= 256, SolAgentError::CommentTooLong);

        let feedback = &mut ctx.accounts.feedback;
        feedback.from_agent = ctx.accounts.from_agent.key();
        feedback.to_agent = ctx.accounts.to_agent.key();
        feedback.rating = rating;
        feedback.comment = comment;
        feedback.timestamp = Clock::get()?.unix_timestamp;
        feedback.bump = ctx.bumps.feedback;

        let to_agent = &mut ctx.accounts.to_agent;
        to_agent.feedbacks_received += 1;

        // Recalculate reputation with feedback bonus
        let feedback_bonus = to_agent.feedbacks_received.min(100) * 2;
        let completion_bonus = to_agent.services_completed.min(500);
        let staked_sol = to_agent.total_staked as f64 / 1_000_000_000.0;
        let base_rep = if staked_sol > 0.0 {
            (staked_sol.log2() * 10.0 + 50.0) as u64
        } else {
            0
        };
        to_agent.reputation_score = base_rep + feedback_bonus + completion_bonus;

        emit!(FeedbackSubmitted {
            from: feedback.from_agent,
            to: feedback.to_agent,
            rating,
            new_reputation: to_agent.reputation_score,
        });

        Ok(())
    }

    // ============================================================
    // AGENT MARKETPLACE & SERVICE REGISTRY
    // ============================================================

    /// Register a service on the agent marketplace
    pub fn create_service(
        ctx: Context<CreateService>,
        service_id: String,
        title: String,
        description: String,
        price_lamports: u64,
        price_model: PriceModel,
        tags: Vec<String>,
    ) -> Result<()> {
        require!(title.len() <= 64, SolAgentError::TitleTooLong);
        require!(tags.len() <= 5, SolAgentError::TooManyTags);

        let service = &mut ctx.accounts.service;
        service.provider = ctx.accounts.agent.key();
        service.authority = ctx.accounts.authority.key();
        service.service_id = service_id;
        service.title = title;
        service.description = description;
        service.price_lamports = price_lamports;
        service.price_model = price_model;
        service.tags = tags;
        service.total_orders = 0;
        service.total_revenue = 0;
        service.avg_rating = 0;
        service.is_active = true;
        service.created_at = Clock::get()?.unix_timestamp;
        service.bump = ctx.bumps.service;

        emit!(ServiceCreated {
            service: service.key(),
            provider: service.provider,
            title: service.title.clone(),
            price: service.price_lamports,
            price_model: service.price_model.clone(),
        });

        Ok(())
    }

    // ============================================================
    // NATIVE AGENTIC PAYMENTS (better than x402)
    // ============================================================

    /// Pay for a service with automatic escrow
    /// Funds are locked until service is delivered and confirmed
    pub fn pay_for_service(
        ctx: Context<PayForService>,
        amount: u64,
        intent: String,
        conditions: Vec<String>,
        timeout_seconds: i64,
    ) -> Result<()> {
        require!(amount > 0, SolAgentError::ZeroAmount);
        require!(intent.len() <= 256, SolAgentError::IntentTooLong);

        // Transfer SOL to escrow PDA
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.payer_authority.to_account_info(),
                    to: ctx.accounts.escrow.to_account_info(),
                },
            ),
            amount,
        )?;

        let payment = &mut ctx.accounts.payment;
        payment.payer = ctx.accounts.payer_agent.key();
        payment.receiver = ctx.accounts.receiver_agent.key();
        payment.service = ctx.accounts.service.key();
        payment.amount = amount;
        payment.intent = intent;
        payment.conditions = conditions;
        payment.status = PaymentStatus::Escrowed;
        payment.created_at = Clock::get()?.unix_timestamp;
        payment.timeout_at = payment.created_at + timeout_seconds;
        payment.completed_at = 0;
        payment.bump = ctx.bumps.payment;
        payment.escrow_bump = ctx.bumps.escrow;

        // Update agent stats
        let payer = &mut ctx.accounts.payer_agent;
        payer.services_requested += 1;
        payer.total_spent += amount;

        let service = &mut ctx.accounts.service;
        service.total_orders += 1;

        emit!(PaymentCreated {
            payment: payment.key(),
            payer: payment.payer,
            receiver: payment.receiver,
            amount,
            intent: payment.intent.clone(),
        });

        Ok(())
    }

    /// Release escrowed payment after service delivery
    /// Called by the payer agent to confirm satisfaction
    pub fn release_payment(ctx: Context<ReleasePayment>) -> Result<()> {
        let payment = &mut ctx.accounts.payment;
        require!(
            payment.status == PaymentStatus::Escrowed,
            SolAgentError::PaymentNotEscrowed
        );

        // Transfer from escrow to receiver
        let amount = payment.amount;
        **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx
            .accounts
            .receiver_authority
            .to_account_info()
            .try_borrow_mut_lamports()? += amount;

        payment.status = PaymentStatus::Released;
        payment.completed_at = Clock::get()?.unix_timestamp;

        // Update receiver agent stats
        let receiver = &mut ctx.accounts.receiver_agent;
        receiver.services_completed += 1;
        receiver.total_earned += amount;

        // Update service revenue
        let service = &mut ctx.accounts.service;
        service.total_revenue += amount;

        emit!(PaymentReleased {
            payment: payment.key(),
            receiver: payment.receiver,
            amount,
            latency_ms: ((payment.completed_at - payment.created_at) * 1000) as u64,
        });

        Ok(())
    }

    /// Refund escrowed payment (timeout or dispute)
    pub fn refund_payment(ctx: Context<RefundPayment>) -> Result<()> {
        let payment = &mut ctx.accounts.payment;
        require!(
            payment.status == PaymentStatus::Escrowed,
            SolAgentError::PaymentNotEscrowed
        );

        let now = Clock::get()?.unix_timestamp;
        let is_timeout = now > payment.timeout_at;
        let is_payer = ctx.accounts.authority.key() == ctx.accounts.payer_agent.authority;

        require!(
            is_timeout || is_payer,
            SolAgentError::RefundNotAllowed
        );

        // Return from escrow to payer
        let amount = payment.amount;
        **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx
            .accounts
            .payer_authority
            .to_account_info()
            .try_borrow_mut_lamports()? += amount;

        payment.status = PaymentStatus::Refunded;
        payment.completed_at = now;

        emit!(PaymentRefunded {
            payment: payment.key(),
            payer: payment.payer,
            amount,
            reason: if is_timeout {
                "timeout".to_string()
            } else {
                "payer_cancelled".to_string()
            },
        });

        Ok(())
    }

    /// Create a streaming payment (pay-per-second)
    pub fn create_stream(
        ctx: Context<CreateStream>,
        rate_per_second: u64,
        max_duration_seconds: u64,
        deposit_amount: u64,
    ) -> Result<()> {
        require!(rate_per_second > 0, SolAgentError::ZeroAmount);
        require!(
            deposit_amount >= rate_per_second * 60,
            SolAgentError::InsufficientDeposit
        );

        // Transfer deposit to stream vault
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.payer_authority.to_account_info(),
                    to: ctx.accounts.stream_vault.to_account_info(),
                },
            ),
            deposit_amount,
        )?;

        let stream = &mut ctx.accounts.stream;
        stream.payer = ctx.accounts.payer_agent.key();
        stream.receiver = ctx.accounts.receiver_agent.key();
        stream.rate_per_second = rate_per_second;
        stream.deposited = deposit_amount;
        stream.withdrawn = 0;
        stream.started_at = Clock::get()?.unix_timestamp;
        stream.max_end_at = stream.started_at + max_duration_seconds as i64;
        stream.last_withdrawn_at = stream.started_at;
        stream.is_active = true;
        stream.bump = ctx.bumps.stream;
        stream.vault_bump = ctx.bumps.stream_vault;

        emit!(StreamCreated {
            stream: stream.key(),
            payer: stream.payer,
            receiver: stream.receiver,
            rate_per_second,
            deposit: deposit_amount,
        });

        Ok(())
    }

    /// Withdraw accumulated streaming payment
    pub fn withdraw_stream(ctx: Context<WithdrawStream>) -> Result<()> {
        let stream = &mut ctx.accounts.stream;
        require!(stream.is_active, SolAgentError::StreamNotActive);

        let now = Clock::get()?.unix_timestamp;
        let end_time = now.min(stream.max_end_at);
        let elapsed = (end_time - stream.last_withdrawn_at) as u64;
        let amount_due = elapsed * stream.rate_per_second;
        let available = stream.deposited - stream.withdrawn;
        let withdraw_amount = amount_due.min(available);

        require!(withdraw_amount > 0, SolAgentError::NothingToWithdraw);

        // Transfer from stream vault to receiver
        **ctx
            .accounts
            .stream_vault
            .to_account_info()
            .try_borrow_mut_lamports()? -= withdraw_amount;
        **ctx
            .accounts
            .receiver_authority
            .to_account_info()
            .try_borrow_mut_lamports()? += withdraw_amount;

        stream.withdrawn += withdraw_amount;
        stream.last_withdrawn_at = now;

        // Auto-close if fully withdrawn or past max duration
        if stream.withdrawn >= stream.deposited || now >= stream.max_end_at {
            stream.is_active = false;

            // Refund remaining to payer
            let remaining = stream.deposited - stream.withdrawn;
            if remaining > 0 {
                **ctx
                    .accounts
                    .stream_vault
                    .to_account_info()
                    .try_borrow_mut_lamports()? -= remaining;
                **ctx
                    .accounts
                    .payer_authority
                    .to_account_info()
                    .try_borrow_mut_lamports()? += remaining;
            }
        }

        // Update receiver stats
        let receiver = &mut ctx.accounts.receiver_agent;
        receiver.total_earned += withdraw_amount;

        emit!(StreamWithdrawn {
            stream: stream.key(),
            amount: withdraw_amount,
            total_withdrawn: stream.withdrawn,
            is_active: stream.is_active,
        });

        Ok(())
    }

    // ============================================================
    // PROTOCOL STATS
    // ============================================================

    /// Initialize global protocol state
    pub fn initialize_protocol(ctx: Context<InitializeProtocol>) -> Result<()> {
        let protocol = &mut ctx.accounts.protocol;
        protocol.authority = ctx.accounts.authority.key();
        protocol.total_agents = 0;
        protocol.total_services = 0;
        protocol.total_payments = 0;
        protocol.total_volume = 0;
        protocol.total_staked = 0;
        protocol.fee_bps = 10; // 0.1%
        protocol.treasury = ctx.accounts.authority.key();
        protocol.bump = ctx.bumps.protocol;

        emit!(ProtocolInitialized {
            authority: protocol.authority,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

// ============================================================
// ACCOUNTS
// ============================================================

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Protocol::INIT_SPACE,
        seeds = [b"protocol"],
        bump
    )]
    pub protocol: Account<'info, Protocol>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(name: String)]
pub struct RegisterAgent<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Agent::INIT_SPACE,
        seeds = [b"agent", authority.key().as_ref()],
        bump
    )]
    pub agent: Account<'info, Agent>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StakeReputation<'info> {
    #[account(
        mut,
        seeds = [b"agent", authority.key().as_ref()],
        bump = agent.bump,
        has_one = authority
    )]
    pub agent: Account<'info, Agent>,
    /// CHECK: vault PDA to hold staked SOL
    #[account(
        mut,
        seeds = [b"vault", agent.key().as_ref()],
        bump
    )]
    pub vault: AccountInfo<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitFeedback<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Feedback::INIT_SPACE,
        seeds = [b"feedback", from_agent.key().as_ref(), to_agent.key().as_ref()],
        bump
    )]
    pub feedback: Account<'info, Feedback>,
    pub from_agent: Account<'info, Agent>,
    #[account(mut)]
    pub to_agent: Account<'info, Agent>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(service_id: String)]
pub struct CreateService<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Service::INIT_SPACE,
        seeds = [b"service", agent.key().as_ref(), service_id.as_bytes()],
        bump
    )]
    pub service: Account<'info, Service>,
    #[account(
        seeds = [b"agent", authority.key().as_ref()],
        bump = agent.bump,
        has_one = authority
    )]
    pub agent: Account<'info, Agent>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PayForService<'info> {
    #[account(
        init,
        payer = payer_authority,
        space = 8 + Payment::INIT_SPACE,
        seeds = [b"payment", payer_agent.key().as_ref(), service.key().as_ref(), &service.total_orders.to_le_bytes()],
        bump
    )]
    pub payment: Account<'info, Payment>,
    /// CHECK: escrow PDA to hold payment
    #[account(
        mut,
        seeds = [b"escrow", payment.key().as_ref()],
        bump
    )]
    pub escrow: AccountInfo<'info>,
    #[account(mut)]
    pub payer_agent: Account<'info, Agent>,
    pub receiver_agent: Account<'info, Agent>,
    #[account(mut)]
    pub service: Account<'info, Service>,
    #[account(mut)]
    pub payer_authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReleasePayment<'info> {
    #[account(
        mut,
        has_one = payer @ SolAgentError::Unauthorized,
    )]
    pub payment: Account<'info, Payment>,
    /// CHECK: escrow PDA
    #[account(mut)]
    pub escrow: AccountInfo<'info>,
    #[account(has_one = authority @ SolAgentError::Unauthorized)]
    pub payer_agent: Account<'info, Agent>,
    #[account(mut)]
    pub receiver_agent: Account<'info, Agent>,
    #[account(mut)]
    pub service: Account<'info, Service>,
    /// CHECK: receiver wallet
    #[account(mut)]
    pub receiver_authority: AccountInfo<'info>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct RefundPayment<'info> {
    #[account(mut)]
    pub payment: Account<'info, Payment>,
    /// CHECK: escrow PDA
    #[account(mut)]
    pub escrow: AccountInfo<'info>,
    pub payer_agent: Account<'info, Agent>,
    /// CHECK: payer wallet for refund
    #[account(mut)]
    pub payer_authority: AccountInfo<'info>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct CreateStream<'info> {
    #[account(
        init,
        payer = payer_authority,
        space = 8 + Stream::INIT_SPACE,
        seeds = [b"stream", payer_agent.key().as_ref(), receiver_agent.key().as_ref()],
        bump
    )]
    pub stream: Account<'info, Stream>,
    /// CHECK: vault for stream deposits
    #[account(
        mut,
        seeds = [b"stream_vault", stream.key().as_ref()],
        bump
    )]
    pub stream_vault: AccountInfo<'info>,
    pub payer_agent: Account<'info, Agent>,
    pub receiver_agent: Account<'info, Agent>,
    #[account(mut)]
    pub payer_authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawStream<'info> {
    #[account(mut)]
    pub stream: Account<'info, Stream>,
    /// CHECK: stream vault PDA
    #[account(mut)]
    pub stream_vault: AccountInfo<'info>,
    #[account(mut)]
    pub receiver_agent: Account<'info, Agent>,
    /// CHECK: receiver wallet
    #[account(mut)]
    pub receiver_authority: AccountInfo<'info>,
    /// CHECK: payer wallet for refunds
    #[account(mut)]
    pub payer_authority: AccountInfo<'info>,
    pub authority: Signer<'info>,
}

// ============================================================
// STATE
// ============================================================

#[account]
#[derive(InitSpace)]
pub struct Protocol {
    pub authority: Pubkey,
    pub total_agents: u64,
    pub total_services: u64,
    pub total_payments: u64,
    pub total_volume: u64,
    pub total_staked: u64,
    pub fee_bps: u16,
    pub treasury: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Agent {
    pub authority: Pubkey,
    #[max_len(32)]
    pub name: String,
    #[max_len(256)]
    pub description: String,
    #[max_len(10, 32)]
    pub capabilities: Vec<String>,
    #[max_len(128)]
    pub endpoint: String,
    pub reputation_score: u64,
    pub total_staked: u64,
    pub total_earned: u64,
    pub total_spent: u64,
    pub services_completed: u64,
    pub services_requested: u64,
    pub feedbacks_received: u64,
    pub registered_at: i64,
    pub is_active: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Service {
    pub provider: Pubkey,
    pub authority: Pubkey,
    #[max_len(32)]
    pub service_id: String,
    #[max_len(64)]
    pub title: String,
    #[max_len(256)]
    pub description: String,
    pub price_lamports: u64,
    pub price_model: PriceModel,
    #[max_len(5, 32)]
    pub tags: Vec<String>,
    pub total_orders: u64,
    pub total_revenue: u64,
    pub avg_rating: u8,
    pub is_active: bool,
    pub created_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Payment {
    pub payer: Pubkey,
    pub receiver: Pubkey,
    pub service: Pubkey,
    pub amount: u64,
    #[max_len(256)]
    pub intent: String,
    #[max_len(5, 64)]
    pub conditions: Vec<String>,
    pub status: PaymentStatus,
    pub created_at: i64,
    pub timeout_at: i64,
    pub completed_at: i64,
    pub bump: u8,
    pub escrow_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Feedback {
    pub from_agent: Pubkey,
    pub to_agent: Pubkey,
    pub rating: u8,
    #[max_len(256)]
    pub comment: String,
    pub timestamp: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Stream {
    pub payer: Pubkey,
    pub receiver: Pubkey,
    pub rate_per_second: u64,
    pub deposited: u64,
    pub withdrawn: u64,
    pub started_at: i64,
    pub max_end_at: i64,
    pub last_withdrawn_at: i64,
    pub is_active: bool,
    pub bump: u8,
    pub vault_bump: u8,
}

// ============================================================
// ENUMS
// ============================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum PaymentStatus {
    Escrowed,
    Released,
    Refunded,
    Disputed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum PriceModel {
    Fixed,          // One-time payment
    PerRequest,     // Pay per API call
    PerSecond,      // Streaming payment
    PerToken,       // Pay per output token
    Auction,        // Highest bidder wins
}

// ============================================================
// EVENTS
// ============================================================

#[event]
pub struct ProtocolInitialized {
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AgentRegistered {
    pub agent: Pubkey,
    pub authority: Pubkey,
    pub name: String,
    pub timestamp: i64,
}

#[event]
pub struct ReputationStaked {
    pub agent: Pubkey,
    pub amount: u64,
    pub new_score: u64,
    pub total_staked: u64,
}

#[event]
pub struct FeedbackSubmitted {
    pub from: Pubkey,
    pub to: Pubkey,
    pub rating: u8,
    pub new_reputation: u64,
}

#[event]
pub struct ServiceCreated {
    pub service: Pubkey,
    pub provider: Pubkey,
    pub title: String,
    pub price: u64,
    pub price_model: PriceModel,
}

#[event]
pub struct PaymentCreated {
    pub payment: Pubkey,
    pub payer: Pubkey,
    pub receiver: Pubkey,
    pub amount: u64,
    pub intent: String,
}

#[event]
pub struct PaymentReleased {
    pub payment: Pubkey,
    pub receiver: Pubkey,
    pub amount: u64,
    pub latency_ms: u64,
}

#[event]
pub struct PaymentRefunded {
    pub payment: Pubkey,
    pub payer: Pubkey,
    pub amount: u64,
    pub reason: String,
}

#[event]
pub struct StreamCreated {
    pub stream: Pubkey,
    pub payer: Pubkey,
    pub receiver: Pubkey,
    pub rate_per_second: u64,
    pub deposit: u64,
}

#[event]
pub struct StreamWithdrawn {
    pub stream: Pubkey,
    pub amount: u64,
    pub total_withdrawn: u64,
    pub is_active: bool,
}

// ============================================================
// ERRORS
// ============================================================

#[error_code]
pub enum SolAgentError {
    #[msg("Name exceeds 32 characters")]
    NameTooLong,
    #[msg("Description exceeds 256 characters")]
    DescriptionTooLong,
    #[msg("Too many capabilities (max 10)")]
    TooManyCapabilities,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Rating must be between 1 and 5")]
    InvalidRating,
    #[msg("Comment exceeds 256 characters")]
    CommentTooLong,
    #[msg("Title exceeds 64 characters")]
    TitleTooLong,
    #[msg("Too many tags (max 5)")]
    TooManyTags,
    #[msg("Intent exceeds 256 characters")]
    IntentTooLong,
    #[msg("Payment is not in escrowed state")]
    PaymentNotEscrowed,
    #[msg("Refund not allowed")]
    RefundNotAllowed,
    #[msg("Insufficient deposit for stream")]
    InsufficientDeposit,
    #[msg("Stream is not active")]
    StreamNotActive,
    #[msg("Nothing to withdraw")]
    NothingToWithdraw,
    #[msg("Unauthorized")]
    Unauthorized,
}
