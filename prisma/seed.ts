import { Prisma, PrismaClient, UserRole, UserStatus } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * Baseline application settings. Every entry is upserted by `key`, so the
 * seed is idempotent and safe to re-run against an existing database.
 */
function baselineSettings(): Array<{ key: string; value: string; description: string }> {
  return [
    {
      key: 'gym.name',
      value: process.env.SEED_GYM_NAME ?? 'Gym CRM',
      description: 'Display name of the gym',
    },
    { key: 'gym.currency', value: 'USD', description: 'Default currency code for money amounts' },
    { key: 'gym.timezone', value: 'UTC', description: 'Timezone used for daily reporting cut-off' },
    {
      key: 'gym.openingHour',
      value: '06:00',
      description: 'Default opening time (HH:mm, local to gym.timezone)',
    },
    {
      key: 'gym.closingHour',
      value: '23:00',
      description: 'Default closing time (HH:mm, local to gym.timezone)',
    },
  ];
}

async function seedSettings(): Promise<number> {
  const settings = baselineSettings();

  for (const setting of settings) {
    await prisma.appSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value, description: setting.description },
      create: setting,
    });
  }

  return settings.length;
}

/**
 * The bootstrap administrator. Without it there is no way to sign in and
 * create the first accounts.
 *
 * An existing admin's password is never overwritten, so re-running the seed
 * cannot reset a password that was deliberately changed.
 */
async function seedAdmin(): Promise<'created' | 'already exists'> {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@gym.local').trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const rounds = Number.parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10);

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return 'already exists';

  await prisma.user.create({
    data: {
      email,
      passwordHash: await hash(password, rounds),
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      firstName: 'System',
      lastName: 'Administrator',
    },
  });

  return 'created';
}

/**
 * A starter plan catalogue covering the shapes the gym sells: unlimited and
 * limited visits, monthly and longer terms.
 *
 * An existing plan is left completely alone, exactly like the admin password —
 * re-running the seed must never undo a price or duration the gym has tuned.
 */
async function seedMembershipPlans(): Promise<number> {
  const plans = [
    {
      name: 'Day Pass',
      description: 'Single visit, valid for one day.',
      durationDays: 1,
      price: '10.00',
      visitLimit: 1,
      displayOrder: 10,
    },
    {
      name: 'Monthly Unlimited',
      description: 'Unlimited visits for 30 days.',
      durationDays: 30,
      price: '49.99',
      visitLimit: null,
      displayOrder: 20,
    },
    {
      name: 'Monthly 12 Visits',
      description: 'Twelve visits to use within 30 days.',
      durationDays: 30,
      price: '34.99',
      visitLimit: 12,
      displayOrder: 30,
    },
    {
      name: 'Quarterly Unlimited',
      description: 'Unlimited visits for 90 days.',
      durationDays: 90,
      price: '129.99',
      visitLimit: null,
      displayOrder: 40,
    },
    {
      name: 'Annual Unlimited',
      description: 'Unlimited visits for a year.',
      durationDays: 365,
      price: '449.00',
      visitLimit: null,
      displayOrder: 50,
    },
  ];

  let created = 0;

  for (const plan of plans) {
    const existing = await prisma.membershipPlan.findUnique({
      where: { name: plan.name },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.membershipPlan.create({
      data: { ...plan, price: new Prisma.Decimal(plan.price) },
    });
    created += 1;
  }

  return created;
}

/**
 * Baseline expense categories so expenses can be filed from day one.
 * Existing categories are left alone, like the plans and the admin password.
 */
async function seedExpenseCategories(): Promise<number> {
  const categories = [
    { name: 'Rent', description: 'Premises rent and service charges' },
    { name: 'Utilities', description: 'Electricity, water, heating, internet' },
    { name: 'Equipment', description: 'Purchase and repair of gym equipment' },
    { name: 'Trainer Salary', description: 'Trainer salaries and commission payouts' },
    { name: 'Staff Salary', description: 'Reception and other staff wages' },
    { name: 'Marketing', description: 'Advertising and promotions' },
    { name: 'Cleaning', description: 'Cleaning services and supplies' },
    { name: 'Maintenance', description: 'Building repairs and servicing' },
    { name: 'Insurance', description: 'Liability and premises insurance' },
    { name: 'Other', description: 'Anything that does not fit another category' },
  ];

  let created = 0;

  for (const category of categories) {
    const existing = await prisma.expenseCategory.findUnique({
      where: { name: category.name },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.expenseCategory.create({ data: category });
    created += 1;
  }

  return created;
}

async function main(): Promise<void> {
  const settingCount = await seedSettings();
  const planCount = await seedMembershipPlans();
  const categoryCount = await seedExpenseCategories();
  const adminState = await seedAdmin();
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@gym.local').trim().toLowerCase();

  console.log(`Seed complete: ${settingCount} application settings upserted.`);
  console.log(`Membership plans: ${planCount} created, ${5 - planCount} already present.`);
  console.log(
    `Expense categories: ${categoryCount} created, ${10 - categoryCount} already present.`,
  );
  console.log(`Admin account ${adminEmail}: ${adminState}.`);

  if (adminState === 'created' && process.env.NODE_ENV !== 'production') {
    console.log('Sign in with the password from SEED_ADMIN_PASSWORD, then change it.');
  }
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
