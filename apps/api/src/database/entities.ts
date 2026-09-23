import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('rm_users')
export class RMUser {
  @PrimaryColumn('varchar') id: string;
  @Column() name: string;
  @Column({ unique: true }) email: string;
  @Column() branch: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
  @OneToMany(() => Customer, (customer) => customer.rm) customers: Customer[];
}

@Entity('customers')
@Index(['rmId', 'fullName'])
export class Customer {
  @PrimaryColumn('varchar') id: string;
  @Column({ name: 'customer_code', unique: true }) customerCode: string;
  @Column({ name: 'rm_id' }) rmId: string;
  @ManyToOne(() => RMUser, (rm) => rm.customers) @JoinColumn({ name: 'rm_id' }) rm: RMUser;
  @Column({ name: 'full_name' }) fullName: string;
  @Column({ name: 'date_of_birth', type: 'date' }) dateOfBirth: string;
  @Column() gender: string;
  @Column() segment: string;
  @Column({ name: 'customer_since', type: 'date' }) customerSince: string;
  @Column() phone: string;
  @Column() email: string;
  @Column({ type: 'varchar', nullable: true }) occupation: string | null;
  @Column({ name: 'relationship_status' }) relationshipStatus: string;
  // MSB evaluation framework attributes (sheet "Danh sách KH & Phân hạng").
  @Column({ type: 'varchar', nullable: true }) cif: string | null;
  @Column({ type: 'varchar', nullable: true }) branch: string | null;
  @Column({ default: 'Mass' }) tier: string;
  @Column({ name: 'declared_behaviour', type: 'varchar', nullable: true }) declaredBehaviour: string | null;
  @Column({ name: 'declared_risk_appetite', type: 'varchar', nullable: true }) declaredRiskAppetite: string | null;
  @Column({ name: 'churn_warning', default: false }) churnWarning: boolean;
  @Column({ name: 'behaviour_note', type: 'text', nullable: true }) behaviourNote: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}

@Entity('accounts')
@Index(['customerId'])
export class Account {
  @PrimaryColumn('varchar') id: string;
  @Column({ name: 'customer_id' }) customerId: string;
  @ManyToOne(() => Customer) @JoinColumn({ name: 'customer_id' }) customer: Customer;
  @Column({ name: 'account_number', unique: true }) accountNumber: string;
  @Column() type: string;
  @Column({ length: 3 }) currency: string;
  @Column('numeric', { precision: 20, scale: 2 }) balance: string;
  @Column('numeric', { name: 'available_balance', precision: 20, scale: 2 }) availableBalance: string;
  @Column() status: string;
  @Column({ name: 'opened_at', type: 'date' }) openedAt: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}

@Entity('transactions')
@Index(['customerId', 'transactionAt'])
export class BankTransaction {
  @PrimaryColumn('varchar') id: string;
  @Column({ name: 'account_id' }) accountId: string;
  @ManyToOne(() => Account) @JoinColumn({ name: 'account_id' }) account: Account;
  @Column({ name: 'customer_id' }) customerId: string;
  @ManyToOne(() => Customer) @JoinColumn({ name: 'customer_id' }) customer: Customer;
  @Column({ name: 'transaction_code', unique: true }) transactionCode: string;
  @Column() type: string;
  @Column() category: string;
  @Column('numeric', { precision: 20, scale: 2 }) amount: string;
  @Column({ length: 3 }) currency: string;
  @Column() description: string;
  @Column({ type: 'varchar', nullable: true }) merchant: string | null;
  @Column({ name: 'transaction_at', type: 'timestamptz' }) transactionAt: Date;
  @Column('numeric', { name: 'balance_after', precision: 20, scale: 2 }) balanceAfter: string;
}

@Entity('cards')
@Index(['customerId'])
export class Card {
  @PrimaryColumn('varchar') id: string;
  @Column({ name: 'customer_id' }) customerId: string;
  @ManyToOne(() => Customer) @JoinColumn({ name: 'customer_id' }) customer: Customer;
  @Column({ name: 'masked_number' }) maskedNumber: string;
  @Column() type: string;
  @Column('numeric', { name: 'credit_limit', precision: 20, scale: 2 }) creditLimit: string;
  @Column('numeric', { name: 'available_limit', precision: 20, scale: 2 }) availableLimit: string;
  @Column() status: string;
  @Column({ name: 'expiry_date', type: 'date' }) expiryDate: string;
  @Column({ name: 'last_transaction_at', type: 'timestamptz', nullable: true }) lastTransactionAt: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}

