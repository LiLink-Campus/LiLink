import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMatchLeadDto } from './match-leads.module';

describe('Match lead input', () => {
  it('normalizes international formatting', async () => {
    const dto = plainToInstance(CreateMatchLeadDto, {
      phone: '+44 (7700) 900-123',
      consent: true,
    });
    expect(dto.phone).toBe('+447700900123');
    expect(await validate(dto)).toHaveLength(0);
  });
  it.each([
    { phone: '123', consent: true },
    { phone: '+447700900123', consent: false },
    { phone: '+447700900123' },
    { phone: {}, consent: true },
  ])('rejects invalid input or missing consent', async (input) => {
    expect(
      (await validate(plainToInstance(CreateMatchLeadDto, input))).length,
    ).toBeGreaterThan(0);
  });
});
