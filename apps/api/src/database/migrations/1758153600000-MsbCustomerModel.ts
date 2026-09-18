import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * MSB customer evaluation model (Khung công thức đánh giá KH MSB, 18/09/2026).
 *
 * Adds the customer master attributes from sheet "Danh sách KH & Phân hạng", the
 * 365-day daily journal, the 13-line product holding matrix, static Next Best Offer
 * ranks and the computed metric snapshot (Part B of the framework). Additive only:
 * the tables created by InitialSchema are kept for the Customer 360 UI.
 */
export class MsbCustomerModel1758153600000 implements MigrationInterface {
  name = 'MsbCustomerModel1758153600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE customers
        ADD COLUMN cif varchar,
        ADD COLUMN branch varchar,
        ADD COLUMN tier varchar NOT NULL DEFAULT 'Mass',
        ADD COLUMN declared_behaviour varchar,
        ADD COLUMN declared_risk_appetite varchar,
        ADD COLUMN churn_warning boolean NOT NULL DEFAULT false,
        ADD COLUMN behaviour_note text,
        ALTER COLUMN occupation DROP NOT NULL;
      CREATE UNIQUE INDEX idx_customers_cif ON customers(cif);
      CREATE INDEX idx_customers_rm_tier ON customers(rm_id, tier);

      ALTER TABLE deposits
        ALTER COLUMN maturity_date DROP NOT NULL,
        ALTER COLUMN interest_rate DROP NOT NULL;

      CREATE TABLE customer_daily_positions (
        customer_id varchar NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        position_date date NOT NULL,
        month_key integer NOT NULL,
        day_index smallint NOT NULL,
        account_balance numeric(20,2) NOT NULL DEFAULT 0,
        casa_balance numeric(20,2) NOT NULL DEFAULT 0,
        fd_balance numeric(20,2) NOT NULL DEFAULT 0,
        bond_balance numeric(20,2) NOT NULL DEFAULT 0,
        fund_cert_value numeric(20,2) NOT NULL DEFAULT 0,
        loan_advance numeric(20,2) NOT NULL DEFAULT 0,
        loan_overdraft numeric(20,2) NOT NULL DEFAULT 0,
        loan_unsecured numeric(20,2) NOT NULL DEFAULT 0,
        loan_mortgage numeric(20,2) NOT NULL DEFAULT 0,
        loan_total numeric(20,2) NOT NULL DEFAULT 0,
        credit_card_balance numeric(20,2) NOT NULL DEFAULT 0,
        credit_card_spend numeric(20,2) NOT NULL DEFAULT 0,
        fx_volume numeric(20,2) NOT NULL DEFAULT 0,
        banca_life_premium numeric(20,2) NOT NULL DEFAULT 0,
        banca_nonlife_premium numeric(20,2) NOT NULL DEFAULT 0,
        mobile_topup numeric(20,2) NOT NULL DEFAULT 0,
        bill_payment numeric(20,2) NOT NULL DEFAULT 0,
        securities_net numeric(20,2) NOT NULL DEFAULT 0,
        flight_ticket numeric(20,2) NOT NULL DEFAULT 0,
        bus_ticket numeric(20,2) NOT NULL DEFAULT 0,
        vietlott numeric(20,2) NOT NULL DEFAULT 0,
        loan_repayment numeric(20,2) NOT NULL DEFAULT 0,
        genetica_fee numeric(20,2) NOT NULL DEFAULT 0,
        advisory_fee numeric(20,2) NOT NULL DEFAULT 0,
        western_union_fee numeric(20,2) NOT NULL DEFAULT 0,
        nice_account_fee numeric(20,2) NOT NULL DEFAULT 0,
        txn_count integer NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT false,
        PRIMARY KEY (customer_id, position_date)
      );
      CREATE INDEX idx_daily_positions_customer_day ON customer_daily_positions(customer_id, day_index);

      CREATE TABLE product_holdings (
        customer_id varchar NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        product_code varchar NOT NULL,
        held boolean NOT NULL DEFAULT false,
        PRIMARY KEY (customer_id, product_code)
      );

      CREATE TABLE next_best_offers (
        customer_id varchar NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        product_code varchar NOT NULL,
        rank smallint,
        PRIMARY KEY (customer_id, product_code)
      );

      CREATE TABLE customer_metrics (
        customer_id varchar NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        as_of_date date NOT NULL,
        recency_days integer NOT NULL,
        freq_90 integer NOT NULL,
        freq_prev_90 integer NOT NULL,
        casa_avg_90 numeric(20,2) NOT NULL,
        casa_avg_prev_90 numeric(20,2) NOT NULL,
        casa_trend double precision NOT NULL,
        casa_cv double precision NOT NULL,
        cc_avg_balance_90 numeric(20,2) NOT NULL,
        credit_limit numeric(20,2) NOT NULL,
        cur double precision NOT NULL,
        loan_total numeric(20,2) NOT NULL,
        fd_current numeric(20,2) NOT NULL,
        fd_avg_prev_90 numeric(20,2) NOT NULL,
        fd_liquidated boolean NOT NULL,
        bond_current numeric(20,2) NOT NULL,
        fund_cert_current numeric(20,2) NOT NULL,
        tav numeric(20,2) NOT NULL,
        leverage double precision NOT NULL,
        phs double precision NOT NULL,
        holding_count smallint NOT NULL,
        fx_volume_12m numeric(20,2) NOT NULL,
        ras_raw double precision NOT NULL,
        ras double precision NOT NULL,
        value_score double precision NOT NULL,
        churn_score double precision NOT NULL,
        churn_label varchar NOT NULL,
        cross_sell_score double precision NOT NULL,
        priority_score double precision NOT NULL,
        behaviour_label varchar NOT NULL,
        risk_appetite_label varchar NOT NULL,
        tier_label varchar NOT NULL,
        phs_label varchar NOT NULL,
        suggestion_code varchar NOT NULL,
        is_new_cif boolean NOT NULL DEFAULT false,
        computed_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (customer_id, as_of_date)
      );
      CREATE INDEX idx_customer_metrics_asof_priority ON customer_metrics(as_of_date, priority_score DESC);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS customer_metrics;
      DROP TABLE IF EXISTS next_best_offers;
      DROP TABLE IF EXISTS product_holdings;
      DROP TABLE IF EXISTS customer_daily_positions;
      DELETE FROM deposits WHERE maturity_date IS NULL OR interest_rate IS NULL;
      ALTER TABLE deposits
        ALTER COLUMN maturity_date SET NOT NULL,
        ALTER COLUMN interest_rate SET NOT NULL;
      DROP INDEX IF EXISTS idx_customers_rm_tier;
      DROP INDEX IF EXISTS idx_customers_cif;
      UPDATE customers SET occupation = '' WHERE occupation IS NULL;
      ALTER TABLE customers
        ALTER COLUMN occupation SET NOT NULL,
        DROP COLUMN behaviour_note,
        DROP COLUMN churn_warning,
        DROP COLUMN declared_risk_appetite,
        DROP COLUMN declared_behaviour,
        DROP COLUMN tier,
        DROP COLUMN branch,
        DROP COLUMN cif;
    `);
  }
}
