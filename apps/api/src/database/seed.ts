/**
 * Seeds the MSB sample portfolio: 40 customers x 365 daily positions exported from
 * Data_mau_365ngay_40KH.xlsx (see msb-dataset/ and apps/agent/tools/export_msb_dataset.py).
 *
 * The seed always truncates: customer ids are CIFs, so leftovers from another dataset
 * would otherwise survive an upsert. Legacy tables (accounts, transactions, cards,
 * deposits) are derived from the daily journal so the Customer 360 UI keeps working,
 * then Part B metrics are recomputed for the dataset's as-of date.
 */
import { AppDataSource } from './data-source';
import {
  Account,
  BankTransaction,
  Card,
  Customer,
  CustomerDailyPosition,
  CustomerInteraction,
  Deposit,
  NextBestOffer,
  ProductHolding,
  RMUser,
} from './entities';
import { msbDataset, positionsByCustomer, type DailyPositionRecord } from './msb-dataset';
import { recomputeMetrics } from '../modules/metrics/metrics.service';

const money = (value: number) => value.toFixed(2);
const noon = (isoDate: string) => new Date(`${isoDate}T12:00:00.000Z`);
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);

/** Branch -> RM. RM001 (HCM) is the UI default and owns the southern branches. */
const RM_BY_BRANCH: Record<string, string> = {
  'CN Quận 1': 'RM001', 'CN Quận 3': 'RM001', 'CN Bình Thạnh': 'RM001', 'CN Cần Thơ': 'RM001',
  'CN Hà Nội': 'RM002', 'CN Đống Đa': 'RM002', 'CN Cầu Giấy': 'RM002', 'CN Hải Phòng': 'RM002', 'Sở Giao Dịch': 'RM002',
  'CN Đà Nẵng': 'RM003',
};
const SEGMENT_BY_TIER: Record<string, string> = { Aff: 'PRIORITY', MassAff: 'MASS_AFFLUENT', Mass: 'MASS' };

/** Daily flow columns that become transaction rows (one per non-zero cell). */
const FLOW_COLUMNS: Array<{ key: keyof DailyPositionRecord; category: string; description: string }> = [
  { key: 'creditCardSpend', category: 'CC_SPEND', description: 'Chi tiêu thẻ tín dụng' },
  { key: 'fxVolume', category: 'FX', description: 'Giao dịch ngoại tệ' },
  { key: 'bancaLifePremium', category: 'BANCA_LIFE', description: 'Phí bảo hiểm nhân thọ' },
  { key: 'bancaNonlifePremium', category: 'BANCA_NONLIFE', description: 'Phí bảo hiểm phi nhân thọ' },
  { key: 'mobileTopup', category: 'MOBILE_TOPUP', description: 'Nạp thẻ điện thoại' },
  { key: 'billPayment', category: 'BILL_PAYMENT', description: 'Thanh toán hóa đơn' },
  { key: 'securitiesNet', category: 'SECURITIES', description: 'Đầu tư chứng khoán' },
  { key: 'flightTicket', category: 'AIRLINE', description: 'Mua vé máy bay' },
  { key: 'busTicket', category: 'BUS_TICKET', description: 'Mua vé xe khách' },
  { key: 'vietlott', category: 'LOTTERY', description: 'Mua Vietlott' },
  { key: 'loanRepayment', category: 'LOAN_REPAYMENT', description: 'Trả nợ / thu nợ vay' },
  { key: 'geneticaFee', category: 'GENETICA', description: 'SP hợp tác Genetica' },
  { key: 'advisoryFee', category: 'ADVISORY_FEE', description: 'Phí tư vấn tài chính' },
  { key: 'westernUnionFee', category: 'WESTERN_UNION', description: 'Phí chuyển tiền Western Union' },
  { key: 'niceAccountFee', category: 'PREMIUM_ACCOUNT_FEE', description: 'Phí tài khoản số đẹp' },
];

async function insertChunked<T extends object>(entity: new () => T, rows: Partial<T>[], size: number) {
  const repository = AppDataSource.getRepository(entity);
  for (let offset = 0; offset < rows.length; offset += size) {
    await repository.insert(rows.slice(offset, offset + size) as never);
  }
}

/**
 * Deterministic PRNG (mulberry32, seeded from the CIF) so re-seeding produces the
 * same generated interactions every time without persisting a random seed anywhere.
 */
