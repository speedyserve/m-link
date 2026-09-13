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
  @Column() occupation: string;
  @Column({ name: 'relationship_status' }) relationshipStatus: string;
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
  @Column('numeric', { name: 'interest_rate', precision: 7, scale: 4 }) interestRate: string;
  @Column({ name: 'start_date', type: 'date' }) startDate: string;
  @Column({ name: 'maturity_date', type: 'date' }) maturityDate: string;
  @Column() status: string;
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

export const entities = [
  RMUser,
  Customer,
  Account,
  BankTransaction,
  Card,
  Deposit,
  CustomerInteraction,
  AgentRun,
  Recommendation,
  RecommendationEvidence,
  RecommendationFeedback,
];
