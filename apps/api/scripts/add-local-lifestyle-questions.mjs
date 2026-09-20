import { LIFESTYLE_QUESTIONS } from '@lilink/shared';
import { loadPrismaClientModule } from './prisma-client.mjs';

const target = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
if (process.env.APP_ENV !== 'development' || !target ||
    !['postgres', 'localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
    target.pathname !== '/lilink' || !process.argv.includes('--apply')) {
  throw new Error('Requires local development lilink database and --apply.');
}
const { PrismaClient, createPrismaClientOptions } = await loadPrismaClientModule();
const prisma = new PrismaClient(createPrismaClientOptions());
try {
  const result = await prisma.$transaction(async tx => {
    const current = await tx.questionnaireVersion.findFirstOrThrow({
      where: { isCurrent: true }, include: { questions: { orderBy: { order: 'asc' } } },
    });
    const missing = LIFESTYLE_QUESTIONS.filter(question => !current.questions.some(existing => existing.key === question.key));
    if (!missing.length) return { added: 0 };
    const maxOrder = Math.max(0, ...current.questions.map(question => question.order));
    await tx.questionnaireVersion.update({ where: { id: current.id }, data: { isCurrent: false } });
    await tx.questionnaireVersion.create({ data: {
      title: current.title, description: current.description, isCurrent: true,
      questions: { create: [
        ...current.questions.map(({ key, prompt, type, order, weight, required, selectionLimit, options }) =>
          ({ key, prompt, type, order, weight, required, selectionLimit, options })),
        ...missing.map((question, index) => ({ key: question.key, prompt: question.prompt,
          type: 'SINGLE_SELECT', order: maxOrder + index + 1, weight: 0, required: true,
          options: question.options.map(label => ({ value: label, label })),
        })),
      ] },
    } });
    return { added: missing.length, preserved: current.questions.length };
  });
  console.log(JSON.stringify(result));
} finally { await prisma.$disconnect(); }
