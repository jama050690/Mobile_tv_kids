import { PartialType } from '@nestjs/swagger';
import { AgeGroup, StreamType, UrlHealth } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const URL_OPTS = { protocols: ['https', 'http'], require_protocol: true, require_tld: true };

export class CreateProgramDto {
  @IsString()
  @Length(1, 200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** Asosiy video URL (.m3u8 yoki .mp4) */
  @IsUrl(URL_OPTS)
  @MaxLength(2048)
  videoUrl: string;

  /** Zaxira URL — asosiysi ishlamasa ishlatiladi */
  @IsOptional()
  @IsUrl(URL_OPTS)
  @MaxLength(2048)
  fallbackUrl?: string;

  /** Berilmasa URL kengaytmasidan aniqlanadi */
  @IsOptional()
  @IsEnum(StreamType)
  streamType?: StreamType;

  /** Jonli HLS oqim (seek qilinmaydi) */
  @IsOptional()
  @IsBoolean()
  isLiveStream?: boolean;

  /** Davomiylik, soniyada (1 sek — 24 soat) */
  @IsInt()
  @Min(1)
  @Max(86_400)
  durationSec: number;

  @IsOptional()
  @IsUrl(URL_OPTS)
  @MaxLength(2048)
  thumbnailUrl?: string;

  @IsOptional()
  @IsEnum(AgeGroup)
  ageRating?: AgeGroup;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Saqlangandan keyin URL'ni avtomatik tekshirish (default true) */
  @IsOptional()
  @IsBoolean()
  checkUrl?: boolean;
}

export class UpdateProgramDto extends PartialType(CreateProgramDto) {}

export class ListProgramsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Transform(({ obj, key }) => (obj[key] === 'true' ? true : obj[key] === 'false' ? false : obj[key]))
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(AgeGroup)
  ageRating?: AgeGroup;

  @IsOptional()
  @IsEnum(StreamType)
  streamType?: StreamType;

  @IsOptional()
  @IsEnum(UrlHealth)
  urlStatus?: UrlHealth;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 50;
}

export class CheckUrlDto {
  @IsUrl(URL_OPTS)
  @MaxLength(2048)
  url: string;

  @IsOptional()
  @IsEnum(StreamType)
  streamType?: StreamType;
}