@Entity('deposits')
@Index(['customerId'])
export class Deposit {
  @PrimaryColumn('varchar') id: string;
  @Column({ name: 'customer_id' }) customerId: string;
  @ManyToOne(() => Customer) @JoinColumn({ name: 'customer_id' }) customer: Customer;
  @Column({ name: 'product_name' }) productName: string;
  @Column('numeric', { precision: 20, scale: 2 }) principal: string;
  @Column('numeric', { name: 'interest_rate', precision: 7, scale: 4, nullable: true }) interestRate: string | null;
  @Column({ name: 'start_date', type: 'date' }) startDate: string;
  @Column({ name: 'maturity_date', type: 'date', nullable: true }) maturityDate: string | null;
  @Column() status: string;
}

/** One row per active loan type per customer — carries the repayment date that
 * `customer_daily_positions` doesn't (that table only has the running balance). */
@Entity('customer_loans')
@Index(['customerId'])
export class CustomerLoan {
  @PrimaryColumn('varchar') id: string;
  @Column({ name: 'customer_id' }) customerId: string;
  @ManyToOne(() => Customer, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'customer_id' }) customer: Customer;
  @Column({ name: 'loan_type' }) loanType: string;
  @Column('numeric', { precision: 20, scale: 2 }) principal: string;
  @Column({ name: 'disbursement_date', type: 'date' }) disbursementDate: string;
  @Column('numeric', { name: 'interest_rate', precision: 7, scale: 4 }) interestRate: string;
  @Column({ name: 'term_months', type: 'integer' }) termMonths: number;
  @Column('numeric', { name: 'monthly_payment_estimate', precision: 20, scale: 2 }) monthlyPaymentEstimate: string;
  @Column({ name: 'next_due_date', type: 'date' }) nextDueDate: string;
  @Column({ default: 'ACTIVE' }) status: string;
}

@Entity('customer_interactions')
@Index(['customerId', 'interactionAt'])
export class CustomerInteraction {
  @PrimaryColumn('varchar') id: string;
  @Column({ name: 'customer_id' }) customerId: string;
  @ManyToOne(() => Customer) @JoinColumn({ name: 'customer_id' }) customer: Customer;
  @Column() channel: string;
  @Column() type: string;
  @Column() sentiment: string;
  @Column() subject: string;
  @Column() summary: string;
  @Column() status: string;
  @Column({ name: 'interaction_at', type: 'timestamptz' }) interactionAt: Date;
}

@Entity('agent_runs')
@Index(['customerId', 'createdAt'])
export class AgentRun {
  @PrimaryColumn('varchar') id: string;
  @Column({ name: 'customer_id' }) customerId: string;
  @ManyToOne(() => Customer) @JoinColumn({ name: 'customer_id' }) customer: Customer;
  @Column({ name: 'rm_id' }) rmId: string;
  @ManyToOne(() => RMUser) @JoinColumn({ name: 'rm_id' }) rm: RMUser;
  @Column() provider: string;
  @Column({ name: 'external_run_id', type: 'varchar', nullable: true }) externalRunId: string | null;
  @Column() objective: string;
  @Column() status: string;
  @Column({ name: 'started_at', type: 'timestamptz', nullable: true }) startedAt: Date | null;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt: Date | null;
  @Column({ name: 'latency_ms', type: 'integer', nullable: true }) latencyMs: number | null;
  @Column({ name: 'request_payload', type: 'jsonb' }) requestPayload: Record<string, unknown>;
  @Column({ name: 'response_payload', type: 'jsonb', nullable: true }) responsePayload: Record<string, unknown> | null;
  @Column({ name: 'error_code', type: 'varchar', nullable: true }) errorCode: string | null;
  @Column({ name: 'error_message', type: 'varchar', nullable: true }) errorMessage: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @OneToMany(() => Recommendation, (recommendation) => recommendation.agentRun) recommendations: Recommendation[];
}

@Entity('recommendations')
export class Recommendation {
  @PrimaryColumn('varchar') id: string;
  @Column({ name: 'agent_run_id' }) agentRunId: string;
  @ManyToOne(() => AgentRun, (run) => run.recommendations) @JoinColumn({ name: 'agent_run_id' }) agentRun: AgentRun;
  @Column({ name: 'customer_id' }) customerId: string;
  @Column('integer') priority: number;
  @Column() type: string;
  @Column() title: string;
  @Column({ type: 'text' }) description: string;
  @Column('numeric', { precision: 5, scale: 4 }) confidence: string;
  @Column({ name: 'product_id', type: 'varchar', nullable: true }) productId: string | null;
  @Column({ name: 'product_name', type: 'varchar', nullable: true }) productName: string | null;
  @Column({ name: 'suggested_script', type: 'text' }) suggestedScript: string;
  @Column({ name: 'sell_allowed' }) sellAllowed: boolean;
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" }) reasons: string[];
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @OneToMany(() => RecommendationEvidence, (evidence) => evidence.recommendation) evidence: RecommendationEvidence[];
}

