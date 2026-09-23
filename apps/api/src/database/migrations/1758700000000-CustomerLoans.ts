import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-loan schedule so the Customer 360 profile can show "ngày cần trả nợ vay" for
 * customers who carry a loan balance. `customer_daily_positions` only has the running
 * loan balance by type per day, not a repayment date, so this is a separate table
 * seeded alongside it (see seed.ts) — one row per active loan type per customer.
 */
export class CustomerLoans1758700000000 implements MigrationInterface {
  name = 'CustomerLoans1758700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE customer_loans (
        id varchar PRIMARY KEY,
        customer_id varchar NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        loan_type varchar NOT NULL,
        principal numeric(20,2) NOT NULL,
        disbursement_date date NOT NULL,
        interest_rate numeric(7,4) NOT NULL,
        term_months integer NOT NULL,
        monthly_payment_estimate numeric(20,2) NOT NULL,
        next_due_date date NOT NULL,
        status varchar NOT NULL DEFAULT 'ACTIVE'
      );
      CREATE INDEX idx_customer_loans_customer ON customer_loans(customer_id);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS customer_loans;`);
  }
}