function mulberry32(seed: number) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const INTERACTION_CHANNELS = ['CALL', 'BRANCH', 'APP', 'EMAIL'] as const;
const COMPLAINT_TEMPLATES = [
  { subject: 'Khiếu nại phí thường niên thẻ tín dụng', summary: 'Khách hàng thắc mắc về khoản phí thường niên phát sinh, đề nghị xem xét miễn giảm.' },
  { subject: 'Giao dịch chuyển khoản bị treo', summary: 'Khách hàng phản ánh giao dịch chuyển khoản chưa về tài khoản người nhận, yêu cầu tra soát.' },
  { subject: 'Lỗi đăng nhập ứng dụng MSB mBank', summary: 'Khách hàng không đăng nhập được ứng dụng nhiều lần trong tuần, đề nghị hỗ trợ kỹ thuật.' },
  { subject: 'Thẻ tín dụng bị tạm khóa không rõ lý do', summary: 'Khách hàng phản ánh thẻ bị khóa khi đang giao dịch, cần mở lại sớm.' },
  { subject: 'Phản ánh cách thức nhắc nợ', summary: 'Khách hàng đề nghị điều chỉnh kênh và khung giờ liên hệ nhắc nợ.' },
  { subject: 'Thắc mắc về lãi suất tiết kiệm sau đáo hạn', summary: 'Khách hàng cho rằng lãi suất áp dụng thấp hơn tư vấn ban đầu, yêu cầu giải thích.' },
  { subject: 'Phản ánh thời gian chờ giao dịch tại quầy', summary: 'Khách hàng phàn nàn thời gian chờ xử lý giao dịch tại chi nhánh quá lâu.' },
];
const SERVICE_TEMPLATES = [
  { subject: 'Chăm sóc khách hàng định kỳ', summary: 'Gọi điện hỏi thăm nhu cầu sử dụng dịch vụ, khách hàng phản hồi tích cực.' },
  { subject: 'Xác nhận thông tin liên hệ', summary: 'Cập nhật lại số điện thoại và email theo yêu cầu của khách hàng.' },
  { subject: 'Hướng dẫn sử dụng ứng dụng mBank', summary: 'Hỗ trợ khách hàng thao tác chuyển tiền và mở sổ tiết kiệm online.' },
  { subject: 'Xác nhận lịch trả nợ vay', summary: 'Gửi lại lịch trả nợ và nhắc hạn thanh toán kỳ tới.' },
  { subject: 'Khảo sát mức độ hài lòng', summary: 'Thu thập phản hồi của khách hàng về chất lượng dịch vụ trong quý.' },
  { subject: 'Tư vấn gia hạn sổ tiết kiệm', summary: 'Tư vấn phương án tái tục sổ tiết kiệm sắp đến hạn.' },
];
const INQUIRY_TEMPLATES = [
  { subject: 'Hỏi về lãi suất gửi tiết kiệm online', summary: 'Khách hàng quan tâm mức lãi suất ưu đãi cho kỳ hạn 6 tháng.' },
  { subject: 'Hỏi về hạn mức thẻ tín dụng', summary: 'Khách hàng đề nghị tư vấn nâng hạn mức thẻ tín dụng.' },
  { subject: 'Hỏi về sản phẩm bảo hiểm nhân thọ', summary: 'Khách hàng muốn tìm hiểu thêm gói bảo hiểm liên kết đầu tư.' },
  { subject: 'Hỏi về chuyển tiền quốc tế', summary: 'Khách hàng cần tư vấn phí và thời gian chuyển tiền qua Western Union.' },
  { subject: 'Hỏi về mở tài khoản cho người thân', summary: 'Khách hàng muốn mở thêm tài khoản CASA cho người thân trong gia đình.' },
  { subject: 'Hỏi về chứng chỉ tiền gửi MSB', summary: 'Khách hàng tìm hiểu điều kiện mua chứng chỉ tiền gửi kỳ hạn dài.' },
];

/**
 * CIFs with a documented, period-sensitive demo scenario (docs/DEMO-SCENARIOS.md) that
 * must keep sellAllowed=true. An OPEN+NEGATIVE complaint flips the Customer-Care-First
 * guardrail in both dashboard.service.ts and the Agent, which would contradict the docs.
 * 08101918/08102466/08100548 already carry curated rows above and are excluded separately.
 */
const GUARDRAIL_SENSITIVE_CIFS = new Set(['08100274', '08100959', '08102740', '08103288']);

