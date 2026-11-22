import { PartialType } from '@nestjs/swagger';
import { AgeGroup } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUrl, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { SLUG_REGEX } from '../../common/utils/slug.util';

export class CreateChannelDto {
  @IsString()
  @Length(2, 120)
  title: string;

  /** Berilmasa title'dan avtomatik yasaladi */
  @IsOptional()
  @Matches(SLUG_REGEX, { message: "slug faqat kichik lotin harflari, raqam va '-' dan iborat bo'lsin" })
  @MaxLength(80)
  slug?: string;

  /** Kanal tartib raqami (1, 2, 3 ...). Berilmasa oxirgisidan keyingi raqam */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9999)
  number?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  @MaxLength(2048)
  logoUrl?: string;

  @IsOptional()
  @IsEnum(AgeGroup)
  ageGroup?: AgeGroup;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateChannelDto extends PartialType(CreateChannelDto) {}

export class SetActiveDto {
  @IsBoolean()
  isActive: boolean;
}

export class PublicChannelsQueryDto {
  /** Yosh toifasi bo'yicha filtr (ALL kanallar ham qaytadi) */
  @IsOptional()
  @IsEnum(AgeGroup)
  ageGroup?: AgeGroup;
}
