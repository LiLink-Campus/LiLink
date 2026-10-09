import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { RegisterDto } from './dto';
import { UpdateProfileDto } from '../account/dto';

const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});
const registration = {
  email: 'student@example.com',
  code: '123456',
  password: 'ExamplePass123',
  acceptedTerms: true,
};

describe('real-name collection removal', () => {
  it('accepts nickname setting through the authenticated profile contract', async () => {
    await expect(
      pipe.transform(
        { displayName: '林和' },
        { type: 'body', metatype: UpdateProfileDto },
      ),
    ).resolves.toMatchObject({ displayName: '林和' });
  });
  it('rejects a legacy real-name field during registration', async () => {
    await expect(
      pipe.transform(
        { ...registration, fullName: 'Synthetic Name' },
        { type: 'body', metatype: RegisterDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects real-name updates through the profile API', async () => {
    await expect(
      pipe.transform(
        { fullName: 'Synthetic Name' },
        { type: 'body', metatype: UpdateProfileDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