@Entity('recommendation_evidence')
export class RecommendationEvidence {
  @PrimaryColumn('varchar') id: string;
  @Column({ name: 'recommendation_id' }) recommendationId: string;
  @ManyToOne(() => Recommendation, (recommendation) => recommendation.evidence) @JoinColumn({ name: 'recommendation_id' }) recommendation: Recommendation;
  @Column() type: string;
  @Column() title: string;
  @Column({ type: 'text' }) description: string;
  @Column({ type: 'varchar', nullable: true }) source: string | null;
  @Column({ name: 'source_reference', type: 'varchar', nullable: true }) sourceReference: string | null;
}

@Entity('recommendation_feedback')
@Index(['recommendationId', 'rmId'], { unique: true })
export class RecommendationFeedback {
  @PrimaryColumn('varchar') id: string;
  @Column({ name: 'recommendation_id' }) recommendationId: string;
  @ManyToOne(() => Recommendation) @JoinColumn({ name: 'recommendation_id' }) recommendation: Recommendation;
  @Column({ name: 'rm_id' }) rmId: string;
  @ManyToOne(() => RMUser) @JoinColumn({ name: 'rm_id' }) rm: RMUser;
  @Column({ type: 'boolean', nullable: true }) useful: boolean | null;
  @Column() status: string;
  @Column({ type: 'text', nullable: true }) comment: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}

const money = { type: 'numeric' as const, precision: 20, scale: 2 };

/** One row per customer per calendar day: sheet "Nhật ký 365 ngày" (32 columns). */
@Entity('customer_daily_positions')
@Index(['customerId', 'dayIndex'])
export class CustomerDailyPosition {
  @PrimaryColumn({ name: 'customer_id' }) customerId: string;
  @ManyToOne(() => Customer, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'customer_id' }) customer: Customer;
  @PrimaryColumn({ name: 'position_date', type: 'date' }) positionDate: string;
  @Column({ name: 'month_key', type: 'integer' }) monthKey: number;
  @Column({ name: 'day_index', type: 'smallint' }) dayIndex: number;
  @Column({ name: 'account_balance', ...money }) accountBalance: string;
  @Column({ name: 'casa_balance', ...money }) casaBalance: string;
  @Column({ name: 'fd_balance', ...money }) fdBalance: string;
  @Column({ name: 'bond_balance', ...money }) bondBalance: string;
  @Column({ name: 'fund_cert_value', ...money }) fundCertValue: string;
  @Column({ name: 'loan_advance', ...money }) loanAdvance: string;
  @Column({ name: 'loan_overdraft', ...money }) loanOverdraft: string;
  @Column({ name: 'loan_unsecured', ...money }) loanUnsecured: string;
  @Column({ name: 'loan_mortgage', ...money }) loanMortgage: string;
  @Column({ name: 'loan_total', ...money }) loanTotal: string;
  @Column({ name: 'credit_card_balance', ...money }) creditCardBalance: string;
  @Column({ name: 'credit_card_spend', ...money }) creditCardSpend: string;
  @Column({ name: 'fx_volume', ...money }) fxVolume: string;
  @Column({ name: 'banca_life_premium', ...money }) bancaLifePremium: string;
  @Column({ name: 'banca_nonlife_premium', ...money }) bancaNonlifePremium: string;
  @Column({ name: 'mobile_topup', ...money }) mobileTopup: string;
  @Column({ name: 'bill_payment', ...money }) billPayment: string;
  @Column({ name: 'securities_net', ...money }) securitiesNet: string;
  @Column({ name: 'flight_ticket', ...money }) flightTicket: string;
  @Column({ name: 'bus_ticket', ...money }) busTicket: string;
  @Column({ name: 'vietlott', ...money }) vietlott: string;
  @Column({ name: 'loan_repayment', ...money }) loanRepayment: string;
  @Column({ name: 'genetica_fee', ...money }) geneticaFee: string;
  @Column({ name: 'advisory_fee', ...money }) advisoryFee: string;
  @Column({ name: 'western_union_fee', ...money }) westernUnionFee: string;
  @Column({ name: 'nice_account_fee', ...money }) niceAccountFee: string;
  @Column({ name: 'txn_count', type: 'integer' }) txnCount: number;
  @Column({ name: 'is_active', type: 'boolean' }) isActive: boolean;
}

