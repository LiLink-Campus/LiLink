import { validate } from 'class-validator';
import { UpdateContactPreferencesDto } from './dto';

describe('Contact preferences revision guards', () => {
  it.each([undefined, -1, 1.5, '0', 2147483647])(
    'rejects invalid revision %s at the API boundary',
    async (revision) => {
      const dto = Object.assign(new UpdateContactPreferencesDto(), {
        revision,
        preferredContactChannel: 'EMAIL',
        methods: [],
      });
      expect(await validate(dto)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ property: 'revision' }),
        ]),
      );
    },
  );
});
