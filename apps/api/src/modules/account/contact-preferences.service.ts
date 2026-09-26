import {
  EDITABLE_CONTACT_CHANNEL_TYPES,
  type ContactChannelType,
  type EditableContactChannelType,
} from '@lilink/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { type ContactChannelType as PrismaContactChannelType } from '../../common/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CONTACT_METHOD_VALUE_MAX_LENGTH } from '../../common/validation/input-limits';
import { UpdateContactPreferencesDto } from './dto';
const EDITABLE_CONTACT_CHANNEL_SET = new Set<ContactChannelType>(
  EDITABLE_CONTACT_CHANNEL_TYPES,
);
type ContactMethodSummary = {
  type: EditableContactChannelType;
  value: string;
};
function isEditableContactChannel(
  type: ContactChannelType | PrismaContactChannelType,
): type is EditableContactChannelType {
  return EDITABLE_CONTACT_CHANNEL_SET.has(type);
}
function normalizeContactMethodValue(
  type: EditableContactChannelType,
  rawValue: string,
) {
  const value = rawValue.trim();

  if (!value) {
    return null;
  }

  if (value.length > CONTACT_METHOD_VALUE_MAX_LENGTH) {
    throw new BadRequestException('Contact method value is too long.');
  }

  if (type !== 'PHONE') {
    return {
      value,
      normalizedValue: null,
    };
  }

  if (!value.startsWith('+')) {
    throw new BadRequestException(
      'Phone number must use international format.',
    );
  }

  const phoneNumber = parsePhoneNumberFromString(value);

  if (!phoneNumber?.isPossible()) {
    throw new BadRequestException(
      'Phone number must use international format.',
    );
  }

  return {
    value: phoneNumber.number,
    normalizedValue: phoneNumber.number,
  };
}
function normalizeContactPreferencesInput(input: UpdateContactPreferencesDto) {
  const methods = new Map<
    EditableContactChannelType,
    { value: string; normalizedValue: string | null }
  >();

  for (const method of input.methods) {
    if (methods.has(method.type)) {
      throw new BadRequestException('Duplicate contact method type.');
    }

    const normalized = normalizeContactMethodValue(method.type, method.value);
    if (normalized) {
      methods.set(method.type, normalized);
    }
  }

  if (
    isEditableContactChannel(input.preferredContactChannel) &&
    !methods.has(input.preferredContactChannel)
  ) {
    throw new BadRequestException(
      'Selected contact channel must have a value.',
    );
  }

  return methods;
}
@Injectable()
export class ContactPreferencesService {
  constructor(private readonly prisma: PrismaService) {}
  async getContactPreferences(userId: string) {
    // One statement keeps the revision and methods in the same MVCC snapshot.
    const [user] = await this.prisma.$queryRaw<
      Array<{
        email: string;
        preferredContactChannel: PrismaContactChannelType;
        contactPreferencesRevision: number;
        contactMethods: Array<{
          type: PrismaContactChannelType;
          value: string;
        }>;
      }>
    >`
      SELECT u."email", u."preferredContactChannel", u."contactPreferencesRevision",
        COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object('type', c."type", 'value', c."value")
            ORDER BY c."type"
          ) FROM "UserContactMethod" c WHERE c."userId" = u."id"
        ), '[]'::jsonb) AS "contactMethods"
      FROM "User" u WHERE u."id" = ${userId}
    `;

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return {
      email: user.email,
      revision: user.contactPreferencesRevision,
      preferredContactChannel: user.preferredContactChannel,
      methods: user.contactMethods
        .filter((method): method is ContactMethodSummary =>
          isEditableContactChannel(method.type),
        )
        .map((method) => ({
          type: method.type,
          value: method.value,
        })),
    };
  }
  async updateContactPreferences(
    userId: string,
    input: UpdateContactPreferencesDto,
  ) {
    const methods = normalizeContactPreferencesInput(input);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        email: true,
      },
    });
    const omittedMethodTypes = EDITABLE_CONTACT_CHANNEL_TYPES.filter(
      (type) => !methods.has(type),
    );

    const savedMethods = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: {
          id: userId,
          contactPreferencesRevision: input.revision,
          deactivatedAt: null,
        },
        data: {
          preferredContactChannel: input.preferredContactChannel,
          contactPreferencesRevision: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          'Contact preferences have changed. Reload before saving again.',
        );
      }

      if (omittedMethodTypes.length > 0) {
        await tx.userContactMethod.deleteMany({
          where: {
            userId,
            type: {
              in: omittedMethodTypes,
            },
          },
        });
      }

      for (const [type, method] of methods) {
        await tx.userContactMethod.upsert({
          where: {
            userId_type: {
              userId,
              type,
            },
          },
          update: {
            value: method.value,
            normalizedValue: method.normalizedValue,
          },
          create: {
            userId,
            type,
            value: method.value,
            normalizedValue: method.normalizedValue,
          },
        });
      }

      return tx.userContactMethod.findMany({
        where: { userId },
        select: {
          type: true,
          value: true,
        },
        orderBy: {
          type: 'asc',
        },
      });
    });

    return {
      email: user.email,
      revision: input.revision + 1,
      preferredContactChannel: input.preferredContactChannel,
      methods: savedMethods
        .filter((method): method is ContactMethodSummary =>
          isEditableContactChannel(method.type),
        )
        .map((method) => ({
          type: method.type,
          value: method.value,
        })),
    };
  }
}
