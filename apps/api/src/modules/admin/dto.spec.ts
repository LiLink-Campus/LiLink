import { plainToInstance } from 'class-transformer';
import { validate, validateSync } from 'class-validator';
import {
  AdminUpdateUserDto,
  BatchReviewReportsDto,
  CreateSchoolDto,
  ListSchoolsQueryDto,
  QuestionOptionDto,
  UpdateUserReferralLimitDto,
  UpsertQuestionDto,
} from './dto';
import {
  ADMIN_LIST_PAGE_MAX,
  ADMIN_LIST_PAGE_SIZE_MAX,
  ADMIN_QUESTION_OPTIONS_MAX_ITEMS,
  ADMIN_REPORT_BATCH_MAX_ITEMS,
  ADMIN_SCHOOL_DOMAIN_MAX_ITEMS,
  ADMIN_SCHOOL_DOMAIN_MAX_LENGTH,
  ADMIN_SEARCH_MAX_LENGTH,
} from '../../common/validation/input-limits';

describe('admin DTOs', () => {
  describe('AdminUpdateUserDto profile fields', () => {
    const options = { whitelist: true, forbidNonWhitelisted: true };

    it('accepts the editable profile fields and explicit clearing', async () => {
      for (const value of ['Profile text', null]) {
        const dto = plainToInstance(AdminUpdateUserDto, {
          headline: value,
          bio: value,
          schoolYear: value,
          programName: value,
        });
        expect(await validate(dto, options)).toHaveLength(0);
      }
    });

    it.each([
      ['headline', 160],
      ['bio', 1000],
      ['schoolYear', 80],
      ['programName', 80],
    ])('rejects invalid %s values', async (field, limit) => {
      for (const value of [123, 'x'.repeat(Number(limit) + 1)]) {
        const dto = plainToInstance(AdminUpdateUserDto, { [field]: value });
        expect(await validate(dto, options)).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ property: field }),
          ]),
        );
      }
    });

    it('continues rejecting fields outside the admin editing contract', async () => {
      const dto = plainToInstance(AdminUpdateUserDto, {
        passwordHash: 'unexpected',
      });
      expect(await validate(dto, options)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ property: 'passwordHash' }),
        ]),
      );
    });
  });

  it('rejects oversized list query controls', async () => {
    const dto = Object.assign(new ListSchoolsQueryDto(), {
      page: ADMIN_LIST_PAGE_MAX + 1,
      pageSize: ADMIN_LIST_PAGE_SIZE_MAX + 1,
      search: 'S'.repeat(ADMIN_SEARCH_MAX_LENGTH + 1),
    });

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'page' }),
        expect.objectContaining({ property: 'pageSize' }),
        expect.objectContaining({ property: 'search' }),
      ]),
    );
  });

  it('rejects oversized admin mutation arrays', async () => {
    const schoolDto = Object.assign(new CreateSchoolDto(), {
      name: 'Example School',
      slug: 'example-school',
      domains: [
        ...Array.from(
          { length: ADMIN_SCHOOL_DOMAIN_MAX_ITEMS + 1 },
          (_, index) => `example-${index}.edu`,
        ),
        `${'a'.repeat(ADMIN_SCHOOL_DOMAIN_MAX_LENGTH + 1)}.edu`,
      ],
    });
    const option = Object.assign(new QuestionOptionDto(), {
      label: 'Option',
      value: 'option',
    });
    const questionDto = Object.assign(new UpsertQuestionDto(), {
      key: 'question_key',
      prompt: 'Question prompt',
      type: 'SINGLE_SELECT',
      options: Array.from(
        { length: ADMIN_QUESTION_OPTIONS_MAX_ITEMS + 1 },
        () => option,
      ),
      order: 1,
    });
    const reportsDto = Object.assign(new BatchReviewReportsDto(), {
      reportIds: Array.from(
        { length: ADMIN_REPORT_BATCH_MAX_ITEMS + 1 },
        (_, index) => `report-${index}`,
      ),
      status: 'RESOLVED',
    });

    await expect(validate(schoolDto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'domains' }),
      ]),
    );
    await expect(validate(questionDto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'options' }),
      ]),
    );
    await expect(validate(reportsDto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'reportIds' }),
      ]),
    );
  });

  describe('UpdateUserReferralLimitDto', () => {
    function validationErrorsFor(value: unknown) {
      const dto = plainToInstance(UpdateUserReferralLimitDto, {
        nonEduReferralLimit: value,
      });
      return validateSync(dto);
    }

    it.each(['', '   ', false])(
      'rejects malformed quota input that would otherwise coerce to zero: %p',
      (value) => {
        expect(validationErrorsFor(value)).not.toHaveLength(0);
      },
    );

    it.each([0, 5, '0', '5'])('accepts integer quota input: %p', (value) => {
      expect(validationErrorsFor(value)).toHaveLength(0);
    });
  });
});