/** Generates 1-3 flavour interactions per customer not already covered by the curated rows above. */
function generateMockInteractions(
  customers: typeof msbDataset.customers,
  reference: Date,
  skipCifs: Set<string>,
): Partial<CustomerInteraction>[] {
  const rows: Partial<CustomerInteraction>[] = [];
  for (const customer of customers) {
    const cif = customer.cif;
    if (skipCifs.has(cif)) continue;
    const rand = mulberry32(hashSeed(cif));
    const guardrailSafeOnly = GUARDRAIL_SENSITIVE_CIFS.has(cif);
    const count = guardrailSafeOnly ? 1 : 1 + Math.floor(rand() * 3);
    for (let i = 0; i < count; i++) {
      const complaintWeight = customer.churnWarning ? 0.45 : 0.3;
      const roll = rand();
      const kind = roll < complaintWeight ? 'COMPLAINT' : roll < complaintWeight + 0.4 ? 'SERVICE' : 'INQUIRY';
      const pool = kind === 'COMPLAINT' ? COMPLAINT_TEMPLATES : kind === 'SERVICE' ? SERVICE_TEMPLATES : INQUIRY_TEMPLATES;
      const template = pool[Math.floor(rand() * pool.length)];
      const sentiment =
        kind === 'COMPLAINT' ? (rand() < 0.85 ? 'NEGATIVE' : 'NEUTRAL')
        : kind === 'SERVICE' ? (rand() < 0.5 ? 'POSITIVE' : 'NEUTRAL')
        : rand() < 0.3 ? 'POSITIVE' : 'NEUTRAL';
      const canOpenNegative = !guardrailSafeOnly && sentiment === 'NEGATIVE' && rand() < 0.2;
      const status = sentiment === 'NEGATIVE' ? (canOpenNegative ? 'OPEN' : 'CLOSED') : rand() < 0.25 ? 'OPEN' : 'CLOSED';
      const channel = INTERACTION_CHANNELS[Math.floor(rand() * INTERACTION_CHANNELS.length)];
      // The first row per customer always lands in the default 90-day demo window
      // (docs/DEMO-SCENARIOS.md) so the "Tương tác" tab is never empty on first load.
      const daysBack = i === 0 || rand() < 0.7 ? Math.floor(rand() * 89) : 90 + Math.floor(rand() * 210);
      rows.push({
        id: `INT-${cif}-${i + 1}`, customerId: cif, channel, type: kind, sentiment,
        subject: template.subject, summary: template.summary, status,
        interactionAt: addDays(reference, -daysBack),
      });
    }
  }
  return rows;
}

