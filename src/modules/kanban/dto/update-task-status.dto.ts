import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class UpdateTaskStatusDto {
  @IsString()
  @IsNotEmpty()
  status!: string;

  @IsString()
  @IsOptional()
  note?: string;
}
