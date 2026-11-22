import { OmitType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { IsTimezone } from '../../common/validators/is-timezone.validator';

export class CreateRegionDto {
  /** ISO 3166-1 alpha-2 (UZ, KZ, RU, US ...) */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z]{2}$/, { message: "code 2 harfli ISO davlat kodi bo'lishi kerak (masalan UZ)" })
  code: string;

  @IsString()
  @Length(2, 100)
  name: string;

  @IsTimezone()
  defaultTimezone: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsTimezone({ each: true })
  timezones?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateRegionDto extends PartialType(OmitType(CreateRegionDto, ['code'] as const)) {}

export class TimezoneQueryDto {
  /** IANA timezone (masalan Asia/Tashkent). Berilmasa country yoki server default ishlatiladi */
  @IsOptional()
  @IsTimezone()
  tz?: string;

  /** ISO davlat kodi — tz berilmasa davlatning standart timezone'i olinadi */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z]{2}$/)
  country?: string;
}

export class ResolveRegionQueryDto {
  @IsString()
  @MaxLength(64)
  @IsTimezone()
  tz: string;
}
