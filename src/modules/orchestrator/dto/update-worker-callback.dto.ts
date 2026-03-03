import { IsString, IsUrl, IsOptional } from 'class-validator';

export class UpdateWorkerCallbackDto {
  @IsString()
  @IsUrl({ require_tld: false })
  @IsOptional()
  callbackUrl?: string;
}