export async function seedDatabase(): Promise<{ customers: number; positions: number; transactions: number; metrics: number }> {
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();
  await AppDataSource.query(`TRUNCATE recommendation_feedback, recommendation_evidence, recommendations, agent_runs,
    customer_metrics, next_best_offers, product_holdings, customer_daily_positions, customer_interactions,
    deposits, cards, transactions, accounts, customers, rm_users RESTART IDENTITY CASCADE`);

  // The as-of date is the last journal day of the dataset, never the wall clock.
  const asOfDate = msbDataset.manifest.asOfDate;
  const reference = noon(asOfDate);

  await AppDataSource.getRepository(RMUser).insert([
    { id: 'RM001', name: 'Trần Mai Anh', email: 'mai.anh@mlink.demo', branch: 'Hồ Chí Minh' },
    { id: 'RM002', name: 'Nguyễn Đức Long', email: 'duc.long@mlink.demo', branch: 'Hà Nội' },
    { id: 'RM003', name: 'Lê Thu Hà', email: 'thu.ha@mlink.demo', branch: 'Đà Nẵng' },
  ]);

  const customers: Partial<Customer>[] = msbDataset.customers.map((row) => ({
    id: row.cif, customerCode: row.cif, cif: row.cif, rmId: RM_BY_BRANCH[row.branch] ?? 'RM001',
    fullName: row.fullName, dateOfBirth: row.dateOfBirth, gender: row.gender,
    segment: SEGMENT_BY_TIER[row.tier] ?? 'MASS', customerSince: row.cifOpenedAt, phone: row.phone, email: row.email,
    occupation: null, relationshipStatus: row.churnWarning ? 'AT_RISK' : 'HEALTHY',
    branch: row.branch, tier: row.tier, declaredBehaviour: row.declaredBehaviour,
    declaredRiskAppetite: row.declaredRiskAppetite, churnWarning: row.churnWarning, behaviourNote: row.behaviourNote,
  }));
  await AppDataSource.getRepository(Customer).insert(customers);

  const grouped = positionsByCustomer();
  const positions: Partial<CustomerDailyPosition>[] = [];
  const transactions: Partial<BankTransaction>[] = [];
  const accounts: Partial<Account>[] = [];
  const cards: Partial<Card>[] = [];
  const deposits: Partial<Deposit>[] = [];
  const holdings: Partial<ProductHolding>[] = [];
  const offers: Partial<NextBestOffer>[] = [];

  for (const customer of msbDataset.customers) {
    const cif = customer.cif;
    const rows = grouped.get(cif) ?? [];
    const last = rows[rows.length - 1];
    if (!last) throw new Error(`Dataset has no daily positions for CIF ${cif}`);

    for (const row of rows) {
      positions.push({
        customerId: cif, positionDate: row.positionDate, monthKey: row.monthKey, dayIndex: row.dayIndex,
        accountBalance: money(row.accountBalance), casaBalance: money(row.casaBalance), fdBalance: money(row.fdBalance),
        bondBalance: money(row.bondBalance), fundCertValue: money(row.fundCertValue), loanAdvance: money(row.loanAdvance),
        loanOverdraft: money(row.loanOverdraft), loanUnsecured: money(row.loanUnsecured), loanMortgage: money(row.loanMortgage),
        loanTotal: money(row.loanTotal), creditCardBalance: money(row.creditCardBalance), creditCardSpend: money(row.creditCardSpend),
        fxVolume: money(row.fxVolume), bancaLifePremium: money(row.bancaLifePremium), bancaNonlifePremium: money(row.bancaNonlifePremium),
        mobileTopup: money(row.mobileTopup), billPayment: money(row.billPayment), securitiesNet: money(row.securitiesNet),
        flightTicket: money(row.flightTicket), busTicket: money(row.busTicket), vietlott: money(row.vietlott),
        loanRepayment: money(row.loanRepayment), geneticaFee: money(row.geneticaFee), advisoryFee: money(row.advisoryFee),
        westernUnionFee: money(row.westernUnionFee), niceAccountFee: money(row.niceAccountFee),
        txnCount: row.txnCount, isActive: row.isActive,
      });
      for (const flow of FLOW_COLUMNS) {
        const amount = Number(row[flow.key]);
        if (!amount) continue;
        const inflow = flow.key === 'securitiesNet' && amount < 0;
        transactions.push({
          id: `TX-${cif}-${String(row.dayIndex).padStart(3, '0')}-${flow.category}`,
          transactionCode: `TX-${cif}-${String(row.dayIndex).padStart(3, '0')}-${flow.category}`,
          accountId: `ACC-${cif}-CASA`, customerId: cif, type: inflow ? 'CREDIT' : 'DEBIT', category: flow.category,
          amount: money(Math.abs(amount)), currency: 'VND',
          description: inflow ? 'Bán chứng khoán, tiền về tài khoản' : flow.description, merchant: null,
          transactionAt: noon(row.positionDate), balanceAfter: money(row.casaBalance),
        });
      }
    }

    accounts.push(
      {
        id: `ACC-${cif}-CASA`, customerId: cif, accountNumber: `19${cif}01`, type: 'CASA', currency: 'VND',
        balance: money(last.casaBalance), availableBalance: money(last.casaBalance), status: 'ACTIVE', openedAt: customer.cifOpenedAt,
      },
      {
        id: `ACC-${cif}-PAY`, customerId: cif, accountNumber: `19${cif}02`, type: 'PAYMENT', currency: 'VND',
        balance: money(last.accountBalance), availableBalance: money(last.accountBalance), status: 'ACTIVE', openedAt: customer.cifOpenedAt,
      },
    );

    const creditLimit = msbDataset.creditLimits[cif] ?? 0;
    if (creditLimit > 0) {
      const lastSpend = [...rows].reverse().find((row) => row.creditCardSpend > 0);
      cards.push({
        id: `CARD-${cif}`, customerId: cif, maskedNumber: `**** **** **** ${cif.slice(-4)}`, type: 'CREDIT',
        creditLimit: money(creditLimit), availableLimit: money(Math.max(0, creditLimit - last.creditCardBalance)),
        status: 'ACTIVE', expiryDate: '2029-12-31', lastTransactionAt: lastSpend ? noon(lastSpend.positionDate) : null,
      });
    }

    const firstFd = rows.find((row) => row.fdBalance > 0);
    if (firstFd) {
      const lastFdDay = [...rows].reverse().find((row) => row.fdBalance > 0)!;
      deposits.push({
        id: `DEP-${cif}`, customerId: cif, productName: 'Tiết kiệm lãi suất cao nhất',
        principal: money(last.fdBalance > 0 ? last.fdBalance : lastFdDay.fdBalance), interestRate: null,
        startDate: firstFd.positionDate, maturityDate: null, status: last.fdBalance > 0 ? 'ACTIVE' : 'CLOSED',
      });
    }

    for (const [productCode, held] of Object.entries(msbDataset.productHoldings[cif] ?? {})) {
      holdings.push({ customerId: cif, productCode, held: held === 1 });
    }
    for (const [productCode, rank] of Object.entries(msbDataset.nextBestOffers[cif] ?? {})) {
      offers.push({ customerId: cif, productCode, rank });
    }
  }

  await insertChunked(Account, accounts, 200);
  await insertChunked(CustomerDailyPosition, positions, 300);
  await insertChunked(BankTransaction, transactions, 500);
  await insertChunked(Card, cards, 200);
  await insertChunked(Deposit, deposits, 200);
  await insertChunked(ProductHolding, holdings, 500);
  await insertChunked(NextBestOffer, offers, 500);

  // Interactions are not part of the workbook. One open complaint keeps the
  // Customer-Care-First guardrail demonstrable (08101918: repeated debt collection).
  // The rest of the portfolio gets deterministically generated flavour interactions
  // (complaints, service calls, inquiries) so the "Tương tác" tab is never empty.
  const curatedInteractions: Partial<CustomerInteraction>[] = [
    { id: 'INT-08101918-1', customerId: '08101918', channel: 'CALL', type: 'COMPLAINT', sentiment: 'NEGATIVE',
      subject: 'Khiếu nại về tần suất nhắc nợ vay thế chấp', summary: 'Khách hàng phản ánh bị gọi thu nợ nhiều lần trong tuần và đề nghị xem lại lịch trả nợ.',
      status: 'OPEN', interactionAt: addDays(reference, -4) },
    { id: 'INT-08101918-2', customerId: '08101918', channel: 'BRANCH', type: 'COMPLAINT', sentiment: 'NEGATIVE',
      subject: 'Yêu cầu phản hồi khiếu nại', summary: 'Khách hàng đến chi nhánh yêu cầu xử lý sớm, chưa nhận được phản hồi.',
      status: 'OPEN', interactionAt: addDays(reference, -1) },
    { id: 'INT-08102466-1', customerId: '08102466', channel: 'APP', type: 'SERVICE', sentiment: 'NEUTRAL',
      subject: 'Khảo sát định kỳ', summary: 'Không phản hồi khảo sát mức độ hài lòng qua ứng dụng.', status: 'CLOSED',
      interactionAt: addDays(reference, -120) },
    { id: 'INT-08101507-1', customerId: '08101507', channel: 'CALL', type: 'SERVICE', sentiment: 'POSITIVE',
      subject: 'Chăm sóc định kỳ', summary: 'Khách hàng hài lòng với dịch vụ, quan tâm thêm về kênh đầu tư.', status: 'CLOSED',
      interactionAt: addDays(reference, -20) },
    { id: 'INT-08100548-1', customerId: '08100548', channel: 'EMAIL', type: 'SERVICE', sentiment: 'NEUTRAL',
      subject: 'Xác nhận lịch trả nợ', summary: 'Gửi lịch trả nợ vay thế chấp và thấu chi tháng tới.', status: 'CLOSED',
      interactionAt: addDays(reference, -10) },
  ];
  const seededCifs = new Set(curatedInteractions.map((row) => row.customerId!));
  const interactions = [...curatedInteractions, ...generateMockInteractions(msbDataset.customers, reference, seededCifs)];
  await insertChunked(CustomerInteraction, interactions, 200);

  const metrics = await recomputeMetrics(AppDataSource, asOfDate);
  return { customers: customers.length, positions: positions.length, transactions: transactions.length, metrics };
}

if (require.main === module) {
  seedDatabase()
    .then(async (summary) => {
      console.log(`Seed completed: ${summary.customers} customers, ${summary.positions} daily positions, ${summary.transactions} transactions, ${summary.metrics} metric rows`);
      await AppDataSource.destroy();
    })
    .catch(async (error: unknown) => {
      console.error('Seed failed', error instanceof Error ? error.message : 'Unknown error');
      if (AppDataSource.isInitialized) await AppDataSource.destroy();
      process.exitCode = 1;
    });
}