/** Sheet "Product Holding": 13 product lines, 1 = held. */
@Entity('product_holdings')
export class ProductHolding {
  @PrimaryColumn({ name: 'customer_id' }) customerId: string;
  @ManyToOne(() => Customer, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'customer_id' }) customer: Customer;
  @PrimaryColumn({ name: 'product_code' }) productCode: string;
  @Column({ type: 'boolean', default: false }) held: boolean;
}

/** Sheet "Next Best Offer": static rank per unheld product family, NULL = already owned. */
@Entity('next_best_offers')
export class NextBestOffer {
  @PrimaryColumn({ name: 'customer_id' }) customerId: string;
  @ManyToOne(() => Customer, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'customer_id' }) customer: Customer;
  @PrimaryColumn({ name: 'product_code' }) productCode: string;
  @Column({ type: 'smallint', nullable: true }) rank: number | null;
}

/** Part B metric snapshot per customer and as-of date (sheet "Chỉ số đánh giá KH"). */
@Entity('customer_metrics')
@Index(['asOfDate', 'priorityScore'])
export class CustomerMetric {
  @PrimaryColumn({ name: 'customer_id' }) customerId: string;
  @ManyToOne(() => Customer, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'customer_id' }) customer: Customer;
  @PrimaryColumn({ name: 'as_of_date', type: 'date' }) asOfDate: string;
  @Column({ name: 'recency_days', type: 'integer' }) recencyDays: number;
  @Column({ name: 'freq_90', type: 'integer' }) freq90: number;
  @Column({ name: 'freq_prev_90', type: 'integer' }) freqPrev90: number;
  @Column({ name: 'casa_avg_90', ...money }) casaAvg90: string;
  @Column({ name: 'casa_avg_prev_90', ...money }) casaAvgPrev90: string;
  @Column({ name: 'casa_trend', type: 'double precision' }) casaTrend: number;
  @Column({ name: 'casa_cv', type: 'double precision' }) casaCv: number;
  @Column({ name: 'cc_avg_balance_90', ...money }) ccAvgBalance90: string;
  @Column({ name: 'credit_limit', ...money }) creditLimit: string;
  @Column({ type: 'double precision' }) cur: number;
  @Column({ name: 'loan_total', ...money }) loanTotal: string;
  @Column({ name: 'fd_current', ...money }) fdCurrent: string;
  @Column({ name: 'fd_avg_prev_90', ...money }) fdAvgPrev90: string;
  @Column({ name: 'fd_liquidated', type: 'boolean' }) fdLiquidated: boolean;
  @Column({ name: 'bond_current', ...money }) bondCurrent: string;
  @Column({ name: 'fund_cert_current', ...money }) fundCertCurrent: string;
  @Column({ ...money }) tav: string;
  @Column({ type: 'double precision' }) leverage: number;
  @Column({ type: 'double precision' }) phs: number;
  @Column({ name: 'holding_count', type: 'smallint' }) holdingCount: number;
  @Column({ name: 'fx_volume_12m', ...money }) fxVolume12m: string;
  @Column({ name: 'ras_raw', type: 'double precision' }) rasRaw: number;
  @Column({ type: 'double precision' }) ras: number;
  @Column({ name: 'value_score', type: 'double precision' }) valueScore: number;
  @Column({ name: 'churn_score', type: 'double precision' }) churnScore: number;
  @Column({ name: 'churn_label' }) churnLabel: string;
  @Column({ name: 'cross_sell_score', type: 'double precision' }) crossSellScore: number;
  @Column({ name: 'priority_score', type: 'double precision' }) priorityScore: number;
  @Column({ name: 'behaviour_label' }) behaviourLabel: string;
  @Column({ name: 'risk_appetite_label' }) riskAppetiteLabel: string;
  @Column({ name: 'tier_label' }) tierLabel: string;
  @Column({ name: 'phs_label' }) phsLabel: string;
  @Column({ name: 'suggestion_code' }) suggestionCode: string;
  @Column({ name: 'is_new_cif', type: 'boolean', default: false }) isNewCif: boolean;
  @Column({ name: 'computed_at', type: 'timestamptz', default: () => 'now()' }) computedAt: Date;
}

export const entities = [
  RMUser,
  Customer,
  Account,
  BankTransaction,
  Card,
  Deposit,
  CustomerLoan,
  CustomerInteraction,
  AgentRun,
  Recommendation,
  RecommendationEvidence,
  RecommendationFeedback,
  CustomerDailyPosition,
  ProductHolding,
  NextBestOffer,
  CustomerMetric,
];
