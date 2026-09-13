import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1726200000000 implements MigrationInterface {
  name = 'InitialSchema1726200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE rm_users (
        id varchar PRIMARY KEY, name varchar NOT NULL, email varchar UNIQUE NOT NULL,
        branch varchar NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE customers (
        id varchar PRIMARY KEY, customer_code varchar UNIQUE NOT NULL,
        rm_id varchar NOT NULL REFERENCES rm_users(id), full_name varchar NOT NULL,
        date_of_birth date NOT NULL, gender varchar NOT NULL, segment varchar NOT NULL,
        customer_since date NOT NULL, phone varchar NOT NULL, email varchar NOT NULL,
        occupation varchar NOT NULL, relationship_status varchar NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_customers_rm_name ON customers(rm_id, full_name);
      CREATE TABLE accounts (
        id varchar PRIMARY KEY, customer_id varchar NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        account_number varchar UNIQUE NOT NULL, type varchar NOT NULL, currency varchar(3) NOT NULL,
        balance numeric(20,2) NOT NULL, available_balance numeric(20,2) NOT NULL,
        status varchar NOT NULL, opened_at date NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_accounts_customer ON accounts(customer_id);
      CREATE TABLE transactions (
        id varchar PRIMARY KEY, account_id varchar NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        customer_id varchar NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        transaction_code varchar UNIQUE NOT NULL, type varchar NOT NULL, category varchar NOT NULL,
        amount numeric(20,2) NOT NULL, currency varchar(3) NOT NULL, description varchar NOT NULL,
        merchant varchar, transaction_at timestamptz NOT NULL, balance_after numeric(20,2) NOT NULL
      );
      CREATE INDEX idx_transactions_customer_date ON transactions(customer_id, transaction_at DESC);
      CREATE TABLE cards (
        id varchar PRIMARY KEY, customer_id varchar NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        masked_number varchar NOT NULL, type varchar NOT NULL, credit_limit numeric(20,2) NOT NULL,
        available_limit numeric(20,2) NOT NULL, status varchar NOT NULL, expiry_date date NOT NULL,
        last_transaction_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_cards_customer ON cards(customer_id);
      CREATE TABLE deposits (
        id varchar PRIMARY KEY, customer_id varchar NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        product_name varchar NOT NULL, principal numeric(20,2) NOT NULL,
        interest_rate numeric(7,4) NOT NULL, start_date date NOT NULL,
        maturity_date date NOT NULL, status varchar NOT NULL
      );
      CREATE INDEX idx_deposits_customer ON deposits(customer_id);
      CREATE TABLE customer_interactions (
        id varchar PRIMARY KEY, customer_id varchar NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        channel varchar NOT NULL, type varchar NOT NULL, sentiment varchar NOT NULL,
        subject varchar NOT NULL, summary varchar NOT NULL, status varchar NOT NULL,
        interaction_at timestamptz NOT NULL
      );
      CREATE INDEX idx_interactions_customer_date ON customer_interactions(customer_id, interaction_at DESC);
      CREATE TABLE agent_runs (
        id varchar PRIMARY KEY, customer_id varchar NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        rm_id varchar NOT NULL REFERENCES rm_users(id), provider varchar NOT NULL,
        external_run_id varchar, objective varchar NOT NULL, status varchar NOT NULL,
        started_at timestamptz, completed_at timestamptz, latency_ms integer,
        request_payload jsonb NOT NULL, response_payload jsonb, error_code varchar, error_message varchar,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_agent_runs_customer_date ON agent_runs(customer_id, created_at DESC);
      CREATE UNIQUE INDEX idx_agent_runs_active ON agent_runs(customer_id, rm_id)
        WHERE status IN ('PENDING', 'RUNNING');
      CREATE TABLE recommendations (
        id varchar PRIMARY KEY, agent_run_id varchar NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
        customer_id varchar NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        priority integer NOT NULL, type varchar NOT NULL, title varchar NOT NULL,
        description text NOT NULL, confidence numeric(5,4) NOT NULL, product_id varchar,
        product_name varchar, suggested_script text NOT NULL, sell_allowed boolean NOT NULL,
        reasons jsonb NOT NULL DEFAULT '[]'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE recommendation_evidence (
        id varchar PRIMARY KEY,
        recommendation_id varchar NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
        type varchar NOT NULL, title varchar NOT NULL, description text NOT NULL,
        source varchar, source_reference varchar
      );
      CREATE TABLE recommendation_feedback (
        id varchar PRIMARY KEY,
        recommendation_id varchar NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
        rm_id varchar NOT NULL REFERENCES rm_users(id), useful boolean, status varchar NOT NULL,
        comment text, created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(recommendation_id, rm_id)
      );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS recommendation_feedback;
      DROP TABLE IF EXISTS recommendation_evidence;
      DROP TABLE IF EXISTS recommendations;
      DROP TABLE IF EXISTS agent_runs;
      DROP TABLE IF EXISTS customer_interactions;
      DROP TABLE IF EXISTS deposits;
      DROP TABLE IF EXISTS cards;
      DROP TABLE IF EXISTS transactions;
      DROP TABLE IF EXISTS accounts;
      DROP TABLE IF EXISTS customers;
      DROP TABLE IF EXISTS rm_users;
    `);
  }
}

