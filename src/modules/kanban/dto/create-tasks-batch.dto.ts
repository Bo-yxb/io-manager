import { IsString, IsNotEmpty, IsArray, ValidateNested, IsOptional, IsBoolean, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class BatchTaskItemDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  assignee?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsArray()
  @IsOptional()
  dependsOn?: string[];

  @IsNumber()
  @IsOptional()
  timeoutMinutes?: number;
}

export class CreateTasksBatchDto {
  @IsString()
  @IsNotEmpty()
  projectId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchTaskItemDto)
  tasks!: BatchTaskItemDto[];

  @IsBoolean()
  @IsOptional()
  autoAssign?: boolean;
}
