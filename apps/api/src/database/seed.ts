import { customerAnalysisSchema } from '@mlink/contracts';
import { AppDataSource } from './data-source';
import {
  Account,
  AgentRun,
  BankTransaction,
  Card,
  Customer,
  CustomerInteraction,
  Deposit,
  Recommendation,
  RecommendationEvidence,
  RMUser,
} from './entities';
import { buildMockAnalysis } from '../modules/agent/mock-fixtures';

const DAY = 86_400_000;
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY);

export async function seedDatabase(truncate = false) {
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();
  if (truncate) {
    await AppDataSource.query(`TRUNCATE recommendation_feedback, recommendation_evidence,
      recommendations, agent_runs, customer_interactions, deposits, cards, transactions,
      accounts, customers, rm_users RESTART IDENTITY CASCADE`);
  }

  const reference = new Date(`${process.env.DEMO_REFERENCE_DATE ?? '2026-09-13'}T12:00:00.000Z`);
  const rms: Partial<RMUser>[] = [
    { id: 'RM001', name: 'Trần Mai Anh', email: 'mai.anh@mlink.demo', branch: 'Hồ Chí Minh' },
    { id: 'RM002', name: 'Nguyễn Đức Long', email: 'duc.long@mlink.demo', branch: 'Hà Nội' },
    { id: 'RM003', name: 'Lê Thu Hà', email: 'thu.ha@mlink.demo', branch: 'Đà Nẵng' },
  ];
  await AppDataSource.getRepository(RMUser).upsert(rms, ['id']);

  const golden = [
    { name: 'Lê Polo', segment: 'PRIORITY', status: 'HEALTHY', occupation: 'Doanh nhân' },
    { name: 'Hoàng Lan', segment: 'PRIORITY', status: 'NEEDS_ATTENTION', occupation: 'Giám đốc' },
    { name: 'Nguyễn Minh', segment: 'MASS_AFFLUENT', status: 'HEALTHY', occupation: 'Kỹ sư' },
  ];
  const customers: Partial<Customer>[] = Array.from({ length: 30 }, (_, index) => {
    const number = index + 1;
    const special = golden[index];
    return {
      id: `CUS${String(number).padStart(3, '0')}`,
      customerCode: `CUS${String(number).padStart(3, '0')}`,
      rmId: index < 3 ? 'RM001' : `RM00${(index % 3) + 1}`,
      fullName: special?.name ?? `Khách hàng Demo ${String(number).padStart(2, '0')}`,
      dateOfBirth: `${1975 + (index % 24)}-${String((index % 12) + 1).padStart(2, '0')}-15`,
      gender: index % 2 ? 'FEMALE' : 'MALE',
      segment: special?.segment ?? ['MASS', 'MASS_AFFLUENT', 'PRIORITY'][index % 3],
      customerSince: `${2015 + (index % 9)}-01-10`,
      phone: `090${String(1000000 + index).slice(-7)}`,
      email: `customer${number}@example.test`,
      occupation: special?.occupation ?? 'Chuyên viên',
      relationshipStatus: special?.status ?? (index % 9 === 0 ? 'NEEDS_ATTENTION' : 'HEALTHY'),
    };
  });
  await AppDataSource.getRepository(Customer).upsert(customers, ['id']);

  const accounts: Partial<Account>[] = [];
  for (let i = 0; i < 50; i++) {
    const customerNumber = i < 40 ? Math.floor(i / 2) + 1 : i - 19;
    const customerId = `CUS${String(customerNumber).padStart(3, '0')}`;
    const balance = customerId === 'CUS001' ? (i % 2 ? '180000000.00' : '500000000.00') :
      customerId === 'CUS002' ? '220000000.00' : customerId === 'CUS003' ? '45000000.00' : `${20_000_000 + i * 1_250_000}.00`;
    accounts.push({
      id: `ACC${String(i + 1).padStart(3, '0')}`,
      customerId,
      accountNumber: `1900${String(i + 1).padStart(8, '0')}`,
      type: i % 2 ? 'SAVINGS' : 'CASA', currency: 'VND', balance,
      availableBalance: balance, status: 'ACTIVE', openedAt: isoDate(addDays(reference, -900 - i * 5)),
    });
  }
  await AppDataSource.getRepository(Account).upsert(accounts, ['id']);

  const accountByCustomer = new Map<string, string>();
  accounts.forEach((account) => {
    if (!accountByCustomer.has(account.customerId!)) accountByCustomer.set(account.customerId!, account.id!);
  });
  const categories = ['SALARY', 'TRANSFER', 'DINING', 'TRAVEL', 'SHOPPING', 'HEALTHCARE', 'EDUCATION', 'UTILITY', 'INVESTMENT', 'OTHER'];
  const transactions: Partial<BankTransaction>[] = [];
  for (let i = 0; i < 510; i++) {
    const customerNumber = (i % 30) + 1;
    const customerId = `CUS${String(customerNumber).padStart(3, '0')}`;
    const special = i === 0;
    const amount = special ? '500000000.00' : `${150_000 + ((i * 97_531) % 12_000_000)}.00`;
    transactions.push({
      id: `TX${String(i + 1).padStart(4, '0')}`,
      accountId: accountByCustomer.get(customerId)!, customerId,
      transactionCode: `TX${String(i + 1).padStart(6, '0')}`,
      type: special || i % 5 === 0 ? 'CREDIT' : 'DEBIT',
      category: special ? 'TRANSFER' : categories[i % categories.length], amount, currency: 'VND',
      description: special ? 'Chuyển khoản đến' : `Giao dịch demo ${i + 1}`,
      merchant: special ? null : `Merchant ${i % 12}`,
      transactionAt: addDays(reference, special ? -7 : customerId === 'CUS001' ? -(8 + (i % 82)) : -(i % 90)),
      balanceAfter: special ? '500000000.00' : `${10_000_000 + ((i * 777_777) % 80_000_000)}.00`,
    });
  }
  for (let offset = 0; offset < transactions.length; offset += 100) {
    await AppDataSource.getRepository(BankTransaction).upsert(transactions.slice(offset, offset + 100), ['id']);
  }

  const cards: Partial<Card>[] = Array.from({ length: 15 }, (_, i) => ({
    id: `CARD${String(i + 1).padStart(3, '0')}`, customerId: `CUS${String(i + 1).padStart(3, '0')}`,
    maskedNumber: `**** **** **** ${String(1200 + i)}`, type: 'CREDIT', creditLimit: `${50_000_000 + i * 5_000_000}.00`,
    availableLimit: `${35_000_000 + i * 3_000_000}.00`, status: 'ACTIVE',
    expiryDate: `${reference.getUTCFullYear() + 3}-12-31`, lastTransactionAt: addDays(reference, -(i % 10)),
  }));
  await AppDataSource.getRepository(Card).upsert(cards, ['id']);

  const deposits: Partial<Deposit>[] = Array.from({ length: 15 }, (_, i) => ({
    id: `DEP${String(i + 1).padStart(3, '0')}`, customerId: `CUS${String(i + 1).padStart(3, '0')}`,
    productName: i === 0 ? 'Tiền gửi Priority 6 tháng' : `Tiền gửi ${3 + (i % 4) * 3} tháng`,
    principal: `${100_000_000 + i * 10_000_000}.00`, interestRate: `${4.5 + (i % 4) * 0.25}`,
    startDate: isoDate(addDays(reference, -175 - i)), maturityDate: isoDate(addDays(reference, i === 0 ? 5 : 30 + i * 7)), status: 'ACTIVE',
  }));
  await AppDataSource.getRepository(Deposit).upsert(deposits, ['id']);

  const interactions: Partial<CustomerInteraction>[] = Array.from({ length: 30 }, (_, i) => ({
    id: `INT${String(i + 1).padStart(3, '0')}`, customerId: `CUS${String(i + 1).padStart(3, '0')}`,
    channel: ['CALL', 'BRANCH', 'EMAIL', 'CHAT', 'APP'][i % 5], type: 'SERVICE',
    sentiment: i === 1 ? 'NEGATIVE' : 'NEUTRAL', subject: i === 1 ? 'Khiếu nại phí dịch vụ' : 'Chăm sóc định kỳ',
    summary: i === 1 ? 'Khách hàng chưa hài lòng và cần phản hồi.' : 'Trao đổi chăm sóc khách hàng.',
    status: i === 1 ? 'OPEN' : 'CLOSED', interactionAt: addDays(reference, -(i % 20)),
  }));
  interactions.push(
    { id: 'INT031', customerId: 'CUS002', channel: 'CALL', type: 'COMPLAINT', sentiment: 'NEGATIVE', subject: 'Theo dõi khiếu nại', summary: 'Khách hàng gọi lại lần hai.', status: 'OPEN', interactionAt: addDays(reference, -2) },
    { id: 'INT032', customerId: 'CUS002', channel: 'EMAIL', type: 'COMPLAINT', sentiment: 'NEGATIVE', subject: 'Yêu cầu phản hồi', summary: 'Khách hàng yêu cầu xử lý sớm.', status: 'OPEN', interactionAt: addDays(reference, -1) },
  );
  await AppDataSource.getRepository(CustomerInteraction).upsert(interactions, ['id']);

  for (const customerId of ['CUS001', 'CUS002', 'CUS003']) {
    const suffix = customerId.slice(-3);
    const response = customerAnalysisSchema.parse(buildMockAnalysis(customerId, 'vi', `RUN-SEED-${suffix}`));
    const runId = `ARUN-SEED-${suffix}`;
    await AppDataSource.getRepository(AgentRun).upsert({
      id: runId, customerId, rmId: 'RM001', provider: 'mock', externalRunId: response.runId,
      objective: 'prepare_rm_brief', status: 'COMPLETED', startedAt: addDays(reference, -1),
      completedAt: addDays(reference, -1), latencyMs: 120, requestPayload: { customerId, locale: 'vi' },
      responsePayload: response, errorCode: null, errorMessage: null,
    }, ['id']);
    for (const [index, recommendation] of response.recommendations.entries()) {
      const recommendationId = `REC-SEED-${suffix}-${index + 1}`;
      await AppDataSource.getRepository(Recommendation).upsert({
        id: recommendationId, agentRunId: runId, customerId, priority: recommendation.priority,
        type: recommendation.type, title: recommendation.title, description: recommendation.description,
        confidence: String(recommendation.confidence), productId: recommendation.product?.id ?? null,
        productName: recommendation.product?.name ?? null, suggestedScript: recommendation.script,
        sellAllowed: response.guardrail.sellAllowed, reasons: recommendation.reasons,
      }, ['id']);
      const evidenceRows = recommendation.evidence.map((evidence, evidenceIndex) => ({
          id: `EVI-SEED-${suffix}-${index + 1}-${evidenceIndex + 1}`, recommendationId,
          type: evidence.type, title: evidence.title, description: evidence.description,
          source: evidence.source ?? null, sourceReference: evidence.sourceReference ?? null,
        }));
      if (evidenceRows.length) await AppDataSource.getRepository(RecommendationEvidence).upsert(evidenceRows, ['id']);
    }
  }
}

if (require.main === module) {
  seedDatabase(false)
    .then(async () => { console.log('Seed completed'); await AppDataSource.destroy(); })
    .catch(async (error: unknown) => {
      console.error('Seed failed', error instanceof Error ? error.message : 'Unknown error');
      if (AppDataSource.isInitialized) await AppDataSource.destroy();
      process.exitCode = 1;
    });
}
